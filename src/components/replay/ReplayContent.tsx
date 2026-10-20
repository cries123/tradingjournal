import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, Plus, RotateCcw, SkipForward, X } from 'lucide-react';
import type { Trade } from '../../types';
import { useSettings } from '../../context/useSettings';
import { formatCurrency } from '../../utils/format';
import { aggregateBars, chartedUnderlying, contractLabel, nextTradingDay, previousTradingDay, replayAvailable, replayAvailableAt, vwapLine, type Bar, type Right } from '../../utils/marketReplay';
import { easternClock } from '../../utils/replayClock';
import { handPicked, replayPlan, sameContract, type ReplayContractRequest } from '../../utils/replayTrades';
import { applyFill, EMPTY_BOOK, flatten, multiplierFor, unrealized, type PracticeBook } from '../../utils/replayPractice';
import {
  actualFills,
  cursorForCandle,
  estimatedFillTimes,
  markPrice,
  nextCursor,
  revealed,
  SPEEDS,
  strikeStep,
  suggestedStrike,
  TIMEFRAMES,
  type Speed,
  type Timeframe,
} from '../../utils/replayView';
import { fetchReplay, ReplayError, type ReplayData } from '../../services/marketReplay';
import { SegmentedControl } from '../ui/SegmentedControl';
import type { ChartMarker } from './ReplayChart';

const ReplayChart = lazy(() => import('./ReplayChart'));

/** Hand-picked contracts on top of the traded ones; the server takes twelve at most. */
const MAX_CONTRACTS = 12;

export interface ReplayContentProps {
  /** Every trade in view, so stepping to another day finds that day's trades. */
  trades: Trade[];
  date: string;
  onDateChange: (date: string) => void;
  onBack: () => void;
  /** Bars to draw without asking the server, for previews and tests. */
  preload?: ReplayData;
}

interface Instrument {
  id: string;
  label: string;
  sub: string;
  kind: 'stock' | 'option';
  bars: Bar[];
  /** Index into the request's contracts, for options. */
  contract: number | null;
  traded: boolean;
}

function longDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function availableAtWords(date: string): string {
  const at = replayAvailableAt(date);
  const day = at.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'short', day: 'numeric' });
  return `${day} at ${easternClock(Math.floor(at.getTime() / 1000))} ET`;
}

/**
 * Market replay: a past session bar by bar, TradingView style, with practice trades on it.
 *
 * The day's own contracts come first, then anything picked by hand on that day. Click a candle to
 * start the replay there; the rest of the day stays hidden until it plays. Practice fills happen at
 * the close of the candle on screen and are never saved: this is a rehearsal, not the journal.
 */
export function ReplayContent({ trades, date, onDateChange, onBack, preload }: ReplayContentProps) {
  const { settings } = useSettings();
  const fmt = (n: number) => formatCurrency(n, settings.currency);
  const [now] = useState(() => Date.now());
  const available = replayAvailable(date, new Date(now));
  const nextDay = nextTradingDay(date);
  const canGoForward = replayAvailable(nextDay, new Date(now));

  const dayTrades = useMemo(() => trades.filter((t) => t.date === date), [trades, date]);
  const plan = useMemo(() => replayPlan(dayTrades), [dayTrades]);
  const [extra, setExtra] = useState<ReplayContractRequest[]>([]);
  const contracts = useMemo(
    () => [...plan.contracts, ...extra.filter((e) => !plan.contracts.some((c) => sameContract(c, e)))].slice(0, MAX_CONTRACTS),
    [plan.contracts, extra],
  );
  const optionUnderlying = plan.contracts[0]?.underlying ?? plan.underlying ?? 'SPY';
  const requestKey = JSON.stringify([date, optionUnderlying, contracts]);

  /* The answer is kept with the request it answers, so a stale answer can never draw a new day. */
  const [result, setResult] = useState<{ key: string; data?: ReplayData; error?: ReplayError } | null>(
    preload ? { key: requestKey, data: preload } : null,
  );
  useEffect(() => {
    if (!available || preload) return;
    let cancelled = false;
    fetchReplay(date, optionUnderlying, contracts)
      .then((data) => {
        if (!cancelled) setResult({ key: requestKey, data });
      })
      .catch((err: unknown) => {
        if (!cancelled) setResult({ key: requestKey, error: err instanceof ReplayError ? err : new ReplayError('Market data is unavailable right now.', 0) });
      });
    return () => {
      cancelled = true;
    };
  }, [available, preload, date, optionUnderlying, contracts, requestKey]);
  const current = result?.key === requestKey ? result : null;
  /* While a picked contract loads, the day already on screen stays there rather than blanking. */
  const data = current?.data ?? (result?.data?.date === date ? result.data : null) ?? null;

  const instruments = useMemo<Instrument[]>(() => {
    if (!data) return [];
    const list: Instrument[] = [];
    data.contracts.forEach((c) => {
      const req = contracts[c.index];
      if (!req) return;
      list.push({
        id: `c${c.index}`,
        label: c.osi ? contractLabel(c.osi) : `${req.underlying} ${req.strike}${req.right}`,
        sub: c.index < plan.contracts.length ? 'You traded this' : 'Picked',
        kind: 'option',
        bars: c.bars,
        contract: c.index,
        traded: c.index < plan.contracts.length,
      });
    });
    if (data.underlying) {
      list.push({
        id: 'u',
        label: data.underlying.symbol,
        sub: data.underlying.proxyFor ? `Drawn for ${data.underlying.proxyFor}` : 'Underlying',
        kind: 'stock',
        bars: data.underlying.bars,
        contract: null,
        traded: false,
      });
    }
    return list;
  }, [data, contracts, plan.contracts.length]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = instruments.find((i) => i.id === selectedId) ?? instruments.find((i) => i.bars.length > 0) ?? instruments[0] ?? null;

  const [timeframe, setTimeframe] = useState<Timeframe>(1);
  const [showVwap, setShowVwap] = useState(true);
  const [showEstimates, setShowEstimates] = useState(true);
  const [cursor, setCursor] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [books, setBooks] = useState<Record<string, PracticeBook>>({});
  const [qty, setQty] = useState(1);
  const [picking, setPicking] = useState(false);

  const sessionStart = data?.sessionStart ?? 0;
  const sessionEnd = data?.sessionEnd ?? 0;

  const firstCandle = cursorForCandle(Math.floor(sessionStart / (timeframe * 60)) * timeframe * 60, timeframe);
  /* The cursor as of the last render, for the timer: the next step is decided outside a state
     updater so that stopping at the close is not a side effect React might run twice. */
  const cursorNow = useRef(cursor);
  useEffect(() => {
    cursorNow.current = cursor;
  }, [cursor]);

  const step = useCallback(() => {
    const next = nextCursor(cursorNow.current ?? firstCandle, timeframe, sessionEnd);
    if (next === null) {
      setPlaying(false);
      return;
    }
    cursorNow.current = next;
    setCursor(next);
  }, [firstCandle, sessionEnd, timeframe]);

  // Playback: one candle per tick at the chosen speed. Stops itself at the close.
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(step, 1000 / speed);
    return () => window.clearInterval(id);
  }, [playing, speed, step]);

  // Space plays and pauses, the right arrow steps, the way replay works on TradingView.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (cursor === null) return;
      if (e.key === ' ') {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setPlaying(false);
        step();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cursor, step]);

  const minuteBars = useMemo(() => (selected ? revealed(selected.bars, cursor) : []), [selected, cursor]);
  const shownBars = useMemo(() => aggregateBars(minuteBars.map((b) => ({ ...b })), timeframe), [minuteBars, timeframe]);
  const vwap = useMemo(() => (showVwap ? vwapLine(shownBars) : null), [showVwap, shownBars]);

  const selectedTrades = useMemo(
    () => (selected?.contract == null ? [] : dayTrades.filter((t) => plan.tradeContract.get(t.id) === selected.contract)),
    [selected, dayTrades, plan.tradeContract],
  );
  const estimates = useMemo(
    () => (showEstimates && selected ? estimatedFillTimes(selectedTrades, selected.bars, timeframe, cursor) : []),
    [showEstimates, selected, selectedTrades, timeframe, cursor],
  );

  const book = (selected && books[selected.id]) || EMPTY_BOOK;
  const multiplier = multiplierFor(selected?.kind ?? 'stock');
  const mark = selected ? markPrice(selected.bars, cursor) : null;

  const markers = useMemo<ChartMarker[]>(() => {
    const size = timeframe * 60;
    const bucket = (t: number) => Math.floor(t / size) * size;
    const practice: ChartMarker[] = book.fills.map((f) => ({
      time: bucket(f.time),
      side: f.side,
      text: `${f.side === 'buy' ? 'B' : 'S'} ${f.qty} @${f.price}`,
      kind: 'practice',
    }));
    const actual: ChartMarker[] = actualFills(selectedTrades, date, cursor).map((f) => ({ ...f, time: bucket(f.time), kind: 'actual' }));
    return [...actual, ...practice];
  }, [book.fills, selectedTrades, date, cursor, timeframe]);

  const trade = (side: 'buy' | 'sell') => {
    if (!selected || cursor === null || mark === null) return;
    setBooks((b) => ({ ...b, [selected.id]: applyFill(b[selected.id] ?? EMPTY_BOOK, side, qty, mark, cursor, multiplier) }));
  };
  const close = () => {
    if (!selected || cursor === null || mark === null) return;
    setBooks((b) => ({ ...b, [selected.id]: flatten(b[selected.id] ?? EMPTY_BOOK, mark, cursor, multiplier) }));
  };

  const underlyingBars = data?.underlying?.bars ?? [];
  const underlyingMark = markPrice(underlyingBars, cursor ?? (underlyingBars[0]?.time ?? null));
  const proxy = data?.underlying?.proxyFor ?? null;

  const changeDate = (d: string) => {
    setPlaying(false);
    setCursor(null);
    setBooks({});
    setExtra([]);
    setSelectedId(null);
    onDateChange(d);
  };

  const btn = 'inline-flex h-8 items-center gap-1.5 rounded-[9px] border border-border px-2.5 text-xs text-text-secondary hover:text-text-primary disabled:opacity-40 focus-ring';
  const charted = chartedUnderlying(optionUnderlying);

  return (
    <div className="flex flex-col gap-3 pb-4 md:gap-4">
      <header className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] pb-3 pt-0.5 md:gap-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-[13px] text-accent focus-ring rounded">
          <ChevronLeft size={15} aria-hidden /> Day
        </button>
        <h1 className="text-lg font-bold">Market replay</h1>
        <span className="text-[13px] text-text-secondary">{longDate(date)}</span>
        <span className="flex items-center gap-1">
          <button type="button" className={btn} aria-label="Previous trading day" onClick={() => changeDate(previousTradingDay(date))}>
            <ChevronLeft size={14} />
          </button>
          <button type="button" className={btn} aria-label="Next trading day" disabled={!canGoForward} onClick={() => changeDate(nextDay)}>
            <ChevronRight size={14} />
          </button>
        </span>
        <span className="flex-1" />
        <SegmentedControl
          label="Timeframe"
          value={String(timeframe)}
          onChange={(v) => setTimeframe(Number(v) as Timeframe)}
          options={TIMEFRAMES.map((t) => ({ id: String(t), label: `${t}m` }))}
        />
        <button type="button" onClick={() => setShowVwap((v) => !v)} aria-pressed={showVwap} className={`${btn} ${showVwap ? 'border-accent/40 text-accent' : ''}`}>
          VWAP
        </button>
      </header>

      {!available ? (
        <section className="panel-card p-6 text-center">
          <p className="text-[15px] font-semibold">This day opens for replay {availableAtWords(date)}.</p>
          <p className="mt-1.5 text-[13px] text-text-secondary">
            Replay uses market data from the day after it happens, which is what keeps it inside the exchange's rules for showing it to you.
          </p>
        </section>
      ) : current?.error ? (
        <section className="panel-card p-6 text-center">
          <p className="text-[15px] font-semibold">{current.error.message}</p>
        </section>
      ) : !data ? (
        <section className="panel-card grid h-[420px] place-items-center text-[13px] text-text-secondary">Loading the session…</section>
      ) : (
        <>
          {/* What to replay: the contracts traded that day first, the underlying, then any picked by hand. */}
          <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Instrument">
            {instruments.map((i) => {
              const on = selected?.id === i.id;
              return (
                <button
                  key={i.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setSelectedId(i.id)}
                  className={`rounded-[10px] border px-3 py-1.5 text-left focus-ring ${on ? 'border-accent/50 bg-accent/10' : 'border-border hover:border-white/20'}`}
                >
                  <span className={`block text-[13px] font-semibold ${on ? 'text-accent' : ''}`}>{i.label}</span>
                  <span className="block text-[11px] text-text-secondary">{i.bars.length === 0 ? 'No trades that day' : i.sub}</span>
                </button>
              );
            })}
            {charted && contracts.length < MAX_CONTRACTS && (
              <button type="button" onClick={() => setPicking((p) => !p)} className={`${btn} h-auto py-2`} aria-expanded={picking}>
                {picking ? <X size={13} /> : <Plus size={13} />} Contract
              </button>
            )}
          </div>

          {picking && (
            <ContractPicker
              underlying={optionUnderlying}
              suggestion={suggestedStrike(underlyingMark, optionUnderlying)}
              approximate={proxy !== null}
              onAdd={(right, strike) => {
                setExtra((e) => [...e, handPicked(optionUnderlying, date, right, strike)]);
                setPicking(false);
              }}
            />
          )}

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-4">
            <section className="panel-card min-w-0 p-0">
              <div className="h-[320px] md:h-[460px]">
                <Suspense fallback={<div className="grid h-full place-items-center text-[13px] text-text-secondary">Loading the chart…</div>}>
                  <ReplayChart
                    bars={shownBars}
                    vwap={vwap}
                    markers={markers}
                    estimates={estimates}
                    fitKey={`${date}|${selected?.id}|${timeframe}`}
                    following={cursor !== null}
                    onPickTime={(t) => {
                      setPlaying(false);
                      setCursor(cursorForCandle(t, timeframe));
                    }}
                  />
                </Suspense>
              </div>

              {/* The replay controls, under the chart where TradingView puts them. */}
              <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] px-3 py-2.5">
                {cursor === null ? (
                  <>
                    <button type="button" className="btn-primary inline-flex h-8 items-center gap-1.5 px-3 text-xs font-semibold focus-ring" onClick={() => setCursor(firstCandle)}>
                      <Play size={13} aria-hidden /> Replay from the open
                    </button>
                    <span className="text-xs text-text-secondary">or click any candle to start there.</span>
                  </>
                ) : (
                  <>
                    <button type="button" className="btn-primary inline-flex h-8 w-20 items-center justify-center gap-1.5 text-xs font-semibold focus-ring" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'}>
                      {playing ? <Pause size={13} aria-hidden /> : <Play size={13} aria-hidden />} {playing ? 'Pause' : 'Play'}
                    </button>
                    <button type="button" className={btn} onClick={() => { setPlaying(false); step(); }} aria-label="Step one candle">
                      <SkipForward size={13} aria-hidden /> Step
                    </button>
                    <span className="flex overflow-hidden rounded-[9px] border border-border" role="radiogroup" aria-label="Speed">
                      {SPEEDS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          role="radio"
                          aria-checked={speed === s}
                          onClick={() => setSpeed(s)}
                          className={`px-2 py-1 text-xs tabular-nums focus-ring ${speed === s ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:text-text-primary'}`}
                        >
                          {s}x
                        </button>
                      ))}
                    </span>
                    <span className="font-semibold tabular-nums text-[13px]">{easternClock(cursor)} ET</span>
                    <span className="h-1 min-w-[60px] flex-1 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden>
                      <span className="block h-full bg-accent/70" style={{ width: `${Math.min(100, Math.max(0, ((cursor - sessionStart) / Math.max(1, sessionEnd - sessionStart)) * 100))}%` }} />
                    </span>
                    <button type="button" className={btn} onClick={() => { setPlaying(false); setCursor(null); }}>
                      Show the whole day
                    </button>
                  </>
                )}
              </div>
              {proxy && (
                <p className="border-t border-white/[0.06] px-3 py-2 text-[11.5px] text-text-secondary">
                  {proxy} is drawn as {data.underlying?.symbol}, which tracks it at about a tenth of the price.
                </p>
              )}
            </section>

            <aside className="flex min-w-0 flex-col gap-3 xl:gap-4">
              <PracticePanel
                book={book}
                mark={mark}
                multiplier={multiplier}
                qty={qty}
                onQty={setQty}
                replaying={cursor !== null}
                onBuy={() => trade('buy')}
                onSell={() => trade('sell')}
                onClose={close}
                onReset={() => selected && setBooks((b) => ({ ...b, [selected.id]: EMPTY_BOOK }))}
                fmt={fmt}
              />

              {selected?.traded && (
                <section className="panel-card p-4">
                  <h2 className="text-[13px] font-medium text-text-secondary">Your trades that day</h2>
                  <ul className="mt-2 space-y-1.5">
                    {selectedTrades.map((t) => (
                      <li key={t.id} className="flex items-baseline justify-between gap-2 text-[12.5px]">
                        <span className="tabular-nums">
                          {t.side === 'short' ? 'Sold' : 'Bought'} {t.quantity ?? '—'} @ {t.tradePrice ?? '—'} → {t.exitPrice ?? '—'}
                          <span className="ml-1.5 text-text-secondary">{t.entryTime ? t.entryTime.slice(0, 5) : 'no time'}</span>
                        </span>
                        <span className={`tabular-nums ${t.pnl >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>{fmt(t.pnl)}</span>
                      </li>
                    ))}
                  </ul>
                  {selectedTrades.some((t) => !t.entryTime) && (
                    <label className="mt-3 flex items-start gap-2 text-[11.5px] text-text-secondary">
                      <input type="checkbox" checked={showEstimates} onChange={(e) => setShowEstimates(e.target.checked)} className="mt-0.5 accent-[var(--color-accent)]" />
                      <span>
                        Shade the candles where these fills could have happened. Your broker sends dates without fill times, so the shading is an
                        estimate from your prices, not the real time.
                      </span>
                    </label>
                  )}
                </section>
              )}
            </aside>
          </div>

          <p className="text-[11px] text-text-secondary">
            One-minute bars from OPRA and Databento, shown the trading day after. Practice trades fill at the close of the candle on screen,
            with no commission, and are not saved to your journal.
          </p>
        </>
      )}
    </div>
  );
}

function PracticePanel({
  book,
  mark,
  multiplier,
  qty,
  onQty,
  replaying,
  onBuy,
  onSell,
  onClose,
  onReset,
  fmt,
}: {
  book: PracticeBook;
  mark: number | null;
  multiplier: number;
  qty: number;
  onQty: (n: number) => void;
  replaying: boolean;
  onBuy: () => void;
  onSell: () => void;
  onClose: () => void;
  onReset: () => void;
  fmt: (n: number) => string;
}) {
  const open = mark === null ? 0 : unrealized(book, mark, multiplier);
  const tone = (n: number) => (n > 0 ? 'text-profit-bright' : n < 0 ? 'text-loss-bright' : 'text-text-primary');
  const can = replaying && mark !== null;
  return (
    <section className="panel-card p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[13px] font-medium text-text-secondary">Practice trade</h2>
        {book.fills.length > 0 && (
          <button type="button" onClick={onReset} className="inline-flex items-center gap-1 text-[11.5px] text-text-secondary hover:text-text-primary focus-ring rounded">
            <RotateCcw size={11} aria-hidden /> Reset
          </button>
        )}
      </div>
      {!replaying && <p className="mt-2 text-[12.5px] text-text-secondary">Start the replay to trade it. The future stays hidden until it plays.</p>}
      <div className="mt-3 flex items-center gap-2">
        <label className="text-xs text-text-secondary" htmlFor="practice-qty">
          Qty
        </label>
        <input
          id="practice-qty"
          type="number"
          min={1}
          value={qty}
          onChange={(e) => onQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
          className="input-field w-20 py-1.5 text-[16px] md:text-sm"
        />
        <span className="ml-auto text-xs tabular-nums text-text-secondary">{mark === null ? '' : `Last ${mark}`}</span>
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-2">
        <button type="button" disabled={!can} onClick={onBuy} className="h-10 rounded-xl bg-profit-bright/15 text-sm font-semibold text-profit-bright hover:bg-profit-bright/25 disabled:opacity-40 focus-ring">
          Buy
        </button>
        <button type="button" disabled={!can} onClick={onSell} className="h-10 rounded-xl bg-loss-bright/15 text-sm font-semibold text-loss-bright hover:bg-loss-bright/25 disabled:opacity-40 focus-ring">
          Sell
        </button>
        <button type="button" disabled={!can || book.qty === 0} onClick={onClose} className="h-10 rounded-xl border border-border text-sm text-text-secondary hover:text-text-primary disabled:opacity-40 focus-ring">
          Close
        </button>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs text-text-secondary">
        <div>
          <dt>Position</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-text-primary">{book.qty === 0 ? 'Flat' : `${book.qty > 0 ? 'Long' : 'Short'} ${Math.abs(book.qty)}`}</dd>
          {book.qty !== 0 && <dd className="text-[11px] tabular-nums">at {Math.round(book.avgPrice * 100) / 100}</dd>}
        </div>
        <div>
          <dt>Open P&amp;L</dt>
          <dd className={`mt-0.5 text-sm font-semibold tabular-nums ${tone(open)}`}>{fmt(open)}</dd>
        </div>
        <div>
          <dt>Closed P&amp;L</dt>
          <dd className={`mt-0.5 text-sm font-semibold tabular-nums ${tone(book.realized)}`}>{fmt(book.realized)}</dd>
        </div>
      </dl>
      {book.fills.length > 0 && (
        <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto border-t border-white/[0.06] pt-2 text-[12px]">
          {[...book.fills].reverse().map((f, i) => (
            <li key={`${f.time}-${i}`} className="flex justify-between gap-2 tabular-nums">
              <span>
                <span className="text-text-secondary">{easternClock(f.time)}</span> {f.side === 'buy' ? 'Bought' : 'Sold'} {f.qty} @ {f.price}
              </span>
              {f.realized !== 0 && <span className={tone(f.realized)}>{fmt(f.realized)}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ContractPicker({
  underlying,
  suggestion,
  approximate,
  onAdd,
}: {
  underlying: string;
  suggestion: number | null;
  approximate: boolean;
  onAdd: (right: Right, strike: number) => void;
}) {
  const stepBy = strikeStep(underlying);
  const [right, setRight] = useState<Right>('C');
  const [strike, setStrike] = useState<number>(suggestion ?? 0);
  return (
    <section className="panel-card flex flex-wrap items-center gap-2 p-3" aria-label="Pick a contract">
      <span className="text-[13px] font-semibold">{underlying} 0DTE</span>
      <SegmentedControl
        label="Call or put"
        value={right}
        onChange={(r) => setRight(r as Right)}
        options={[
          { id: 'C', label: 'Call' },
          { id: 'P', label: 'Put' },
        ]}
      />
      <span className="flex items-center gap-1">
        <button type="button" aria-label="Lower strike" onClick={() => setStrike((s) => Math.max(stepBy, s - stepBy))} className="h-8 w-8 rounded-[9px] border border-border focus-ring">
          −
        </button>
        <input
          type="number"
          aria-label="Strike"
          value={strike || ''}
          step={stepBy}
          onChange={(e) => setStrike(Number(e.target.value))}
          className="input-field w-24 py-1.5 text-center text-[16px] tabular-nums md:text-sm"
        />
        <button type="button" aria-label="Higher strike" onClick={() => setStrike((s) => s + stepBy)} className="h-8 w-8 rounded-[9px] border border-border focus-ring">
          +
        </button>
      </span>
      {suggestion !== null && (
        <span className="text-[11.5px] text-text-secondary">
          {approximate ? 'About' : ''} at the money: {suggestion}
        </span>
      )}
      <button type="button" disabled={!(strike > 0)} onClick={() => onAdd(right, strike)} className="btn-primary ml-auto h-8 px-3 text-xs font-semibold disabled:opacity-40 focus-ring">
        Add {strike > 0 ? `${strike}${right}` : ''}
      </button>
    </section>
  );
}
