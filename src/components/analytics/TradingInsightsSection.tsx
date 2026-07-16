import { useMemo } from 'react';
import { Flame, Snowflake, TrendingDown, TrendingUp } from 'lucide-react';
import type { Trade } from '../../types';
import { useSettings } from '../../context/SettingsContext';
import { formatCurrency } from '../../utils/format';
import { computeTradingInsights } from '../../utils/insights';
import { checkRuleViolations } from '../../utils/tradingRules';

interface TradingInsightsSectionProps {
  trades: Trade[];
}

function formatDayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function EquitySparkline({ series }: { series: number[] }) {
  if (series.length < 2) return null;

  const width = 100;
  const height = 28;
  const min = Math.min(0, ...series);
  const max = Math.max(0, ...series);
  const range = max - min || 1;

  const points = series
    .map((value, i) => {
      const x = (i / (series.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const positive = series[series.length - 1] >= 0;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-8"
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke={positive ? 'rgb(52 211 153)' : 'rgb(248 113 113)'}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function TradingInsightsSection({ trades }: TradingInsightsSectionProps) {
  const { settings } = useSettings();
  const insights = useMemo(() => computeTradingInsights(trades), [trades]);
  const violations = useMemo(
    () => checkRuleViolations(trades, settings.tradingRules),
    [trades, settings.tradingRules],
  );

  if (!insights) return null;

  const currency = settings.currency;
  const streak = insights.streaks.current;

  const momentumDelta =
    insights.priorNet != null ? insights.recentNet - insights.priorNet : null;

  return (
    <section className="panel-card p-3 md:p-4 space-y-3">
      <div>
        <p className="text-[10px] uppercase tracking-widest text-emerald-400/80 font-medium">
          Trading insights
        </p>
        <h3 className="text-sm md:text-base font-semibold">What's working, what's not</h3>
      </div>

      {settings.tradingRules.enabled && violations.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 space-y-1">
          <p className="text-xs font-semibold text-amber-300">Rule violations ({violations.length})</p>
          {violations.slice(0, 3).map((v) => (
            <p key={`${v.date}-${v.type}`} className="text-[10px] text-text-secondary">
              {v.date}: {v.message}
            </p>
          ))}
        </div>
      )}

      {streak !== 0 && (
        <div
          className={`flex items-center gap-2.5 rounded-lg border p-2.5 ${
            streak > 0
              ? 'border-emerald-500/30 bg-emerald-500/5'
              : 'border-red-500/30 bg-red-500/5'
          }`}
        >
          {streak > 0 ? (
            <Flame size={16} className="text-emerald-400 shrink-0" />
          ) : (
            <Snowflake size={16} className="text-red-400 shrink-0" />
          )}
          <p className="text-xs">
            {streak > 0 ? (
              <>
                <span className="font-semibold text-emerald-300">
                  {streak} green day{streak === 1 ? '' : 's'} running
                </span>
                <span className="text-text-secondary"> · best run {insights.streaks.bestGreen}</span>
              </>
            ) : (
              <>
                <span className="font-semibold text-red-300">
                  {-streak} red day{streak === -1 ? '' : 's'} in a row
                </span>
                <span className="text-text-secondary">
                  {' '}· worst run {insights.streaks.worstRed} — consider sizing down
                </span>
              </>
            )}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <Metric
          label="Expectancy / trade"
          value={formatCurrency(insights.expectancyPerTrade, currency)}
          tone={insights.expectancyPerTrade >= 0 ? 'profit' : 'loss'}
        />
        <Metric
          label="Profit factor"
          value={
            insights.profitFactor === Infinity ? '∞' : insights.profitFactor.toFixed(2)
          }
          tone={insights.profitFactor >= 1 ? 'profit' : 'loss'}
        />
        <Metric
          label="Avg win / avg loss"
          value={
            insights.avgLoss > 0
              ? `${formatCurrency(insights.avgWin, currency)} / ${formatCurrency(-insights.avgLoss, currency)}`
              : formatCurrency(insights.avgWin, currency)
          }
        />
        <Metric
          label="Green days"
          value={`${insights.greenDays} of ${insights.greenDays + insights.redDays} (${insights.greenDayRate.toFixed(0)}%)`}
          tone={insights.greenDayRate >= 50 ? 'profit' : 'loss'}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <Metric
          label="Best day"
          value={
            insights.bestDay
              ? `${formatCurrency(insights.bestDay.pnl, currency)} · ${formatDayLabel(insights.bestDay.date)}`
              : '—'
          }
          tone="profit"
        />
        <Metric
          label="Worst day"
          value={
            insights.worstDay
              ? `${formatCurrency(insights.worstDay.pnl, currency)} · ${formatDayLabel(insights.worstDay.date)}`
              : '—'
          }
          tone="loss"
        />
        <Metric
          label="Max drawdown"
          value={formatCurrency(-insights.maxDrawdown, currency)}
          tone="loss"
        />
        <Metric label="Win rate" value={`${insights.winRate.toFixed(0)}%`} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="rounded-lg bg-bg-tertiary/50 border border-border/40 p-2.5">
          <p className="text-[9px] uppercase tracking-wide text-text-secondary mb-1.5 flex items-center gap-1">
            <TrendingUp size={11} className="text-emerald-400" /> Making you money
          </p>
          {insights.topSymbols.length === 0 ? (
            <p className="text-[10px] text-text-secondary">No profitable symbols yet.</p>
          ) : (
            <ul className="space-y-1">
              {insights.topSymbols.map((s) => (
                <li key={s.symbol} className="flex items-center justify-between text-xs">
                  <span className="font-medium">{s.symbol}</span>
                  <span className="text-text-secondary text-[10px]">
                    {s.trades} trade{s.trades === 1 ? '' : 's'} · {s.winRate.toFixed(0)}% win
                  </span>
                  <span className="font-semibold text-profit-bright">
                    {formatCurrency(s.pnl, currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg bg-bg-tertiary/50 border border-border/40 p-2.5">
          <p className="text-[9px] uppercase tracking-wide text-text-secondary mb-1.5 flex items-center gap-1">
            <TrendingDown size={11} className="text-red-400" /> Costing you money
          </p>
          {insights.bottomSymbols.length === 0 ? (
            <p className="text-[10px] text-text-secondary">No losing symbols. Nice.</p>
          ) : (
            <ul className="space-y-1">
              {insights.bottomSymbols.map((s) => (
                <li key={s.symbol} className="flex items-center justify-between text-xs">
                  <span className="font-medium">{s.symbol}</span>
                  <span className="text-text-secondary text-[10px]">
                    {s.trades} trade{s.trades === 1 ? '' : 's'} · {s.winRate.toFixed(0)}% win
                  </span>
                  <span className="font-semibold text-loss-bright">
                    {formatCurrency(s.pnl, currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-lg bg-bg-tertiary/50 border border-border/40 p-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <p className="text-[9px] uppercase tracking-wide text-text-secondary">Momentum</p>
          <p className="text-[10px] text-text-secondary">
            Last 5 sessions:{' '}
            <span
              className={`font-semibold ${
                insights.recentNet >= 0 ? 'text-profit-bright' : 'text-loss-bright'
              }`}
            >
              {formatCurrency(insights.recentNet, currency)}
            </span>
            {momentumDelta != null && (
              <span className="ml-1.5">
                {momentumDelta >= 0 ? '▲' : '▼'} vs prior 5
              </span>
            )}
          </p>
        </div>
        <EquitySparkline series={insights.equitySeries} />
        <p className="text-[9px] text-text-secondary mt-1">Cumulative net P&L by session</p>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'profit' | 'loss';
}) {
  const valueClass =
    tone === 'profit' ? 'text-profit-bright' : tone === 'loss' ? 'text-loss-bright' : 'text-text-primary';
  return (
    <div className="rounded-lg bg-bg-tertiary/50 border border-border/40 px-2.5 py-2">
      <p className="text-[9px] uppercase tracking-wide text-text-secondary">{label}</p>
      <p className={`text-sm font-semibold mt-0.5 ${valueClass}`}>{value}</p>
    </div>
  );
}
