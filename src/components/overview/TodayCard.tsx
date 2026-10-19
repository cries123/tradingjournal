import { useMemo, useState } from 'react';
import type { Trade } from '../../types';
import { useSettings } from '../../context/useSettings';
import { formatCurrency, toDateKey } from '../../utils/format';
import { tradesByDay } from '../../utils/tradingRules';
import { ruleStandingToday } from '../../utils/ruleStanding';
import { todayMeters, type MeterState } from '../../utils/todayMeters';

const BAR: Record<MeterState, string> = {
  ok: 'bg-accent',
  near: 'bg-amber-400',
  at: 'bg-amber-400',
  over: 'bg-loss-bright',
};
const TEXT: Record<MeterState, string> = {
  ok: 'text-text-primary',
  near: 'text-amber-300',
  at: 'text-amber-300',
  over: 'text-loss-bright',
};

/**
 * One gauge, in the two shapes the designs give it: a row with the reading at the right in the
 * desktop rail ("3 of 3 used"), three across with the reading under the label on a phone ("3 / 3").
 */
function Gauge({
  label,
  wide,
  narrow,
  fill,
  state,
}: {
  label: string;
  wide: string;
  narrow: string;
  /** How much of the bar to draw, 0–1. */
  fill: number;
  state: MeterState;
}) {
  return (
    <div className="min-w-0">
      <div className="xl:mb-[5px] xl:flex xl:items-baseline xl:justify-between xl:gap-2">
        <span className="block truncate text-[11px] text-text-secondary xl:text-xs">{label}</span>
        <span className={`hidden xl:inline text-xs tabular-nums ${state === 'ok' ? 'text-text-secondary' : `font-semibold ${TEXT[state]}`}`}>{wide}</span>
        <span className={`mt-[3px] mb-1.5 block text-sm font-bold tabular-nums xl:hidden ${TEXT[state]}`}>{narrow}</span>
      </div>
      <div className="h-[5px] overflow-hidden rounded-full bg-[#242424] xl:h-1.5">
        <div className={`h-full rounded-full ${fill > 0 ? BAR[state] : ''}`} style={{ width: `${Math.max(fill > 0 ? 2 : 0, Math.round(fill * 100))}%` }} />
      </div>
    </div>
  );
}

interface TodayCardProps {
  /** The ACTIVE journal's trades — a limit is set for one account, like the rule banner reads. */
  trades: Trade[];
  /** Opens Settings, where the rules are set. */
  onSetRules?: () => void;
}

/**
 * Today, against the limits the trader set — read before the next trade, not after the last.
 *
 * Every rule the trader turned on gets a gauge: trades used of the cap, loss room left before the
 * daily stop (a full bar is all of it left), losers in a row against the streak rule. A rule they did
 * not set gets nothing. With no rules at all the card says how to get one, once. In the all-journals
 * view it stands aside like the breach list does: a limit is set for one account, and judging two
 * journals' trades against it would report a breach neither had.
 */
export function TodayCard({ trades, onSetRules }: TodayCardProps) {
  const { settings, viewingAllJournals } = useSettings();
  const rules = settings.tradingRules;
  const [today] = useState(() => toDateKey(new Date()));
  const dayTrades = useMemo(() => tradesByDay(trades).get(today) ?? [], [trades, today]);
  const meters = useMemo(() => todayMeters(dayTrades, rules), [dayTrades, rules]);
  const standing = useMemo(() => ruleStandingToday(trades, rules, today), [trades, rules, today]);
  const fmt = (n: number) => formatCurrency(n, settings.currency);
  const whole = (n: number) => fmt(Math.round(n)).replace(/\.00$/, '');
  const dateLabel = new Date(`${today}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).replace(',', '');

  const message = (() => {
    if (viewingAllJournals) return 'Your limits are set per journal. Pick one to see today against them.';
    if (!rules.enabled) return null;
    if (dayTrades.length === 0) return 'No trades yet today.';
    const first = standing?.warnings[0]?.message ?? standing?.breaches[0]?.message;
    return first ?? 'Inside every limit you set.';
  })();
  const warn = Boolean(standing && standing.level !== 'clear');

  return (
    <section className="panel-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-bold xl:text-sm xl:font-semibold">
          Today <span className="ml-1.5 text-[13px] font-normal text-text-secondary xl:text-xs">{dateLabel}</span>
        </h2>
        {dayTrades.length > 0 && (
          <span className={`text-[15px] font-bold tabular-nums ${meters.dayPnl >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>
            {meters.dayPnl > 0 ? '+' : ''}
            {fmt(meters.dayPnl)}
          </span>
        )}
      </div>

      {!rules.enabled && !viewingAllJournals ? (
        <div className="mt-3">
          <p className="text-[13px] leading-relaxed text-text-secondary">
            Set a trade cap or a daily loss limit, and this card shows where today stands against it while you trade.
          </p>
          {onSetRules && (
            <button type="button" onClick={onSetRules} className="mt-3 btn-secondary px-3 py-1.5 text-xs">
              Set your limits
            </button>
          )}
        </div>
      ) : (
        !viewingAllJournals && (
          <div className="mt-3 grid grid-cols-3 gap-2.5 xl:mt-2.5 xl:grid-cols-1 xl:gap-2.5">
            {meters.trades && (
              <Gauge
                label="Trades"
                wide={`${meters.trades.count} of ${meters.trades.limit} used`}
                narrow={`${meters.trades.count} / ${meters.trades.limit}`}
                fill={meters.trades.used}
                state={meters.trades.state}
              />
            )}
            {meters.loss && (
              <Gauge
                label="Loss room"
                wide={`${whole(meters.loss.left)} left`}
                narrow={whole(meters.loss.left)}
                fill={meters.loss.left / meters.loss.limit}
                state={meters.loss.state}
              />
            )}
            {meters.streak && (
              <Gauge
                label="Losers in a row"
                wide={`${meters.streak.current} of ${meters.streak.limit}`}
                narrow={`${meters.streak.current} / ${meters.streak.limit}`}
                fill={meters.streak.used}
                state={meters.streak.state === 'ok' ? 'ok' : meters.streak.state}
              />
            )}
          </div>
        )
      )}

      {message && (
        <p className="mt-3 flex items-center gap-2 text-[13px] leading-relaxed text-text-secondary xl:text-xs">
          {warn && <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-amber-400" aria-hidden />}
          {message}
        </p>
      )}
    </section>
  );
}
