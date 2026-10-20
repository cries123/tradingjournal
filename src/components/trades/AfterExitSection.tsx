import { ChartCandlestick } from 'lucide-react';
import type { AfterExitView } from '../../utils/tradePath';

interface AfterExitSectionProps {
  view: AfterExitView;
  fmt: (n: number) => string;
  /** Opens the trade's day in market replay, which stores its bars. */
  onReplay?: () => void;
  /** Matches the trade panel's padding. */
  pad: string;
}

const price = (n: number) => n.toFixed(2);

/**
 * What the contract did after the trader closed it: the best it got, the worst, and holding to the
 * close. Measured from the minute bars market replay already bought for that day — nothing is bought
 * here — and said to be an estimate when the broker sent no fill times.
 */
export function AfterExitSection({ view, fmt, onReplay, pad }: AfterExitSectionProps) {
  return (
    <div className={`border-b border-white/[0.06] ${pad} py-3.5`}>
      <p className="mb-2 text-xs text-text-secondary">After you closed it</p>
      {view.state === 'measured' ? (
        <>
          <div className="grid grid-cols-3 gap-2 text-[11.5px] text-text-secondary">
            <div>
              Best after
              <b className="mt-0.5 block text-sm font-semibold tabular-nums text-profit-bright">{fmt(view.after.more)} more</b>
              <span className="tabular-nums">at {price(view.after.bestPrice)}</span>
            </div>
            <div>
              Worst after
              <b className="mt-0.5 block text-sm font-semibold tabular-nums text-loss-bright">{fmt(-view.after.avoided)}</b>
              <span className="tabular-nums">at {price(view.after.worstPrice)}</span>
            </div>
            <div>
              Held to close
              <b className={`mt-0.5 block text-sm font-semibold tabular-nums ${view.after.toClose >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>
                {fmt(view.after.toClose)}
              </b>
              <span className="tabular-nums">at {price(view.after.closePrice)}</span>
            </div>
          </div>
          {view.estimated && (
            <p className="mt-2 text-[11px] leading-snug text-text-secondary">
              Estimated: your broker sends no fill times, so this is placed where your prices first traded that day.
            </p>
          )}
        </>
      ) : view.state === 'not-stored' ? (
        <div className="flex items-start justify-between gap-3">
          <p className="text-[12.5px] leading-snug text-text-secondary">
            Open this day in market replay once and this shows what the contract did after you closed it.
          </p>
          {onReplay && (
            <button type="button" onClick={onReplay} className="inline-flex shrink-0 items-center gap-1.5 rounded-[9px] border border-border px-2.5 py-1.5 text-xs text-accent focus-ring">
              <ChartCandlestick size={13} aria-hidden />
              Replay day
            </button>
          )}
        </div>
      ) : (
        <p className="text-[12.5px] leading-snug text-text-secondary">
          {view.state === 'loading'
            ? 'Reading the day’s prices…'
            : view.state === 'end-of-day'
              ? 'Closed in the session’s last minute, so there is no after.'
              : 'Your prices never traded on this contract that day, so the trade cannot be placed on its chart.'}
        </p>
      )}
    </div>
  );
}
