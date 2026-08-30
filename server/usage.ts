import { getAdminFirestore } from './firebaseAdmin';

/**
 * Per-user daily counters, server-side.
 *
 * Both the assistant and broker sync are capped per tier, and both caps have to survive a user
 * who opens dev tools. So the count lives in Firestore, written only by the Admin SDK, keyed by
 * UTC day so it resets on its own with no cleanup job to forget about.
 */

export type UsageKind = 'ai' | 'sync';

const COLLECTION: Record<UsageKind, string> = {
  ai: 'aiUsage',
  sync: 'syncUsage',
};

export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function usageDoc(kind: UsageKind, uid: string, day: string) {
  return getAdminFirestore().doc(`${COLLECTION[kind]}/${uid}_${day}`);
}

/** How many of today's allowance is already spent. Never throws — an unreadable counter reads 0. */
export async function readUsed(kind: UsageKind, uid: string): Promise<number> {
  try {
    const snap = await usageDoc(kind, uid, utcDay()).get();
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

  const day = utcDay();
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
  const day = utcDay();
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
