import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Minus, Pause, Play, Plus, ScanLine, SkipForward, SlidersHorizontal, X } from 'lucide-react';
import type { Trade } from '../../types';
import { useSettings } from '../../context/useSettings';
import { formatCurrency } from '../../utils/format';
import { aggregateBars, chartedUnderlying, contractLabel, nextTradingDay, previousTradingDay, replayAvailable, replayAvailableAt, type Bar } from '../../utils/marketReplay';
import { easternClock } from '../../utils/replayClock';
import { handPicked, replayPlan, sameContract, type ReplayContractRequest } from '../../utils/replayTrades';
import { applyFill, EMPTY_BOOK, flatten, multiplierFor, type PracticeBook } from '../../utils/replayPractice';
import { actualFills, cursorForCandle, estimatedFillTimes, markPrice, nextCursor, revealed, SPEEDS, suggestedStrike, TIMEFRAMES, type Speed, type Timeframe } from '../../utils/replayView';
import { heikinAshi } from '../../utils/indicators';
import { buildStudies, loadStudies, saveStudies, type StudySettings } from '../../utils/replayStudies';
import { DEFAULT_PARAMS, runStrategy, type StrategyKind, type StrategyParams } from '../../utils/replayStrategies';
import { loadDrawings, saveDrawings, type Drawing, type DrawingTool } from '../../utils/replayDrawings';
import { fetchReplay, ReplayError, type ReplayData } from '../../services/marketReplay';
import { replayUsedLabel } from '../../utils/replayAllowance';
import { SegmentedControl } from '../ui/SegmentedControl';
import type { ChartCommand, ChartMarker } from './ReplayChart';
import { ContractPicker, IndicatorsMenu, PracticePanel, StrategyPanel, ToolRail } from './ReplayPanels';

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

type ChartType = 'candles' | 'heikin';

function longDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function availableAtWords(date: string): string {
  const at = replayAvailableAt(date);
  const day = at.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'short', day: 'numeric' });
  return `${day} at ${easternClock(Math.floor(at.getTime() / 1000))} ET`;
}

/**
 * Market replay: a past session bar by bar on a TradingView-style chart, with studies, drawings,
 * a strategy tester and practice trades.
 *
 * The day's own contracts come first, then anything picked by hand on that day. Click a candle to
 * start the replay there; the rest of the day stays hidden until it plays, and nothing here (the
 * studies, the strategy tester) is computed from a candle the replay has not shown. Practice fills
 * happen at the close of the candle on screen and are never saved: this is a rehearsal, not the journal.
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
        id: c.osi ?? `${req.underlying} ${req.strike}${req.right}`,
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
        id: data.underlying.symbol,
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
  const [chartType, setChartType] = useState<ChartType>('candles');
  const [studies, setStudiesState] = useState<StudySettings>(loadStudies);
  const [showIndicators, setShowIndicators] = useState(false);
  const [showEstimates, setShowEstimates] = useState(true);
  const [cursor, setCursor] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [books, setBooks] = useState<Record<string, PracticeBook>>({});
  const [qty, setQty] = useState(1);
  const [picking, setPicking] = useState(false);
  const [tool, setTool] = useState<DrawingTool>('cursor');
  const [drawingEdits, setDrawingEdits] = useState<Record<string, Drawing[]>>({});
  const [command, setCommand] = useState<ChartCommand | null>(null);
  const [strategy, setStrategy] = useState<StrategyKind | null>(null);
  const [params, setParams] = useState<StrategyParams>(DEFAULT_PARAMS);
  const [fullscreen, setFullscreen] = useState(false);
  const chartBox = useRef<HTMLElement>(null);

  const setStudies = (s: StudySettings) => {
    setStudiesState(s);
    saveStudies(s);
  };

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

  const drawingKey = selected ? `${selected.id}` : '';
  const drawings = useMemo(() => drawingEdits[drawingKey] ?? (drawingKey ? loadDrawings(date, drawingKey) : []), [drawingEdits, drawingKey, date]);
  const setDrawings = useCallback(
    (next: Drawing[]) => {
      if (!drawingKey) return;
      saveDrawings(date, drawingKey, next);
      setDrawingEdits((m) => ({ ...m, [drawingKey]: next }));
    },
    [date, drawingKey],
  );

  /*
   * TradingView's keys: Space plays and pauses, the right arrow steps, Esc puts the cursor back,
   * T, H and R pick the trend line, horizontal line and zone, and Ctrl+Z takes the last drawing off.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (drawings.length > 0) {
          e.preventDefault();
          setDrawings(drawings.slice(0, -1));
        }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 'escape') setTool('cursor');
      else if (key === 't') setTool('trend');
      else if (key === 'h') setTool('hline');
      else if (key === 'r') setTool('rect');
      else if (cursor !== null && e.key === ' ') {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (cursor !== null && e.key === 'ArrowRight') {
        e.preventDefault();
        setPlaying(false);
        step();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cursor, step, drawings, setDrawings]);

  // Full screen is the chart's panel, as TradingView's full-screen button does.
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === chartBox.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggleFullscreen = () => {
    const el = chartBox.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void el.requestFullscreen?.().catch(() => undefined);
  };

  const minuteBars = useMemo(() => (selected ? revealed(selected.bars, cursor) : []), [selected, cursor]);
  const shownBars = useMemo(() => aggregateBars(minuteBars.map((b) => ({ ...b })), timeframe), [minuteBars, timeframe]);
  const drawnBars = useMemo(() => (chartType === 'heikin' ? heikinAshi(shownBars) : shownBars), [chartType, shownBars]);
  const chartStudies = useMemo(() => buildStudies(shownBars, sessionStart, studies), [shownBars, sessionStart, studies]);
  const tested = useMemo(() => (strategy && shownBars.length > 0 ? runStrategy(strategy, shownBars, sessionStart, params) : null), [strategy, shownBars, sessionStart, params]);

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
    const practice: ChartMarker[] = book.fills.map((f) => ({ time: bucket(f.time), side: f.side, text: `${f.side === 'buy' ? 'B' : 'S'} ${f.qty} @${f.price}`, kind: 'practice' }));
    const actual: ChartMarker[] = actualFills(selectedTrades, date, cursor).map((f) => ({ ...f, time: bucket(f.time), kind: 'actual' }));
    const strat: ChartMarker[] = (tested?.trades ?? []).flatMap((t) => {
      const entry: ChartMarker = { time: t.entryTime, side: t.side === 'long' ? 'buy' : 'sell', text: t.side === 'long' ? 'Long' : 'Short', kind: 'strategy' };
      return t.open ? [entry] : [entry, { time: t.exitTime, side: t.side === 'long' ? 'sell' : 'buy', text: 'Exit', kind: 'strategy' }];
    });
    return [...actual, ...strat, ...practice];
  }, [book.fills, selectedTrades, date, cursor, timeframe, tested]);

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
  const iconBtn = 'grid h-8 w-8 place-items-center rounded-[9px] border border-border text-text-secondary hover:text-text-primary focus-ring';
  const charted = chartedUnderlying(optionUnderlying);
  const studyCount = Object.values(studies).filter((s) => s.on).length;
  const zoom = (kind: ChartCommand['kind']) => setCommand((c) => ({ kind, n: (c?.n ?? 0) + 1 }));

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
            <section ref={chartBox} className="panel-card flex min-w-0 flex-col p-0 [&:fullscreen]:rounded-none [&:fullscreen]:bg-bg-primary">
              {/* The chart's own toolbar, along the top as on TradingView. */}
              <div className="relative flex flex-wrap items-center gap-1.5 border-b border-white/[0.06] px-2 py-1.5">
                <SegmentedControl
                  label="Timeframe"
                  value={String(timeframe)}
                  onChange={(v) => setTimeframe(Number(v) as Timeframe)}
                  options={TIMEFRAMES.map((t) => ({ id: String(t), label: `${t}m` }))}
                />
                <SegmentedControl
                  label="Candles"
                  value={chartType}
                  onChange={(v) => setChartType(v as ChartType)}
                  options={[
                    { id: 'candles', label: 'Candles' },
                    { id: 'heikin', label: 'Heikin Ashi' },
                  ]}
                />
                <span className="relative">
                  <button type="button" onClick={() => setShowIndicators((s) => !s)} aria-expanded={showIndicators} className={btn}>
                    <SlidersHorizontal size={13} aria-hidden /> Indicators{studyCount > 0 ? ` · ${studyCount}` : ''}
                  </button>
                  {showIndicators && <IndicatorsMenu studies={studies} onChange={setStudies} onClose={() => setShowIndicators(false)} />}
                </span>
                <span className="flex-1" />
                <button type="button" className={iconBtn} aria-label="Zoom out" title="Zoom out" onClick={() => zoom('out')}>
                  <Minus size={14} />
                </button>
                <button type="button" className={iconBtn} aria-label="Zoom in" title="Zoom in" onClick={() => zoom('in')}>
                  <Plus size={14} />
                </button>
                <button type="button" className={iconBtn} aria-label="Fit the whole session" title="Fit the whole session" onClick={() => zoom('fit')}>
                  <ScanLine size={14} />
                </button>
                <button type="button" className={iconBtn} aria-label={fullscreen ? 'Leave full screen' : 'Full screen'} title={fullscreen ? 'Leave full screen' : 'Full screen'} onClick={toggleFullscreen}>
                  {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </button>
              </div>

              <div className="flex min-h-0 flex-1 flex-col md:flex-row">
                <ToolRail
                  tool={tool}
                  onTool={setTool}
                  canUndo={drawings.length > 0}
                  onUndo={() => setDrawings(drawings.slice(0, -1))}
                  onClear={() => setDrawings([])}
                />
                {/* Grows only along the row. In the phone's column, flex-1's zero basis beat the
                    360px height and the chart shrank to a sliver; full screen grows it either way.
                    On desktop it is at least 560px and stretches to the panel, which the column of
                    practice and strategy cards beside it can make taller: a fixed 560 left a dead
                    band under the time axis. The chart sits absolutely inside, so it never holds
                    the panel open after that column shrinks again.
                    `isolate` keeps the chart's own z-indexes inside it: the separator above an RSI
                    or MACD pane otherwise sat over the Indicators menu and swallowed its taps. */}
                <div className="relative isolate h-[360px] min-w-0 md:h-auto md:min-h-[560px] md:flex-1 [:fullscreen_&]:h-auto [:fullscreen_&]:flex-1">
                  <Suspense fallback={<div className="grid h-full place-items-center text-[13px] text-text-secondary">Loading the chart…</div>}>
                    <ReplayChart
                      bars={drawnBars}
                      studies={chartStudies}
                      markers={markers}
                      estimates={estimates}
                      fitKey={`${date}|${selected?.id}|${timeframe}`}
                      following={cursor !== null}
                      timeframe={timeframe}
                      tool={tool}
                      drawings={drawings}
                      onDrawing={(d) => {
                        setDrawings([...drawings, d]);
                        setTool('cursor');
                      }}
                      onPickTime={(t) => {
                        setPlaying(false);
                        setCursor(cursorForCandle(t, timeframe));
                      }}
                      command={command}
                    />
                  </Suspense>
                </div>
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
                    <button
                      type="button"
                      className={btn}
                      onClick={() => {
                        setPlaying(false);
                        step();
                      }}
                      aria-label="Step one candle"
                    >
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
                    <span className="text-[13px] font-semibold tabular-nums">{easternClock(cursor)} ET</span>
                    <span className="h-1 min-w-[60px] flex-1 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden>
                      <span className="block h-full bg-accent/70" style={{ width: `${Math.min(100, Math.max(0, ((cursor - sessionStart) / Math.max(1, sessionEnd - sessionStart)) * 100))}%` }} />
                    </span>
                    <button
                      type="button"
                      className={btn}
                      onClick={() => {
                        setPlaying(false);
                        setCursor(null);
                      }}
                    >
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

              <StrategyPanel
                kind={strategy}
                params={params}
                result={tested}
                multiplier={multiplier}
                replaying={cursor !== null}
                onKind={setStrategy}
                onParams={setParams}
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
            {data.allowance && (
              <>
                Replay data this month: <b className="font-medium text-text-primary">{replayUsedLabel(data.allowance.used)}</b> used of the{' '}
                {Math.round(data.allowance.available * 100)}% open so far. A little more opens each day so it lasts the month, and days you
                have already opened don&apos;t count.{' '}
              </>
            )}
            One-minute bars from OPRA and Databento, shown the trading day after. Practice trades fill at the close of the candle on screen,
            with no commission, and are not saved to your journal. Drawings and indicators are remembered in this browser.
          </p>
        </>
      )}
    </div>
  );
}
