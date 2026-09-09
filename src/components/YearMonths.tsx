import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Trade } from '../types';
import { useSettings } from '../context/useSettings';
import { computeStats, getMonthlyPnlForYear, getYearTrades } from '../utils/stats';
import { formatCurrency } from '../utils/format';
import { pnlClass } from '../utils/pnlTone';

/**
 * The year, as twelve figures.
 *
 * This replaces the heatmap that used to sit here. The heatmap encoded each month's P&L as a
 * shade, which meant reading a colour and then reading the number underneath it anyway — and the
 * shading was relative to the best month, so a flat year and a spectacular one looked identical.
 * The navigation the heatmap carried is what actually mattered: pick a month, step through years,
 * see the total. That is all kept.
 */
export function YearMonths({
  trades,
  year,
  onPrevYear,
  onNextYear,
  onSelectMonth,
}: {
  trades: Trade[];
  year: number;
  onPrevYear: () => void;
  onNextYear: () => void;
  onSelectMonth: (month: number) => void;
}) {
  const { settings } = useSettings();
  const months = useMemo(() => getMonthlyPnlForYear(trades, year), [trades, year]);
  const yearStats = useMemo(() => computeStats(getYearTrades(trades, year)), [trades, year]);

  return (
    <div className="panel-card p-2 md:p-4 shrink-0">
      <div className="flex items-center justify-between mb-1.5 md:mb-3 gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-accent/80 font-medium mb-0.5">
            Year view
          </p>
          <h2 className="text-xs md:text-lg font-semibold">{year}</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] md:text-sm font-semibold tabular-nums ${pnlClass(yearStats.netPnl)}`}>
            {formatCurrency(yearStats.netPnl, settings.currency)}
          </span>
          <button
            type="button"
            onClick={onPrevYear}
            className="p-1 md:p-1.5 rounded-lg hover:bg-bg-tertiary text-text-secondary focus-ring"
            aria-label="Previous year"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={onNextYear}
            className="p-1 md:p-1.5 rounded-lg hover:bg-bg-tertiary text-text-secondary focus-ring"
            aria-label="Next year"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 md:gap-3">
        {months.map((m, index) => {
          const traded = m.tradeCount > 0;
          return (
            <button
              key={index}
              type="button"
              onClick={() => onSelectMonth(index)}
              className={`rounded-lg border p-2 text-left transition-colors focus-ring ${
                traded
                  ? 'border-border/60 bg-bg-primary/50 hover:border-accent/40'
                  : 'border-dashed border-border/40'
              }`}
            >
              <span className="block text-[10px] md:text-xs text-text-secondary">{m.label}</span>
              <span
                className={`block text-[11px] md:text-sm font-semibold tabular-nums mt-0.5 ${
                  traded ? pnlClass(m.pnl) : 'text-text-secondary/50'
                }`}
              >
                {traded ? formatCurrency(m.pnl, settings.currency) : '—'}
              </span>
              {traded && (
                <span className="block text-[9px] md:text-[10px] text-text-secondary/70 tabular-nums">
                  {m.tradeCount} trade{m.tradeCount === 1 ? '' : 's'}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
