import { useState } from 'react';
import { BarChart3, Eraser, MousePointer2, MoveDiagonal, RectangleHorizontal, RotateCcw, Undo2, X } from 'lucide-react';
import type { Right } from '../../utils/marketReplay';
import { easternClock } from '../../utils/replayClock';
import type { DrawingTool } from '../../utils/replayDrawings';
import { unrealized, type PracticeBook } from '../../utils/replayPractice';
import { DEFAULT_PARAMS, STRATEGY_NAMES, type StrategyKind, type StrategyParams, type StrategyResult } from '../../utils/replayStrategies';
import { STUDY_COLORS, STUDY_NAMES, type StudyId, type StudySettings } from '../../utils/replayStudies';
import { strikeStep } from '../../utils/replayView';
import { SegmentedControl } from '../ui/SegmentedControl';

const tone = (n: number) => (n > 0 ? 'text-profit-bright' : n < 0 ? 'text-loss-bright' : 'text-text-primary');

/* ------------------------------------------------------------------ drawing tools */

const TOOLS: { id: DrawingTool; label: string; icon: typeof MousePointer2; key: string }[] = [
  { id: 'cursor', label: 'Cursor', icon: MousePointer2, key: 'Esc' },
  { id: 'trend', label: 'Trend line', icon: MoveDiagonal, key: 'T' },
  { id: 'hline', label: 'Horizontal line', icon: BarChart3, key: 'H' },
  { id: 'rect', label: 'Zone', icon: RectangleHorizontal, key: 'R' },
];

/**
 * The drawing tools, down the left of the chart as on TradingView, or along the top on a phone.
 * A tool stays picked for one drawing and then hands back to the cursor, which is TradingView's
 * default, so a stray click after a line does not start another.
 */
export function ToolRail({
  tool,
  onTool,
  canUndo,
  onUndo,
  onClear,
}: {
  tool: DrawingTool;
  onTool: (t: DrawingTool) => void;
  canUndo: boolean;
  onUndo: () => void;
  onClear: () => void;
}) {
  const base = 'grid h-9 w-9 place-items-center rounded-lg focus-ring';
  return (
    <div className="flex shrink-0 gap-1 border-b border-white/[0.06] p-1.5 md:flex-col md:border-b-0 md:border-r" role="toolbar" aria-label="Drawing tools">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-pressed={tool === t.id}
          title={`${t.label} (${t.key})`}
          aria-label={t.label}
          onClick={() => onTool(t.id)}
          className={`${base} ${tool === t.id ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:bg-white/[0.05] hover:text-text-primary'}`}
        >
          <t.icon size={17} aria-hidden className={t.id === 'hline' ? 'rotate-90' : ''} />
        </button>
      ))}
      <span className="mx-1 w-px bg-white/[0.06] md:mx-0 md:my-1 md:h-px md:w-auto" aria-hidden />
      <button type="button" title="Undo the last drawing (Ctrl+Z)" aria-label="Undo the last drawing" disabled={!canUndo} onClick={onUndo} className={`${base} text-text-secondary hover:text-text-primary disabled:opacity-30`}>
        <Undo2 size={17} aria-hidden />
      </button>
      <button type="button" title="Remove every drawing on this chart" aria-label="Remove every drawing on this chart" disabled={!canUndo} onClick={onClear} className={`${base} text-text-secondary hover:text-loss-bright disabled:opacity-30`}>
        <Eraser size={17} aria-hidden />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ indicators */

/** The study list: a switch each, and the lengths that matter. */
export function IndicatorsMenu({ studies, onChange, onClose }: { studies: StudySettings; onChange: (s: StudySettings) => void; onClose: () => void }) {
  const set = <K extends StudyId>(id: K, patch: Partial<StudySettings[K]>) => onChange({ ...studies, [id]: { ...studies[id], ...patch } });
  const num = (value: number, onValue: (n: number) => void, label: string) => (
    <input
      type="number"
      min={1}
      max={500}
      aria-label={label}
      value={value}
      onChange={(e) => onValue(Number(e.target.value))}
      className="input-field w-14 px-1.5 py-1 text-center text-[16px] tabular-nums md:text-xs"
    />
  );
  const row = (id: StudyId, extra: React.ReactNode = null) => (
    <div key={id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]">
      <label className="flex flex-1 cursor-pointer items-center gap-2 text-[13px]">
        <input type="checkbox" checked={studies[id].on} onChange={(e) => set(id, { on: e.target.checked } as Partial<StudySettings[typeof id]>)} className="accent-[var(--color-accent)]" />
        <span className="h-2 w-2 rounded-full" style={{ background: STUDY_COLORS[id] }} aria-hidden />
        {STUDY_NAMES[id]}
      </label>
      {extra}
    </div>
  );
  return (
    <div role="dialog" aria-label="Indicators" className="absolute left-0 top-full z-30 mt-1.5 w-[300px] rounded-xl border border-border bg-bg-secondary p-2 shadow-2xl shadow-black/60">
      <div className="mb-1 flex items-center justify-between px-2 pt-0.5">
        <p className="text-xs font-semibold text-text-secondary">On the price</p>
        <button type="button" onClick={onClose} aria-label="Close indicators" className="rounded p-1 text-text-secondary hover:text-text-primary focus-ring">
          <X size={14} />
        </button>
      </div>
      {row('ema1', num(studies.ema1.length, (n) => set('ema1', { length: n }), 'First EMA length'))}
      {row('ema2', num(studies.ema2.length, (n) => set('ema2', { length: n }), 'Second EMA length'))}
      {row('sma', num(studies.sma.length, (n) => set('sma', { length: n }), 'SMA length'))}
      {row('bb', num(studies.bb.length, (n) => set('bb', { length: n }), 'Bollinger length'))}
      {row('vwap')}
      {row('or', <span className="flex items-center gap-1 text-[11px] text-text-secondary">{num(studies.or.minutes, (n) => set('or', { minutes: n }), 'Opening range minutes')} min</span>)}
      <p className="mb-1 mt-2 px-2 text-xs font-semibold text-text-secondary">In a pane below</p>
      {row('rsi', num(studies.rsi.length, (n) => set('rsi', { length: n }), 'RSI length'))}
      {row('macd', <span className="text-[11px] text-text-secondary tabular-nums">{studies.macd.fast}/{studies.macd.slow}/{studies.macd.signal}</span>)}
    </div>
  );
}

/* ------------------------------------------------------------------ strategy tester */

export function StrategyPanel({
  kind,
  params,
  result,
  multiplier,
  replaying,
  onKind,
  onParams,
  fmt,
}: {
  kind: StrategyKind | null;
  params: StrategyParams;
  result: StrategyResult | null;
  multiplier: number;
  replaying: boolean;
  onKind: (k: StrategyKind | null) => void;
  onParams: (p: StrategyParams) => void;
  fmt: (n: number) => string;
}) {
  const dollars = (points: number) => Math.round(points * multiplier * 100) / 100;
  const decided = result ? result.wins + result.losses : 0;
  return (
    <section className="panel-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-medium text-text-secondary">Strategy tester</h2>
        <select
          aria-label="Strategy"
          value={kind ?? ''}
          onChange={(e) => onKind((e.target.value || null) as StrategyKind | null)}
          className="rounded-lg border border-border bg-transparent px-2 py-1 text-[16px] text-text-primary md:text-xs focus-ring"
        >
          <option value="">Off</option>
          {(Object.keys(STRATEGY_NAMES) as StrategyKind[]).map((k) => (
            <option key={k} value={k}>
              {STRATEGY_NAMES[k]}
            </option>
          ))}
        </select>
      </div>

      {kind && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
            {kind === 'ema-cross' && (
              <>
                <label className="flex items-center gap-1">
                  Fast
                  <input type="number" min={1} value={params.fast} onChange={(e) => onParams({ ...params, fast: Math.max(1, Number(e.target.value) || DEFAULT_PARAMS.fast) })} className="input-field w-14 px-1.5 py-1 text-center text-[16px] md:text-xs" />
                </label>
                <label className="flex items-center gap-1">
                  Slow
                  <input type="number" min={2} value={params.slow} onChange={(e) => onParams({ ...params, slow: Math.max(2, Number(e.target.value) || DEFAULT_PARAMS.slow) })} className="input-field w-14 px-1.5 py-1 text-center text-[16px] md:text-xs" />
                </label>
              </>
            )}
            {kind === 'orb' && (
              <label className="flex items-center gap-1">
                Range
                <input type="number" min={1} value={params.orMinutes} onChange={(e) => onParams({ ...params, orMinutes: Math.max(1, Number(e.target.value) || DEFAULT_PARAMS.orMinutes) })} className="input-field w-14 px-1.5 py-1 text-center text-[16px] md:text-xs" />
                min
              </label>
            )}
            <SegmentedControl
              label="Direction"
              value={params.shorts ? 'both' : 'long'}
              onChange={(v) => onParams({ ...params, shorts: v === 'both' })}
              options={[
                { id: 'long', label: 'Long' },
                { id: 'both', label: 'Long & short' },
              ]}
            />
          </div>

          {result && (
            <>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-xs text-text-secondary">
                <div>
                  <dt>Net, 1 lot</dt>
                  <dd className={`mt-0.5 text-sm font-semibold tabular-nums ${tone(result.net)}`}>{fmt(dollars(result.net))}</dd>
                </div>
                <div>
                  <dt>Trades</dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums text-text-primary">
                    {result.trades.length}
                    {decided > 0 && <span className="ml-1 text-[11px] font-normal text-text-secondary">{Math.round((result.wins / decided) * 100)}% won</span>}
                  </dd>
                </div>
                <div>
                  <dt>Max drawdown</dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums text-text-primary">{fmt(dollars(result.maxDrawdown))}</dd>
                </div>
              </dl>
              {result.trades.length > 0 ? (
                <ul className="mt-3 max-h-36 space-y-1 overflow-y-auto border-t border-white/[0.06] pt-2 text-[12px] tabular-nums">
                  {result.trades.map((t) => (
                    <li key={`${t.entryTime}-${t.side}`} className="flex justify-between gap-2">
                      <span>
                        <span className="text-text-secondary">
                          {easternClock(t.entryTime)}–{t.open ? 'open' : easternClock(t.exitTime)}
                        </span>{' '}
                        {t.side === 'long' ? 'Long' : 'Short'} {Math.round(t.entryPrice * 100) / 100} → {Math.round(t.exitPrice * 100) / 100}
                      </span>
                      <span className={tone(t.points)}>{fmt(dollars(t.points))}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-[12.5px] text-text-secondary">No signals {replaying ? 'yet in this replay' : 'on this day'}.</p>
              )}
            </>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-text-secondary">
            {replaying ? 'Only the candles the replay has shown. ' : ''}Fills at candle closes, one contract or share, no commission. A test on one past day, not a signal for the next.
          </p>
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ practice */

export function PracticePanel({
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

/* ------------------------------------------------------------------ contract picker */

export function ContractPicker({
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
