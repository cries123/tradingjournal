import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Trade } from '../types';
import { useSettings } from '../context/SettingsContext';
import { computeStats, getMonthlyPnlForYear, getYearTrades } from '../utils/stats';
import { formatCurrency } from '../utils/format';

interface YearHeatmapProps {
  trades: Trade[];
  year: number;
  onPrevYear: () => void;
  onNextYear: () => void;
  onSelectMonth: (month: number) => void;
}

export function YearHeatmap({ trades, year, onPrevYear, onNextYear, onSelectMonth }: YearHeatmapProps) {
  const { settings } = useSettings();
  const months = useMemo(() => getMonthlyPnlForYear(trades, year), [trades, year]);
  const yearStats = useMemo(() => computeStats(getYearTrades(trades, year)), [trades, year]);
  const maxAbs = Math.max(...months.map((m) => Math.abs(m.pnl)), 1);

  return (
    <div className="panel-card p-2 md:p-4 shrink-0">
      <div className="flex items-center justify-between mb-3 md:mb-4 gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-emerald-400/80 font-medium mb-0.5">Year view</p>
          <h2 className="text-xs md:text-lg font-semibold">{year}</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] md:text-sm font-semibold ${yearStats.netPnl >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>
            {formatCurrency(yearStats.netPnl, settings.currency)}
          </span>
          <button type="button" onClick={onPrevYear} className="p-1 md:p-1.5 rounded-lg hover:bg-bg-tertiary text-text-secondary focus-ring" aria-label="Previous year">
            <ChevronLeft size={18} />
          </button>
          <button type="button" onClick={onNextYear} className="p-1 md:p-1.5 rounded-lg hover:bg-bg-tertiary text-text-secondary focus-ring" aria-label="Next year">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 md:gap-3">
        {months.map((m) => {
          const intensity = m.pnl !== 0 ? Math.max(0.25, Math.abs(m.pnl) / maxAbs) : 0;
          const isProfit = m.pnl >= 0;
          const hasData = m.tradeCount > 0;

          return (
            <button
              key={m.month}
              type="button"
              onClick={() => onSelectMonth(m.month)}
              className={`rounded-xl p-3 md:p-4 text-left border transition-all focus-ring hover:scale-[1.02] ${
                hasData
                  ? isProfit
                    ? 'border-emerald-500/40'
                    : 'border-red-500/40'
                  : 'border-border/50 hover:border-border'
              }`}
              style={
                hasData
                  ? {
                      backgroundColor: isProfit
                        ? `rgba(52, 211, 153, ${intensity * 0.2})`
                        : `rgba(248, 113, 113, ${intensity * 0.2})`,
                    }
                  : undefined
              }
            >
              <p className="text-[10px] md:text-xs text-text-secondary font-medium uppercase tracking-wide">{m.label}</p>
              <p className={`text-sm md:text-lg font-bold mt-1 ${!hasData ? 'text-text-secondary' : isProfit ? 'text-profit-bright' : 'text-loss-bright'}`}>
                {hasData ? formatCurrency(m.pnl, settings.currency) : '—'}
              </p>
              {hasData && (
                <p className="text-[9px] md:text-[10px] text-text-secondary mt-1">
                  {m.tradeCount} trades · {m.tradingDays} days
                </p>
              )}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-border/50">
        <YearStat label="Net P&L" value={formatCurrency(yearStats.netPnl, settings.currency)} positive={yearStats.netPnl >= 0} />
        <YearStat label="Win rate" value={yearStats.totalTrades > 0 ? `${yearStats.winRate.toFixed(1)}%` : '—'} />
        <YearStat label="Trades" value={String(yearStats.totalTrades)} />
      </div>
    </div>
  );
}

function YearStat({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="text-center">
      <p className="text-[9px] uppercase tracking-wide text-text-secondary">{label}</p>
      <p className={`text-sm font-semibold mt-0.5 ${positive === undefined ? 'text-text-primary' : positive ? 'text-profit-bright' : 'text-loss-bright'}`}>
        {value}
      </p>
    </div>
  );
}
