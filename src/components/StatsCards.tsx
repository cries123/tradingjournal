import type { TradingStats } from '../utils/stats';
import { formatCurrency } from '../utils/format';

interface StatsCardsProps {
  stats: TradingStats;
}

export function StatsCards({ stats }: StatsCardsProps) {
  const winPct = stats.totalTrades > 0 ? stats.winRate : 0;
  const lossPct = 100 - winPct;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 shrink-0">
      <StatCard label="Net P&L">
        <span className={`text-lg font-bold ${stats.netPnl >= 0 ? 'text-text-primary' : 'text-loss-bright'}`}>
          {formatCurrency(stats.netPnl)}
        </span>
        {stats.netPnl > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent font-medium ml-2">
            {stats.totalTrades > 0 ? '▲' : ''}
          </span>
        )}
      </StatCard>

      <StatCard label="Trade Win Rate">
        <span className="text-lg font-bold">{stats.totalTrades > 0 ? `${winPct.toFixed(2)}%` : '—'}</span>
        {stats.totalTrades > 0 && (
          <div className="mt-2 h-1.5 rounded-full bg-bg-primary overflow-hidden flex">
            <div className="bg-profit-bright h-full" style={{ width: `${winPct}%` }} />
            <div className="bg-loss-bright h-full" style={{ width: `${lossPct}%` }} />
          </div>
        )}
      </StatCard>

      <StatCard label="Avg Win / Loss">
        <span className="text-lg font-bold">
          {stats.totalTrades > 0 ? stats.avgRR.toFixed(2) : '—'}
        </span>
        <p className="text-[10px] text-text-secondary mt-1">Average win ÷ average loss</p>
      </StatCard>

      <StatCard label="Profit Factor">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold">
            {stats.totalTrades > 0 ? (stats.profitFactor >= 99 ? '∞' : stats.profitFactor.toFixed(2)) : '—'}
          </span>
          {stats.totalTrades > 0 && stats.profitFactor > 1 && (
            <svg viewBox="0 0 36 36" className="w-10 h-10 -rotate-90">
              <circle cx="18" cy="18" r="14" fill="none" stroke="var(--color-bg-primary)" strokeWidth="4" />
              <circle
                cx="18"
                cy="18"
                r="14"
                fill="none"
                stroke="var(--color-profit-bright)"
                strokeWidth="4"
                strokeDasharray={`${Math.min(stats.profitFactor / 10, 1) * 88} 88`}
                strokeLinecap="round"
              />
            </svg>
          )}
        </div>
      </StatCard>
    </div>
  );
}

function StatCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-bg-card border border-border rounded-lg p-2.5">
      <p className="text-[10px] text-text-secondary mb-1">{label}</p>
      <div className="flex items-center flex-wrap">{children}</div>
    </div>
  );
}
