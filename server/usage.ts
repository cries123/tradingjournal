import { getAdminFirestore } from './firebaseAdmin';

/**
 * Per-user daily counters, server-side.
 *
 * Both the assistant and broker sync are capped per tier, and both caps have to survive a user
 * who opens dev tools. So the count lives in Firestore, written only by the Admin SDK, keyed by
 * market day so it resets on its own with no cleanup job to forget about.
 */

export type UsageKind = 'ai' | 'sync';

const COLLECTION: Record<UsageKind, string> = {
  ai: 'aiUsage',
  sync: 'syncUsage',
};

/**
 * The day an allowance belongs to, in US market time rather than UTC.
 *
 * This used to be `toISOString().slice(0, 10)` — the UTC day, which rolls over at 8pm Eastern in
 * summer and 7pm in winter. A trader who had spent two of three syncs at 7:55pm found three again
 * at 8:01pm and reasonably concluded the counter was broken. It also quietly hands two days of
 * allowance to anyone who notices the pattern.
 *
 * America/New_York because this is a journal for US market hours: the day an allowance should
 * track is the trading day, and midnight Eastern is a boundary no session straddles. The key is
 * still a plain YYYY-MM-DD, so it still sorts and still expires on its own with no cleanup job.
 */
const QUOTA_TIME_ZONE = 'America/New_York';

export function usageDay(now: Date = new Date()): string {
  try {
    // en-CA renders as YYYY-MM-DD, which is exactly the key shape already in use.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: QUOTA_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch (err) {
    // A runtime without the timezone database would otherwise take broker sync down entirely.
    // Falling back to UTC keeps the cap enforced, just with the old rollover.
    console.error('[usage] timezone unavailable, falling back to UTC day:', err);
    return now.toISOString().slice(0, 10);
  }
}

/**
 * When the current allowance next resets, as an ISO timestamp.
 *
 * Sent to the client so "3 left" can say what it resets at. Half of why the old rollover was
 * confusing is that nothing on screen ever said when it happened.
 */
export function usageResetsAt(now: Date = new Date()): string {
  const today = usageDay(now);
  // Step forward an hour at a time until the market day changes, then walk back to the minute.
  // Crude on purpose: correct across both DST transitions without hand-rolled offset arithmetic,
  // and it runs at most ~85 cheap iterations.
  for (let hours = 1; hours <= 26; hours++) {
    const probe = new Date(now.getTime() + hours * 3_600_000);
    if (usageDay(probe) === today) continue;
    for (let back = 59; back >= 1; back--) {
      const earlier = new Date(probe.getTime() - back * 60_000);
      if (usageDay(earlier) !== today) {
        earlier.setSeconds(0, 0);
        return earlier.toISOString();
      }
    }
    probe.setSeconds(0, 0);
    return probe.toISOString();
  }
  return new Date(now.getTime() + 86_400_000).toISOString();
}

function usageDoc(kind: UsageKind, uid: string, day: string) {
  return getAdminFirestore().doc(`${COLLECTION[kind]}/${uid}_${day}`);
}

/** How many of today's allowance is already spent. Never throws — an unreadable counter reads 0. */
export async function readUsed(kind: UsageKind, uid: string): Promise<number> {
  try {
    const snap = await usageDoc(kind, uid, usageDay()).get();
    return (snap.data()?.count as number | undefined) ?? 0;
  } catch (err) {
    console.error(`[usage] read failed for ${kind}/${uid}:`, err);
    return 0;
  }
}

export type ConsumeResult =
  | { ok: true; remaining: number }
  | { ok: false; reason: 'capped' | 'not_included' | 'unavailable' };

/**
 * Spends one unit of the daily allowance, atomically.
 *
 * A transaction rather than a read-then-write because two tabs syncing at once would otherwise
 * both read the same count and both be allowed through. `limit === 0` is separated from "capped"
 * so the caller can say "your plan doesn't include this" instead of "you've used all 0 of your
 * daily syncs", which reads like a bug.
 */
export async function consumeDaily(
  kind: UsageKind,
  uid: string,
  limit: number,
): Promise<ConsumeResult> {
  if (limit <= 0) return { ok: false, reason: 'not_included' };

  const day = usageDay();
  const ref = usageDoc(kind, uid, day);
  const db = getAdminFirestore();

  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const used = (snap.data()?.count as number | undefined) ?? 0;
      if (used >= limit) return { ok: false as const, reason: 'capped' as const };

      tx.set(ref, { uid, day, count: used + 1, updatedAt: new Date().toISOString() }, { merge: true });
      return { ok: true as const, remaining: limit - (used + 1) };
    });
  } catch (err) {
    // Fail closed. Handing out unlimited requests because Firestore blinked is how a cap becomes
    // a bill — but report it as an outage, not a cap, so nobody goes looking for usage they
    // never had.
    console.error(`[usage] consume failed for ${kind}/${uid}:`, err);
    return { ok: false, reason: 'unavailable' };
  }
}

/**
 * Gives back a unit that was counted but never delivered.
 *
 * The allowance is spent before the expensive work runs (so a failure can't be retried for free
 * in a loop), which means a genuine server-side failure would otherwise cost the user a message
 * they never received. Best-effort on purpose: if the refund itself fails, the user is out one
 * unit, which is the right way round.
 */
export async function refundDaily(kind: UsageKind, uid: string): Promise<void> {
  const day = usageDay();
  const ref = usageDoc(kind, uid, day);
  const db = getAdminFirestore();

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const used = (snap.data()?.count as number | undefined) ?? 0;
      if (used <= 0) return;
      tx.set(ref, { uid, day, count: used - 1, updatedAt: new Date().toISOString() }, { merge: true });
    });
  } catch (err) {
    console.error(`[usage] refund failed for ${kind}/${uid}:`, err);
  }
}
