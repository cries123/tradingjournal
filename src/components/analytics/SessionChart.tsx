import { useSettings } from '../../context/SettingsContext';
import { formatCurrency } from '../../utils/format';
import type { SessionResult } from '../../utils/tradeQuality';

interface SessionChartProps {
  data: SessionResult[];
}

/**
 * P&L by part of the trading day, using the same Premarket/Open/Midday/Close buckets the trade
 * detail view labels individual trades with.
 *
 * Diverging bars from a centre line rather than left-anchored ones: the question this chart
 * answers is "which parts of the day take money off me", and a losing session should read as
 * pointing the other way, not just as a shorter bar.
 *
 * The grow-in is a CSS animation keyed off the data rather than a mount effect that sets state —
 * same visual result without scheduling a render just to kick off a transition.
 */
export function SessionChart({ data }: SessionChartProps) {
  const { settings } = useSettings();
  const maxAbs = Math.max(...data.map((d) => Math.abs(d.pnl)), 1);
  const dataKey = data.map((d) => `${d.session}:${d.pnl}`).join('|');

  return (
    <div key={dataKey} className="space-y-1.5 h-full flex flex-col justify-center">
      {data.map((point, i) => {
        const widthPct = (Math.abs(point.pnl) / maxAbs) * 50;
        const isProfit = point.pnl >= 0;
        return (
          <div key={point.session} className="flex items-center gap-1.5">
            <span className="text-[10px] text-text-secondary w-16 shrink-0 truncate">
              {point.session}
            </span>

            <div className="flex-1 h-3.5 relative">
              {/* Centre line — everything left of it lost money, everything right made money. */}
              <div className="absolute inset-y-0 left-1/2 w-px bg-border/70" />
              <div
                className={`absolute inset-y-0 rounded-sm bar-grow ${
                  isProfit ? 'bar-profit-h' : 'bar-loss-h'
                }`}
                style={{
                  width: `${Math.max(widthPct, 1.5)}%`,
                  left: isProfit ? '50%' : undefined,
                  right: isProfit ? undefined : '50%',
                  // Grow away from the centre line, not from the bar's own middle.
                  transformOrigin: isProfit ? 'left' : 'right',
                  animationDelay: `${i * 50}ms`,
                }}
              />
            </div>

            <span
              className={`text-[10px] font-medium w-16 text-right shrink-0 tabular-nums ${
                isProfit ? 'text-profit-bright' : 'text-loss-bright'
              }`}
            >
              {formatCurrency(point.pnl, settings.currency)}
            </span>
            <span className="text-[9px] text-text-secondary w-10 text-right shrink-0 tabular-nums hidden sm:block">
              {point.trades}t · {point.winRate.toFixed(0)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
