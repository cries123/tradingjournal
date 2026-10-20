/**
 * A member's monthly market replay data: whether one more pull is allowed, and what the screen says.
 *
 * The allowance is TierLimits.replayUsdPerMonth — dollars of new data a month, priced by Databento
 * itself — and only data bought counts. A day anybody has already opened comes from the cache for
 * nothing, so running out stops new days and never stops a replay of a day already seen.
 *
 * It is released a day at a time so it lasts the month (Jay: "make sure it'll last him the whole
 * month"): by any day, a member may have used that day's share of it — a third on the 10th of a
 * 30-day month. What they do not use carries forward, so a quiet week is not lost; what they cannot
 * do is spend the month on its first day. Pure, so the server enforces exactly what the tests pin.
 */

/** How much of the month is released by this Eastern day ('YYYY-MM-DD'): day of month over days in it. */
export function monthShareSoFar(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (!Number.isFinite(d) || !Number.isFinite(daysInMonth) || daysInMonth <= 0) return 1;
  return Math.min(1, Math.max(0, d / daysInMonth));
}

/**
 * Whether a member with this much spent this month may pull new data today.
 *
 * Checked before the pull, against spend already recorded, so the pull that crosses the line goes
 * through and the next one is refused: a pull's price is only known once Databento has priced what
 * it returned, and refusing on an estimate would turn away cheap days too. The overshoot is one
 * request, a dozen charts at most.
 */
export function replayHasRoom(spentUsd: number, allowanceUsd: number, shareSoFar: number): boolean {
  return allowanceUsd > 0 && spentUsd < allowanceUsd * shareSoFar;
}

/** How much of the month's allowance is gone, 0 to 1. */
export function replayUsed(spentUsd: number, allowanceUsd: number): number {
  if (allowanceUsd <= 0) return 1;
  return Math.min(1, Math.max(0, spentUsd / allowanceUsd));
}

/** "Under 1%" rather than "0%": a trader who has opened a few days has used something, just not much. */
export function replayUsedLabel(used: number): string {
  if (used <= 0) return 'none';
  if (used < 0.01) return 'under 1%';
  return `${Math.round(used * 100)}%`;
}

export const REPLAY_PACED_OUT =
  'You have used the market replay data available so far this month. A little more opens each day so it lasts the whole month, so new days open again tomorrow. Days you have already opened still play.';
