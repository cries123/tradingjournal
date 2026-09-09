import { useMemo } from 'react';
import { Flame, Gauge, Snowflake, TrendingDown, TrendingUp } from 'lucide-react';
import type { Trade } from '../../types';
import { useSettings } from '../../context/useSettings';
import { formatCurrency } from '../../utils/format';
import { computeTradingInsights, EXPECTANCY_WINDOW, type TradingInsights } from '../../utils/insights';
import { computeTradingScore, type TradingScore } from '../../utils/tradingScore';
import type { Verdict } from '../../utils/metricVerdict';
import {
  drawdownVerdict,
  expectancyVerdict,
  profitFactorVerdict,
  winRateVerdict,
  VERDICT_TEXT_CLASS,
} from '../../utils/metricVerdict';
import { checkRuleViolations } from '../../utils/tradingRules';

interface TradingInsightsSectionProps {
  trades: Trade[];
}

function formatDayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function TradingInsightsSection({ trades }: TradingInsightsSectionProps) {
  const { settings } = useSettings();
  const insights = useMemo(() => computeTradingInsights(trades), [trades]);
  const score = useMemo(() => (insights ? computeTradingScore(insights) : null), [insights]);
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
        <p className="text-[10px] uppercase tracking-widest text-accent/80 font-medium">
          Trading insights
        </p>
        <h3 className="text-sm md:text-base font-semibold">What's working, what's not</h3>
      </div>

      {score && <ScoreCard score={score} insights={insights} />}

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
              ? 'border-accent/30 bg-accent/5'
              : 'border-red-500/30 bg-red-500/5'
          }`}
        >
          {streak > 0 ? (
            <Flame size={16} className="text-accent shrink-0" />
          ) : (
            <Snowflake size={16} className="text-red-400 shrink-0" />
          )}
          <p className="text-xs">
            {streak > 0 ? (
              <>
                <span className="font-semibold text-accent">
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
          verdict={expectancyVerdict(insights.expectancyPerTrade)}
        />
        <Metric
          label="Profit factor"
          value={
            insights.profitFactor === Infinity ? '∞' : insights.profitFactor.toFixed(2)
          }
          tone={insights.profitFactor >= 1 ? 'profit' : 'loss'}
          verdict={profitFactorVerdict(insights.profitFactor)}
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
          verdict={drawdownVerdict(
            insights.maxDrawdown,
            insights.equitySeries[insights.equitySeries.length - 1] ?? 0,
          )}
        />
        <Metric
          label="Win rate"
          value={`${insights.winRate.toFixed(0)}%`}
          verdict={winRateVerdict(insights.winRate, insights.avgWin, insights.avgLoss)}
        />
      </div>

      {/* The four the bigger journals lead with and this one never showed. Each says something the
          row above it cannot: what the payoff ratio demands, whether the drawdown was worth
          sitting through, how much of the year rode on one day, and whether any of it still
          holds. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <Metric
          label="Breakeven win rate"
          value={insights.requiredWinRate > 0 ? `${insights.requiredWinRate.toFixed(0)}%` : '—'}
          tone={insights.edgeGap >= 0 ? 'profit' : 'loss'}
          hint={
            insights.requiredWinRate > 0
              ? insights.edgeGap >= 0
                ? `You win ${insights.winRate.toFixed(0)}% — ${insights.edgeGap.toFixed(0)} points clear`
                : `You win ${insights.winRate.toFixed(0)}% — ${Math.abs(insights.edgeGap).toFixed(0)} points short`
              : undefined
          }
        />
        <Metric
          label="Recovery factor"
          value={insights.recoveryFactor !== 0 ? `${insights.recoveryFactor.toFixed(2)}×` : '—'}
          tone={insights.recoveryFactor >= 1 ? 'profit' : insights.recoveryFactor < 0 ? 'loss' : undefined}
          hint={
            insights.recoveryFactor !== 0
              ? insights.recoveryFactor >= 1
                ? 'Profit clears the deepest drawdown'
                : 'The drawdown was bigger than the profit'
              : 'No drawdown to recover from yet'
          }
        />
        <Metric
          label="Best day's share"
          value={insights.bestDayShare > 0 ? `${insights.bestDayShare.toFixed(0)}%` : '—'}
          tone={insights.bestDayShare >= 40 ? 'loss' : undefined}
          hint={
            insights.bestDayShare >= 40
              ? 'Most of the profit is one session — fragile'
              : 'Of everything you made gross'
          }
        />
        <Metric
          label={`Last ${EXPECTANCY_WINDOW} trades`}
          value={formatCurrency(insights.recentExpectancy, currency)}
          tone={insights.recentExpectancy >= 0 ? 'profit' : 'loss'}
          hint={
            insights.priorExpectancy == null
              ? 'Per trade, most recent window'
              : insights.recentExpectancy === insights.priorExpectancy
                ? // "Up from $25.90" when it is still $25.90 is the kind of small lie that makes
                  // somebody stop trusting the rest of the panel.
                  `Level with the ${EXPECTANCY_WINDOW} before`
                : `${insights.recentExpectancy > insights.priorExpectancy ? 'Up from' : 'Down from'} ${formatCurrency(insights.priorExpectancy, currency)} per trade`
          }
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <BreakdownPanel
          title="Making you money"
          tone="profit"
          emptyText="No profitable symbols yet."
          rows={insights.topSymbols.map((s) => ({
            key: s.symbol,
            label: s.symbol,
            detail: `${s.trades} trade${s.trades === 1 ? '' : 's'} · ${s.winRate.toFixed(0)}% win`,
            value: formatCurrency(s.pnl, currency),
          }))}
        />
        <BreakdownPanel
          title="Costing you money"
          tone="loss"
          emptyText="No losing symbols. Nice."
          rows={insights.bottomSymbols.map((s) => ({
            key: s.symbol,
            label: s.symbol,
            detail: `${s.trades} trade${s.trades === 1 ? '' : 's'} · ${s.winRate.toFixed(0)}% win`,
            value: formatCurrency(s.pnl, currency),
          }))}
        />
      </div>

      {(insights.topSetups.length > 0 || insights.bottomSetups.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <BreakdownPanel
            title="Setups that pay"
            tone="profit"
            emptyText="No profitable setups tagged yet."
            rows={insights.topSetups.map((s) => ({
              key: s.setup,
              label: s.setup,
              detail: `${s.trades} trade${s.trades === 1 ? '' : 's'} · ${s.winRate.toFixed(0)}% win`,
              value: formatCurrency(s.pnl, currency),
            }))}
          />
          <BreakdownPanel
            title="Setups that bleed"
            tone="loss"
            emptyText="No losing setups. Keep it up."
            rows={insights.bottomSetups.map((s) => ({
              key: s.setup,
              label: s.setup,
              detail: `${s.trades} trade${s.trades === 1 ? '' : 's'} · ${s.winRate.toFixed(0)}% win`,
              value: formatCurrency(s.pnl, currency),
            }))}
          />
        </div>
      )}

      <div className="rounded-lg bg-bg-tertiary/50 border border-border/40 px-2.5 py-2 flex flex-wrap items-center justify-between gap-2">
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
    </section>
  );
}

function BreakdownPanel({
  title,
  tone,
  emptyText,
  rows,
}: {
  title: string;
  tone: 'profit' | 'loss';
  emptyText: string;
  rows: { key: string; label: string; detail: string; value: string }[];
}) {
  return (
    <div className="rounded-lg bg-bg-tertiary/50 border border-border/40 p-2.5">
      <p className="text-[9px] uppercase tracking-wide text-text-secondary mb-1.5 flex items-center gap-1">
        {tone === 'profit' ? (
          <TrendingUp size={11} className="text-accent" />
        ) : (
          <TrendingDown size={11} className="text-red-400" />
        )}{' '}
        {title}
      </p>
      {rows.length === 0 ? (
        <p className="text-[10px] text-text-secondary">{emptyText}</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-2 text-xs">
              <span className="font-medium truncate">{row.label}</span>
              <span className="text-text-secondary text-[10px] shrink-0">{row.detail}</span>
              <span
                className={`font-semibold shrink-0 ${
                  tone === 'profit' ? 'text-profit-bright' : 'text-loss-bright'
                }`}
              >
                {row.value}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
  verdict,
  hint,
}: {
  label: string;
  value: string;
  tone?: 'profit' | 'loss';
  /** Short read on whether this number is good. Omitted for metrics that can't be honestly
   *  graded on their own — "best day" isn't good or bad, it's just a fact. */
  verdict?: Verdict;
  /** A plain sentence under the figure, for metrics whose meaning isn't in the number itself. */
  hint?: string;
}) {
  const valueClass =
    tone === 'profit' ? 'text-profit-bright' : tone === 'loss' ? 'text-loss-bright' : 'text-text-primary';
  return (
    <div className="rounded-lg bg-bg-tertiary/50 border border-border/40 px-2.5 py-2">
      <p className="text-[9px] uppercase tracking-wide text-text-secondary">{label}</p>
      <p className={`text-sm font-semibold mt-0.5 ${valueClass}`}>{value}</p>
      {verdict && (
        <p className={`text-[9px] mt-0.5 leading-snug ${VERDICT_TEXT_CLASS[verdict.tone]}`}>
          {verdict.label}
        </p>
      )}
      {!verdict && hint && (
        <p className="text-[9px] mt-0.5 leading-snug text-text-secondary">{hint}</p>
      )}
    </div>
  );
}

const BAND_CLASS: Record<TradingScore['band'], string> = {
  Strong: 'text-profit-bright',
  Solid: 'text-profit-bright',
  Developing: 'text-amber-300',
  'Needs work': 'text-loss-bright',
};

/**
 * The score, and the five things it is made of.
 *
 * Never the number on its own. A composite that cannot be taken apart is a horoscope, and the
 * component bars are what turn "62" into "your payoff is fine and your consistency is not" — which
 * is the sentence somebody can actually act on.
 */
function ScoreCard({ score, insights }: { score: TradingScore; insights: TradingInsights }) {
  return (
    <div className="rounded-xl border border-border/50 bg-bg-tertiary/30 p-3">
      <div className="flex items-start gap-4">
        <div className="shrink-0 text-center w-20">
          <p className="text-[9px] uppercase tracking-wide text-text-secondary">Score</p>
          <p className={`text-3xl font-bold tabular-nums leading-none mt-1 ${BAND_CLASS[score.band]}`}>
            {score.total}
          </p>
          <p className={`text-[10px] font-medium mt-1 ${BAND_CLASS[score.band]}`}>{score.band}</p>
        </div>

        <div className="flex-1 min-w-0 space-y-1">
          {score.components.map((component) => (
            <div key={component.id} className="flex items-center gap-2">
              <span className="text-[10px] text-text-secondary w-[4.5rem] shrink-0">
                {component.label}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-bg-primary overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent/80 transition-[width]"
                  style={{ width: `${Math.max(component.score, 2)}%` }}
                />
              </div>
              <span className="text-[9px] text-text-secondary/80 w-[8.5rem] shrink-0 text-right truncate">
                {component.detail}
              </span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-text-secondary leading-relaxed mt-2.5 flex items-start gap-1.5">
        <Gauge size={11} className="mt-0.5 shrink-0 text-text-secondary/60" />
        {score.thin
          ? `Five equally weighted measures of edge, payoff, profit factor, recovery and consistency — over ${insights.tradeCount} trades, which is a small sample to read hard.`
          : 'Five equally weighted measures: edge against the win rate your payoff demands, payoff, profit factor, recovery from drawdown, and how evenly the profit arrived.'}
      </p>
    </div>
  );
}
