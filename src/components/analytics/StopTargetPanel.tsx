import { useMemo, useState } from 'react';
import { ChartCandlestick } from 'lucide-react';
import { MIN_SAMPLE } from '../../utils/brokerAnalytics';
import { bracketTrade, summarizeBrackets, type Measurement } from '../../utils/tradePath';

interface StopTargetPanelProps {
  measurement: Measurement;
  /** Option and stock trades in the period, measured or not. */
  candidates: number;
  loading: boolean;
  fmt: (n: number) => string;
}

/** Percent of the entry price, as typed; blank is "none". */
function share(raw: string): number | null {
  const n = Number(raw);
  return raw.trim() === '' || !Number.isFinite(n) || n <= 0 ? null : Math.min(n, 1000) / 100;
}

/**
 * Stops and targets, on the prices the trader really traded through.
 *
 * Every trade in the period whose day market replay has stored is run again with a stop and a
 * target added: the minute bars between its entry and its exit decide whether either was touched
 * first. A test of a rule on past trades, said as one — never a suggestion of what to set, which is
 * where a journal would turn into advice. Hidden under MIN_SAMPLE, like every panel on this screen.
 */
export function StopTargetPanel({ measurement, candidates, loading, fmt }: StopTargetPanelProps) {
  const [stop, setStop] = useState('30');
  const [target, setTarget] = useState('50');
  const rule = useMemo(() => ({ stop: share(stop), target: share(target) }), [stop, target]);

  const summary = useMemo(() => {
    const rows = measurement.placed.flatMap(({ trade, bars, placement }) => {
      const result = bracketTrade(trade, bars, placement, rule);
      return result ? [{ trade, result, estimated: placement.estimated }] : [];
    });
    return summarizeBrackets(rows);
  }, [measurement, rule]);

  if (candidates === 0) return null;
  const diff = summary.ruleNet - summary.actualNet;
  const enough = summary.tested >= MIN_SAMPLE;
  const input = 'w-[64px] rounded-[9px] border border-border bg-bg-tertiary px-2 py-1 text-right text-[13px] tabular-nums focus-ring';

  return (
    <section className="panel-card rounded-[14px] p-4 md:p-5" aria-label="Stops and targets on your real prices">
      <div className="mb-1 flex items-center gap-2">
        <ChartCandlestick size={15} className="text-accent" aria-hidden />
        <h2 className="text-sm font-semibold">Stops and targets, on your real prices</h2>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-text-secondary">
        Your trades run again with a stop and a target added, against the minute bars between your entry and your exit. A test on past
        trades, not a suggestion of what to set.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
        <label className="flex items-center gap-2">
          Stop at
          <input value={stop} onChange={(e) => setStop(e.target.value)} inputMode="decimal" aria-label="Stop, percent of the entry price" className={input} />
          % loss
        </label>
        <label className="flex items-center gap-2">
          Target at
          <input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" aria-label="Target, percent of the entry price" className={input} />
          % gain
        </label>
      </div>

      {!enough ? (
        <p className="text-[13px] text-text-secondary">
          {loading
            ? 'Reading the stored prices for these trades…'
            : `Needs at least ${MIN_SAMPLE} trades on days opened in market replay; ${summary.tested} so far. Open a day in market replay to add its trades.`}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[12px] border border-white/[0.06] bg-white/[0.06] sm:grid-cols-4">
            {[
              ['As you traded', fmt(summary.actualNet), summary.actualNet >= 0 ? 'text-profit-bright' : 'text-loss-bright'],
              ['With the stop and target', fmt(summary.ruleNet), summary.ruleNet >= 0 ? 'text-profit-bright' : 'text-loss-bright'],
              ['Difference', `${diff >= 0 ? '+' : ''}${fmt(diff)}`, diff >= 0 ? 'text-profit-bright' : 'text-loss-bright'],
              ['Stopped · hit target', `${summary.stopped} · ${summary.targeted}`, 'text-text-primary'],
            ].map(([label, value, tone]) => (
              <div key={label} className="bg-bg-card px-3.5 py-3">
                <p className="text-[11.5px] text-text-secondary">{label}</p>
                <p className={`mt-1 text-lg font-bold tabular-nums ${tone}`}>{value}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11.5px] leading-relaxed text-text-secondary">
            {summary.tested} of {candidates} trades tested; the rest are on days not yet opened in market replay or could not be placed.
            {summary.estimated > 0 &&
              ` ${summary.estimated} ${summary.estimated === 1 ? 'was' : 'were'} placed from your prices because your broker sends no fill times, so treat those as estimates.`}{' '}
            When one minute touched both levels, the stop is assumed to have come first.
          </p>
        </>
      )}
    </section>
  );
}
