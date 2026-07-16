import { Flame, Target } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import type { TradingStats } from '../utils/stats';
import { formatCurrency } from '../utils/format';
import { Sparkline } from './Sparkline';

interface StatsCardsProps {
  stats: TradingStats;
  cumulativeSeries?: number[];
  winRateSeries?: number[];
  periodLabel?: string;
  /** Consecutive days journaled (weekends don't break it). */
  streakDays?: number;
  /** Monthly P&L goal — renders a progress bar when > 0. */
  goalPnl?: number;
}

export function StatsCards({
  stats,
  cumulativeSeries = [],
  winRateSeries = [],
  periodLabel,
  streakDays = 0,
  goalPnl = 0,
}: StatsCardsProps) {
  const { settings } = useSettings();
  const hasTrades = stats.totalTrades > 0;
  const isProfit = stats.netPnl >= 0;
  const winPct = hasTrades ? stats.winRate : 0;
  const fmt = (n: number) => formatCurrency(n, settings.currency);

  return (
    <div className={`hero-card ${!isProfit && hasTrades ? 'hero-loss' : ''} shrink-0 p-3 md:p-5`}>
      <div className="relative flex flex-col md:flex-row md:items-center gap-3 md:gap-8">
        <div className="min-w-0">
          <p className="text-[9px] md:text-[11px] uppercase tracking-[0.2em] text-text-secondary font-semibold">
            Net P&L{periodLabel ? ` · ${periodLabel}` : ''}
          </p>
          <div className="flex items-end gap-3 mt-0.5 md:mt-1">
            <span
              className={`text-3xl md:text-5xl font-extrabold tracking-tight leading-none ${
                hasTrades ? (isProfit ? 'hero-value-profit' : 'hero-value-loss') : 'text-text-secondary'
              }`}
            >
              {hasTrades ? fmt(stats.netPnl) : '—'}
            </span>
            {cumulativeSeries.length >= 2 && (
              <Sparkline
                values={cumulativeSeries}
                positive={isProfit}
                width={96}
                height={34}
                className="hidden sm:block mb-0.5"
              />
            )}
          </div>
          <p className="text-[10px] md:text-xs text-text-secondary mt-1.5 md:mt-2">
            {hasTrades
              ? `${stats.totalTrades} trade${stats.totalTrades === 1 ? '' : 's'} · ${stats.tradingDays} day${
                  stats.tradingDays === 1 ? '' : 's'
                } · avg ${fmt(stats.avgProfitPerDay)}/day`
              : 'No trades yet this period — import or log your first session'}
          </p>
        </div>

        {hasTrades && (
          <div className="flex flex-wrap items-center gap-1.5 md:gap-2 md:ml-auto md:justify-end md:max-w-[46%]">
            {streakDays >= 2 && (
              <span className="stat-chip border-amber-500/30">
                <Flame size={11} className="text-amber-400" />
                <span className="chip-value text-amber-300">{streakDays}-day streak</span>
              </span>
            )}
            <span className="stat-chip">
              Win rate{' '}
              <span className={`chip-value ${winPct >= 50 ? 'text-profit-bright' : 'text-loss-bright'}`}>
                {winPct.toFixed(0)}%
              </span>
              {winRateSeries.length >= 2 && (
                <Sparkline values={winRateSeries} positive={winPct >= 50} width={36} height={12} />
              )}
            </span>
            <span className="stat-chip">
              Profit factor{' '}
              <span className={`chip-value ${stats.profitFactor >= 1 ? 'text-profit-bright' : 'text-loss-bright'}`}>
                {stats.profitFactor >= 99 ? '∞' : stats.profitFactor.toFixed(2)}
              </span>
            </span>
            <span className="stat-chip">
              Avg win/loss <span className="chip-value">{stats.avgRR.toFixed(2)}</span>
            </span>
            <span className="stat-chip">
              Avg/trade{' '}
              <span className={`chip-value ${stats.avgProfitPerTrade >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>
                {fmt(stats.avgProfitPerTrade)}
              </span>
            </span>
            <span className="stat-chip">
              {stats.winningTrades}W <span className="text-loss-bright">{stats.losingTrades}L</span>
            </span>
          </div>
        )}
      </div>

      {hasTrades && (
        <div className="relative mt-2.5 md:mt-3.5 h-1 rounded-full bg-bg-primary/80 overflow-hidden flex">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-400"
            style={{ width: `${winPct}%` }}
          />
          <div
            className="h-full bg-gradient-to-r from-red-500/60 to-red-400/80"
            style={{ width: `${100 - winPct}%` }}
          />
        </div>
      )}

      {goalPnl > 0 && (
        <div className="relative mt-3 flex items-center gap-2.5">
          <Target size={13} className="text-sky-400 shrink-0" />
          <div className="flex-1 h-1.5 rounded-full bg-bg-primary/80 overflow-hidden">
            <div
              className={`h-full rounded-full ${
                stats.netPnl >= goalPnl
                  ? 'bg-gradient-to-r from-emerald-400 to-teal-300'
                  : 'bg-gradient-to-r from-sky-500 to-sky-300'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, (stats.netPnl / goalPnl) * 100))}%` }}
            />
          </div>
          <span className="text-[10px] md:text-xs text-text-secondary shrink-0">
            Goal {fmt(goalPnl)} ·{' '}
            <span className={stats.netPnl >= goalPnl ? 'text-profit-bright font-semibold' : 'text-text-primary'}>
              {stats.netPnl >= goalPnl
                ? 'hit 🎯'
                : `${Math.max(0, (stats.netPnl / goalPnl) * 100).toFixed(0)}%`}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
