import { useMemo, useState } from 'react';
import type { Trade } from '../../types';
import { useSettings } from '../../context/useSettings';
import { formatCurrency, toDateKey } from '../../utils/format';
import { tradesByDay } from '../../utils/tradingRules';
import { ruleStandingToday } from '../../utils/ruleStanding';
import { todayMeters, type MeterState } from '../../utils/todayMeters';

const BAR: Record<MeterState, string> = {
  ok: 'bg-profit-bright',
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

/** Stacked label, figure, bar — three across on a phone and a tablet, rows of their own in the rail. */
function Gauge({ label, value, used, state }: { label: string; value: string; used: number; state: MeterState }) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] xl:flex xl:items-baseline xl:justify-between xl:gap-2">
        <span className="block truncate text-text-secondary">{label}</span>
        <span className={`block tabular-nums font-semibold text-[14px] xl:text-[12px] ${TEXT[state]}`}>{value}</span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
        <div className={`h-full rounded-full ${BAR[state]}`} style={{ width: `${Math.round(used * 100)}%` }} />
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
 * Every rule the trader turned on gets a gauge; one they did not set gets nothing. With no rules at
 * all the card says how to get one, once, rather than drawing three empty bars. In the all-journals
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
  const dateLabel = new Date(`${today}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const message = (() => {
    if (viewingAllJournals) return 'Your limits are set per journal. Pick one to see today against them.';
    if (!rules.enabled) return null;
    if (dayTrades.length === 0) return 'No trades yet today.';
    const first = standing?.warnings[0]?.message ?? standing?.breaches[0]?.message;
    return first ?? 'Inside every limit you set.';
  })();

  return (
    <section className="panel-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">
          Today <span className="ml-1 text-xs font-normal text-text-secondary">{dateLabel}</span>
        </h2>
        {dayTrades.length > 0 && (
          <span className={`text-sm font-bold tabular-nums ${meters.dayPnl >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>
            {fmt(meters.dayPnl)}
          </span>
        )}
      </div>

      {!rules.enabled && !viewingAllJournals ? (
        <div className="mt-3">
          <p className="text-[13px] text-text-secondary leading-relaxed">
            Set a trade cap or a daily loss limit, and this card shows where today stands against it while you trade.
          </p>
          {onSetRules && (
            <button type="button" onClick={onSetRules} className="mt-3 btn-secondary text-xs px-3 py-1.5">
              Set your limits
            </button>
          )}
        </div>
      ) : (
        !viewingAllJournals && (
          <div className="mt-3 grid grid-cols-3 gap-3 xl:grid-cols-1">
            {meters.trades && (
              <Gauge
                label="Trades"
                value={`${meters.trades.count} of ${meters.trades.limit}`}
                used={meters.trades.used}
                state={meters.trades.state}
              />
            )}
            {meters.loss && (
              <Gauge label="Loss room" value={`${fmt(meters.loss.left)} left`} used={meters.loss.used} state={meters.loss.state} />
            )}
            {meters.streak && (
              <Gauge
                label="Losers in a row"
                value={`${meters.streak.current} of ${meters.streak.limit}`}
                used={meters.streak.used}
                state={meters.streak.state}
              />
            )}
          </div>
        )
      )}

      {message && <p className="mt-3 text-[12px] leading-relaxed text-text-secondary">{message}</p>}
    </section>
  );
}
