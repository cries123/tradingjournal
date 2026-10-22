/**
 * A member's market replay data: whether one more pull of new data is allowed, and what the screens say.
 *
 * The allowance is TierLimits.replayUsdPerMonth — dollars of new data a month, at Databento's own
 * price — split evenly across the days of the month, with no carrying forward. Jay: "divided up so
 * it'll last him the whole month and they can't just use it in one day". It used to carry unused days
 * forward, which on the 20th let somebody who had not replayed yet spend $12.90 in an afternoon —
 * exactly the one-day binge the split exists to stop.
 *
 * Only data bought counts. A day anybody has already opened comes from the cache for nothing, so
 * running out stops new days and never stops a replay of a day already seen.
 *
 * Pure, so the server enforces exactly what the tests pin.
 */

/** Days in the calendar month of an Eastern day ('YYYY-MM-DD'). */
export function daysInMonth(day: string): number {
  const [y, m] = day.split('-').map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Number.isFinite(n) && n > 0 ? n : 31;
}

/** What one day may spend: the month's allowance over the days in that month (about 65¢ of $20). */
export function dailyAllowanceUsd(monthlyUsd: number, day: string): number {
  return monthlyUsd > 0 ? monthlyUsd / daysInMonth(day) : 0;
}

/** A member's spend as the ledger holds it, with in-flight pulls counted at their reserved estimate. */
export interface ReplaySpendState {
  dayUsd: number;
  monthUsd: number;
  /** Pulls under way right now, at the most each could cost. */
  pendingUsd: number;
}

export type ReplayRoom = { ok: true } | { ok: false; reason: 'day' | 'month' };

/**
 * Whether one more pull may start.
 *
 * Checked against what is recorded plus what is in flight, so two tabs (or a script) firing at once
 * see each other: each in-flight pull holds a reservation at the most it could cost until its real
 * price lands. The pull that crosses a line still goes through, because its price is only known once
 * Databento has priced what it returned; the overshoot is one request, a dozen charts at most.
 */
export function replayRoom(state: ReplaySpendState, monthlyUsd: number, day: string): ReplayRoom {
  if (!(monthlyUsd > 0)) return { ok: false, reason: 'month' };
  if (state.monthUsd + state.pendingUsd >= monthlyUsd) return { ok: false, reason: 'month' };
  if (state.dayUsd + state.pendingUsd >= dailyAllowanceUsd(monthlyUsd, day)) return { ok: false, reason: 'day' };
  return { ok: true };
}

/** A reservation still counts for this long; one older than any request can run belongs to a pull that died. */
export const PENDING_TTL_MS = 120_000;

interface LedgerDoc {
  usd?: unknown;
  days?: unknown;
  pending?: unknown;
}

const amount = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);

/** The member-month document as spend, and the reservations still live in it. */
export function ledgerState(
  data: unknown,
  day: string,
  nowMs: number,
): { state: ReplaySpendState; live: Record<string, { usd: number; at: string }> } {
  const d = (data ?? {}) as LedgerDoc;
  const days = d.days && typeof d.days === 'object' ? (d.days as Record<string, unknown>) : {};
  const live: Record<string, { usd: number; at: string }> = {};
  if (d.pending && typeof d.pending === 'object') {
    for (const [id, raw] of Object.entries(d.pending as Record<string, { usd?: unknown; at?: unknown }>)) {
      const at = typeof raw?.at === 'string' ? Date.parse(raw.at) : NaN;
      if (Number.isFinite(at) && nowMs - at < PENDING_TTL_MS) live[id] = { usd: amount(raw.usd), at: raw.at as string };
    }
  }
  return {
    state: {
      dayUsd: amount(days[day]),
      monthUsd: amount(d.usd),
      pendingUsd: Object.values(live).reduce((sum, p) => sum + p.usd, 0),
    },
    live,
  };
}

/** Today's and this month's use, each 0 to 1 of its allowance, for the replay screen. */
export function allowanceShares(state: ReplaySpendState, monthlyUsd: number, day: string): { today: number; month: number } {
  const share = (used: number, of: number) => (of > 0 ? Math.min(1, Math.max(0, used / of)) : 1);
  return { today: share(state.dayUsd, dailyAllowanceUsd(monthlyUsd, day)), month: share(state.monthUsd, monthlyUsd) };
}

/** "Under 1%" rather than "0%": a trader who has opened a few days has used something, just not much. */
export function replayUsedLabel(used: number): string {
  if (used <= 0) return 'none';
  if (used < 0.01) return 'under 1%';
  return `${Math.round(used * 100)}%`;
}

export const REPLAY_DAY_USED =
  'You have used today’s market replay data. It is split across the month so it lasts the whole month, so new days open again after midnight Eastern. Days you have already opened still play.';

export const REPLAY_MONTH_USED =
  'You have used this month’s market replay data. New days open again on the 1st. Days you have already opened still play.';
