import { useMemo, useState } from 'react';
import type { Trade } from '../../types';
import { useSettings } from '../../context/useSettings';
import { formatCurrency, formatCurrencyCompact } from '../../utils/format';
import { computeWeeklyRecap } from '../../utils/insights';
import { weekDays } from '../../utils/weekDays';

/**
 * The last seven days as bars, with the week's net and how many trades made it.
 *
 * It replaced a one-line strip across the full width of the Overview. The same recap
 * (computeWeeklyRecap) heads it, so the figure is unchanged; the bars say which days made it. Each
 * bar's height is the day's size against the week's biggest and its colour is which way it went; a
 * day with nothing traded is a hairline. On a phone each bar carries its figure.
 */
export function ThisWeekCard({ trades, onDayClick }: { trades: Trade[]; onDayClick?: (date: string) => void }) {
  const { settings } = useSettings();
  const [now] = useState(() => new Date());
  const recap = useMemo(() => computeWeeklyRecap(trades, now), [trades, now]);
  const days = useMemo(() => weekDays(trades, now), [trades, now]);
  const max = Math.max(1, ...days.map((d) => Math.abs(d.net)));

  return (
    <section className="panel-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-bold xl:text-sm xl:font-semibold">
          This week
          {recap && (
            <small className={`ml-2.5 text-[15px] font-bold tabular-nums xl:text-xs xl:font-normal ${recap.net >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>
              {recap.net > 0 ? '+' : ''}
              {formatCurrency(recap.net, settings.currency)}
            </small>
          )}
        </h2>
        {recap && <span className="text-xs text-text-secondary">{recap.tradeCount} trades</span>}
      </div>

      {!recap ? (
        <p className="mt-2 text-[13px] text-text-secondary">No trades in the last seven days.</p>
      ) : (
        <div className="mt-2 grid h-[84px] items-end gap-2.5 xl:h-[72px] xl:gap-2" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
          {days.map((day) => (
            <button
              key={day.date}
              type="button"
              onClick={onDayClick && day.trades > 0 ? () => onDayClick(day.date) : undefined}
              disabled={!onDayClick || day.trades === 0}
              title={day.trades > 0 ? `${day.label}: ${formatCurrency(day.net, settings.currency)}, ${day.trades} trade${day.trades === 1 ? '' : 's'}` : `${day.label}: no trades`}
              className="flex h-full min-w-0 flex-col items-center justify-end gap-[5px] text-[11px] text-text-secondary/70 disabled:cursor-default focus-ring rounded xl:gap-1 xl:text-[10px]"
            >
              {day.trades > 0 && (
                <span className={`text-[11px] font-bold tabular-nums xl:hidden ${day.net >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>
                  {formatCurrencyCompact(day.net, settings.currency)}
                </span>
              )}
              <i
                className={`block w-full rounded-t-md rounded-b-sm ${day.trades === 0 ? 'bg-[#2a2a2a]' : day.net >= 0 ? 'bg-accent' : 'bg-loss-bright'}`}
                style={{ height: day.trades === 0 ? 3 : `${Math.max(6, (Math.abs(day.net) / max) * 62)}px` }}
              />
              {day.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
