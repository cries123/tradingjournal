import { Crosshair, Flame, Scissors } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { formatCurrency } from '../../utils/format';
import type { ExcursionInsights, RMultipleInsights } from '../../utils/tradeQuality';

interface ExecutionPanelProps {
  excursion: ExcursionInsights | null;
  rMultiple: RMultipleInsights | null;
}

function Row({
  icon,
  label,
  value,
  tone,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: 'profit' | 'loss' | 'neutral';
  detail: string;
}) {
  const valueClass =
    tone === 'profit' ? 'text-profit-bright' : tone === 'loss' ? 'text-loss-bright' : 'text-text-primary';

  return (
    <div className="flex items-start gap-3 py-2.5">
      <span className="mt-0.5 shrink-0 text-text-secondary">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs text-text-secondary">{label}</span>
          <span className={`text-sm font-bold tabular-nums shrink-0 ${valueClass}`}>{value}</span>
        </div>
        <p className="text-[11px] text-text-secondary/80 mt-0.5 leading-snug">{detail}</p>
      </div>
    </div>
  );
}

/**
 * Execution quality — what the trader did with the move, as opposed to whether the move happened.
 *
 * Everything here is driven by MAE/MFE/R fields that are optional and hand-entered, so the panel
 * renders nothing at all rather than a grid of dashes when a trader hasn't filled them in. Each
 * row states its own sample size, because "you capture 62% of the move" reads very differently
 * off four trades than off forty.
 */
export function ExecutionPanel({ excursion, rMultiple }: ExecutionPanelProps) {
  const { settings } = useSettings();
  if (!excursion && !rMultiple) return null;

  const money = (n: number) => formatCurrency(n, settings.currency);

  return (
    <div className="panel-card p-3 md:p-4">
      <div className="mb-1.5 md:mb-2.5">
        <p className="text-[10px] uppercase tracking-widest text-accent/80 font-medium mb-0.5">
          Execution
        </p>
        <h3 className="text-[10px] md:text-sm font-semibold text-text-primary">
          How well you played the move
        </h3>
      </div>

      <div className="divide-y divide-border/40">
        {excursion && excursion.winnerSample > 0 && (
          <Row
            icon={<Scissors size={14} />}
            label="Peak capture on winners"
            value={`${excursion.captureRate.toFixed(0)}%`}
            tone={excursion.captureRate >= 75 ? 'profit' : excursion.captureRate >= 55 ? 'neutral' : 'loss'}
            detail={
              excursion.leftOnTable > 0
                ? `${money(excursion.leftOnTable)} was on the screen and given back across ${excursion.winnerSample} winners.`
                : `You exited at or near the high on all ${excursion.winnerSample} winners.`
            }
          />
        )}

        {excursion && excursion.heatSample > 0 && (
          <Row
            icon={<Flame size={14} />}
            label="Heat taken"
            value={money(excursion.avgHeatOnLosers)}
            tone={
              excursion.avgHeatOnWinners > 0 && excursion.avgHeatOnLosers > excursion.avgHeatOnWinners * 1.5
                ? 'loss'
                : 'neutral'
            }
            detail={
              excursion.avgHeatOnWinners > 0
                ? `Average drawdown before you closed a loser, vs ${money(excursion.avgHeatOnWinners)} on trades that came back. ${
                    excursion.avgHeatOnLosers > excursion.avgHeatOnWinners * 1.5
                      ? 'You hold losers through more pain than winners.'
                      : 'Your pain tolerance is consistent either way.'
                  }`
                : `Average drawdown endured before closing a loser, across ${excursion.heatSample} trades.`
            }
          />
        )}

        {excursion && excursion.roundTrips > 0 && (
          <Row
            icon={<Crosshair size={14} />}
            label="Round trips"
            value={String(excursion.roundTrips)}
            tone="loss"
            detail={`${excursion.roundTrips} ${
              excursion.roundTrips === 1 ? 'trade was' : 'trades were'
            } green at some point and still closed red.`}
          />
        )}

        {rMultiple && (
          <Row
            icon={<Crosshair size={14} />}
            label="Average R"
            value={`${rMultiple.avgR >= 0 ? '+' : ''}${rMultiple.avgR.toFixed(2)}R`}
            tone={rMultiple.avgR > 0 ? 'profit' : rMultiple.avgR < 0 ? 'loss' : 'neutral'}
            detail={`Best ${rMultiple.best.toFixed(1)}R · worst ${rMultiple.worst.toFixed(1)}R · ${rMultiple.bigWinRate.toFixed(
              0,
            )}% hit 2R or better${
              rMultiple.overRiskRate > 0
                ? ` · ${rMultiple.overRiskRate.toFixed(0)}% lost more than 1R`
                : ''
            } (${rMultiple.sample} trades).`}
          />
        )}
      </div>
    </div>
  );
}
