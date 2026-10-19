import { useMemo, useState } from 'react';
import type { Trade } from '../../types';
import { useSettings } from '../../context/useSettings';
import { formatCurrency, formatCurrencyCompact } from '../../utils/format';
import { computeWeeklyRecap } from '../../utils/insights';
import { weekDays } from '../../utils/weekDays';

/**
 * The last seven days as bars, with the week's net against the week before.
 *
 * It replaced a one-line strip across the full width of the Overview. The same recap
 * (computeWeeklyRecap) heads it, so the figure is unchanged; the bars say which days made it, which
 * the strip could only do by naming the best and worst. Bars are drawn from a shared zero line, up
 * for green and down for red, scaled to the week's biggest day.
 */
export function ThisWeekCard({ trades, onDayClick }: { trades: Trade[]; onDayClick?: (date: string) => void }) {
  const { settings } = useSettings();
  const [now] = useState(() => new Date());
  const recap = useMemo(() => computeWeeklyRecap(trades, now), [trades, now]);
  const days = useMemo(() => weekDays(trades, now), [trades, now]);
  const max = Math.max(1, ...days.map((d) => Math.abs(d.net)));
  const fmt = (n: number) => formatCurrency(n, settings.currency);
  const hasLosses = days.some((d) => d.net < 0);
  const hasGains = days.some((d) => d.net > 0);

  return (
    <section className="panel-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">
          This week
          {recap && (
            <span className={`ml-2 tabular-nums ${recap.net >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>{fmt(recap.net)}</span>
          )}
        </h2>
        {recap?.prevNet != null && (
          <span className="text-[11px] text-text-secondary tabular-nums">
            {formatCurrencyCompact(recap.prevNet, settings.currency)} the week before
          </span>
        )}
      </div>

      {!recap ? (
        <p className="mt-2 text-[13px] text-text-secondary">No trades in the last seven days.</p>
      ) : (
        <div className="mt-3 flex items-stretch gap-2" style={{ height: hasLosses && hasGains ? 112 : 84 }}>
          {days.map((day) => {
            const h = (Math.abs(day.net) / max) * 100;
            const up = day.net >= 0;
            return (
              <button
                key={day.date}
                type="button"
                onClick={onDayClick && day.trades > 0 ? () => onDayClick(day.date) : undefined}
                disabled={!onDayClick || day.trades === 0}
                title={day.trades > 0 ? `${day.label}: ${fmt(day.net)}, ${day.trades} trade${day.trades === 1 ? '' : 's'}` : `${day.label}: no trades`}
                className="flex-1 min-w-0 flex flex-col items-center gap-1 text-[10px] text-text-secondary disabled:cursor-default focus-ring rounded"
              >
                <span className="flex-1 w-full flex flex-col">
                  {hasGains && (
                    <span className="flex-1 flex items-end">
                      {up && day.trades > 0 && <span className="w-full rounded-t bg-profit-bright/80" style={{ height: `${Math.max(4, h)}%` }} />}
                    </span>
                  )}
                  <span className="h-px w-full bg-border" aria-hidden />
                  {hasLosses && (
                    <span className="flex-1 flex items-start">
                      {!up && <span className="w-full rounded-b bg-loss-bright/80" style={{ height: `${Math.max(4, h)}%` }} />}
                    </span>
                  )}
                </span>
                <span>{day.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
