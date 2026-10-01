import type { Trade } from '../types';
import type { TradingRules } from '../types/strategy';
import { effectivePnl } from './tradeHelpers';

export interface RuleViolation {
  date: string;
  type: 'max_loss' | 'max_trades' | 'max_gain' | 'max_streak';
  message: string;
}

/**
 * Trades grouped by day, each day in the order they happened.
 *
 * Exported and shared, because three things now need the same answer — the violations list, the
 * live banner and the simulator — and a rule about a SEQUENCE is only meaningful if all three
 * agree what the sequence is. Two copies of an ordering rule drifting is the same shape of bug as
 * the two chunk-error lists.
 *
 * entryTime where it exists, import sequence where it does not. Schwab's feed sends a date with no
 * fill time, so for most journals here the sequence the importer produced — it walks the broker's
 * activity rows in order — is the only signal there is.
 *
 * That sequence lives in the document id, and reading it needs the tie-break below. Without one, this
 * sorted on entryTime alone, which is undefined for every Schwab fill, so a stable sort left whatever
 * order the caller happened to have — for a Firestore snapshot, lexicographic document id. The
 * importer's index was not padded either, so `_10` came before `_2` and an eleven-trade day replayed
 * in an order that was not even the importer's. On a day of (+500, −100, −100, −900) with a cap of
 * two, that is the difference between the simulator reporting +$1,000 saved and −$400 lost: the same
 * trades, the opposite conclusion, rendered in green with a plus sign either way.
 *
 * It is still an approximation for a broker that sends no times, and the panels built on it say "the
 * next trade" rather than claiming a clock. But it is now the importer's actual order rather than an
 * artefact of string collation, and the same order every time it is asked.
 */
export function tradesByDay(trades: Trade[]): Map<string, Trade[]> {
  const byDay = new Map<string, Trade[]>();

  for (const trade of trades) {
    if (!trade.date) continue;
    const list = byDay.get(trade.date);
    if (list) list.push(trade);
    else byDay.set(trade.date, [trade]);
  }

  for (const list of byDay.values()) {
    list.sort((a, b) => {
      const byTime = (a.entryTime ?? '').localeCompare(b.entryTime ?? '');
      if (byTime !== 0) return byTime;
      // Both without a time, or the same time: fall back to the id, which carries the import index.
      return (a.id ?? '').localeCompare(b.id ?? '');
    });
  }
  return byDay;
}

/**
 * The longest run of losing trades inside one day.
 *
 * A scratch — exactly zero — neither extends a streak nor breaks it. It is not a loss, and
 * counting it as a win would reset a run of losers on a trade where nothing actually happened.
 */
export function longestLosingStreak(dayTrades: Trade[]): number {
  let longest = 0;
  let current = 0;

  for (const trade of dayTrades) {
    const pnl = effectivePnl(trade);
    if (pnl < 0) {
      current += 1;
      if (current > longest) longest = current;
    } else if (pnl > 0) {
      current = 0;
    }
  }

  return longest;
}

export function checkRuleViolations(trades: Trade[], rules: TradingRules): RuleViolation[] {
  if (!rules.enabled) return [];

  const violations: RuleViolation[] = [];

  for (const [date, dayTrades] of tradesByDay(trades)) {
    const dayPnl = dayTrades.reduce((s, t) => s + effectivePnl(t), 0);

    if (rules.maxDailyLoss != null && dayPnl <= -Math.abs(rules.maxDailyLoss)) {
      violations.push({ date, type: 'max_loss', message: `Daily loss ${dayPnl.toFixed(0)} exceeded limit` });
    }
    if (rules.maxDailyGain != null && dayPnl >= rules.maxDailyGain) {
      violations.push({ date, type: 'max_gain', message: `Daily gain ${dayPnl.toFixed(0)} exceeded target cap` });
    }
    if (rules.maxTradesPerDay != null && dayTrades.length > rules.maxTradesPerDay) {
      violations.push({
        date,
        type: 'max_trades',
        message: `${dayTrades.length} trades exceeded max ${rules.maxTradesPerDay}`,
      });
    }
    if (rules.maxConsecutiveLosses != null && rules.maxConsecutiveLosses > 0) {
      const streak = longestLosingStreak(dayTrades);
      if (streak > rules.maxConsecutiveLosses) {
        violations.push({
          date,
          type: 'max_streak',
          message: `${streak} losses in a row passed your limit of ${rules.maxConsecutiveLosses}`,
        });
      }
    }
  }

  return violations.sort((a, b) => b.date.localeCompare(a.date));
}
