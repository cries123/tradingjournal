import type { TradingRules } from '../types/strategy';
import type { CurrencyCode } from '../types/settings';
import { formatCurrency } from './format';

/**
 * How the Assistant screen names a period, and the rules it was handed.
 *
 * The screen is given each period as the dashboard labels it — "September 2026", "2026", "All
 * time" — and needs it three more ways: short enough for the period toggle and a history row
 * ("Sep 2026"), as the thing a question is about ("What do you want to know about September?"),
 * and the trader's limits as the sentences the side rail lists. Pure, so each is tested alone.
 */

export type PeriodScope = 'month' | 'year' | 'all';

const MONTH_YEAR = /^([A-Z][a-z]+) (\d{4})$/;

/** "September 2026" → "Sep 2026". Anything that is not a month and a year is already short. */
export function shortPeriodLabel(label: string): string {
  const m = label.match(MONTH_YEAR);
  return m ? `${m[1].slice(0, 3)} ${m[2]}` : label;
}

/**
 * The period as the object of a question.
 *
 * A month drops its year — the toggle beside the question already says which — because "What do
 * you want to know about September 2026?" is a form label and "about September?" is a question.
 * All time becomes "all your trades": "about All time?" is not English.
 */
export function periodNoun(scope: PeriodScope, label: string): string {
  if (scope === 'all') return 'all your trades';
  if (scope === 'month') return label.match(MONTH_YEAR)?.[1] ?? label;
  return label;
}

/**
 * What the "let it read your notes" nudge says the trader wrote, or null when there is nothing.
 *
 * Trade notes and day notes are one switch, so the nudge counts both: "3 of these trades and 2 of
 * these days". It used to count trades alone, which hid the nudge from somebody who journals by
 * the day and never writes on a single trade.
 */
export function unreadNotesPhrase(tradeNotes: number, dayNotes: number): string | null {
  // "1 of these trades": "these" is the period's trades, so the noun stays plural at one.
  const part = (n: number, one: string) => `${n} of these ${one}s`;
  const parts = [tradeNotes > 0 ? part(tradeNotes, 'trade') : null, dayNotes > 0 ? part(dayNotes, 'day') : null].filter(Boolean);
  return parts.length > 0 ? parts.join(' and ') : null;
}

/** Whole currency when it is whole: "-$500", not "-$500.00", in a sentence about a limit. */
function limitMoney(value: number, currency: CurrencyCode): string {
  return formatCurrency(value, currency).replace(/[.,]00(?=\D*$)/, '');
}

/**
 * The trader's own limits, one sentence each: the trade cap first, as the design lists it.
 *
 * Empty when rules are off or none is set — and also when the screen was handed none at all,
 * which is what the all-journals view does on purpose (a limit belongs to one account). So the
 * list is exactly what the assistant can see, never what Settings happens to hold.
 */
export function ruleLines(rules: TradingRules | undefined, currency: CurrencyCode = 'USD'): string[] {
  if (!rules?.enabled) return [];
  const out: string[] = [];
  const positive = (n: number | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

  if (positive(rules.maxTradesPerDay)) {
    out.push(`Max ${rules.maxTradesPerDay} ${rules.maxTradesPerDay === 1 ? 'trade' : 'trades'} a day`);
  }
  if (positive(rules.maxDailyLoss)) {
    out.push(`Stop at ${limitMoney(-rules.maxDailyLoss, currency)} on the day`);
  }
  if (positive(rules.maxConsecutiveLosses)) {
    out.push(
      `Stop after ${rules.maxConsecutiveLosses} ${rules.maxConsecutiveLosses === 1 ? 'loser' : 'losers'} in a row`,
    );
  }
  if (positive(rules.maxDailyGain)) {
    out.push(`Stop at +${limitMoney(rules.maxDailyGain, currency)} on the day`);
  }
  return out;
}
