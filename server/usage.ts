import { getAdminFirestore } from './firebaseAdmin';

/**
 * Per-user daily counters, server-side.
 *
 * Both the assistant and broker sync are capped per tier, and both caps have to survive a user
 * who opens dev tools. So the count lives in Firestore, written only by the Admin SDK, keyed by
 * market day so it resets on its own with no cleanup job to forget about.
 */

export type UsageKind = 'ai' | 'sync' | 'takeaway';

/**
 * The kinds an admin can top up with credits.
 *
 * The takeaway has no place here: it is generated for everyone at a flat cap nobody notices, and a
 * credit for it would be a credit for a thing no one has ever asked for more of.
 */
export type CreditKind = 'ai' | 'sync';

export function isCreditKind(value: unknown): value is CreditKind {
  return value === 'ai' || value === 'sync';
}

const COLLECTION: Record<UsageKind, string> = {
  ai: 'aiUsage',
  sync: 'syncUsage',
  // The dashboard takeaway is deliberately NOT counted against 'ai'. It is generated for everyone,
  // free tiers included, because one sharp read of their own month is the best argument for the
  // assistant there is — and because charging a paid user chat messages for a banner they never
  // asked for would be a strange way to spend their allowance. Its own counter, its own cap.
  takeaway: 'takeawayUsage',
};

/*
 * One day's counter, in full.
 *
 * `count` is everything spent today, whatever paid for it — it is what the cost report reads, and
 * a sync funded by a credit still cost the SnapTrade call. `bonus` is how many of those came out
 * of the user's credit bank, and `forgiven` is how many an admin handed back. What stands against
 * the daily cap is what is left once both are taken off. Keeping all three, rather than
 * decrementing `count`, means giving somebody their syncs back never erases the record that the
 * calls were made.
 */
export interface UsageDay {
  count: number;
  bonus: number;
  forgiven: number;
}

const EMPTY_DAY: UsageDay = { count: 0, bonus: 0, forgiven: 0 };

function wholeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function readUsageDay(data: unknown): UsageDay {
  const d = (data ?? {}) as Partial<Record<keyof UsageDay, unknown>>;
  return { count: wholeNumber(d.count), bonus: wholeNumber(d.bonus), forgiven: wholeNumber(d.forgiven) };
}

/** The units that count against today's cap. */
export function dailyUnitsSpent(day: UsageDay): number {
  return Math.max(0, day.count - day.bonus - day.forgiven);
}

/**
 * Extra units that sit outside the daily cap and are spent only once it is reached.
 *
 * One document per user, not per day: a credit is compensation or a favour, and either would be
 * an odd thing to have expire at midnight. Written only by the Admin SDK, like the counters.
 */
export interface UsageCredits {
  sync: number;
  ai: number;
}

export const NO_CREDITS: UsageCredits = { sync: 0, ai: 0 };

/** The most an account can hold of either kind. A typo in the admin panel should not mint infinity. */
export const MAX_CREDITS = 1000;

export function readCredits(data: unknown): UsageCredits {
  const d = (data ?? {}) as Partial<Record<CreditKind, unknown>>;
  return {
    sync: Math.min(MAX_CREDITS, wholeNumber(d.sync)),
    ai: Math.min(MAX_CREDITS, wholeNumber(d.ai)),
  };
}

function creditsDoc(uid: string) {
  return getAdminFirestore().doc(`usageCredits/${uid}`);
}

export type SpendSource = 'daily' | 'credit';

export type SpendDecision =
  | { allowed: true; source: SpendSource; remaining: number; credits: number }
  | { allowed: false; reason: 'capped' | 'not_included' };

/**
 * What one request does to the day, decided in one place so the transaction below stays thin
 * enough to read.
 *
 * Credits never unlock a feature the plan does not include — a Silver account with AI credits is a
 * mistake in the admin panel, not a trial — and they are only touched once the daily allowance is
 * gone, so a credit is always the last thing spent and the first thing a refund puts back.
 */
export function decideSpend(day: UsageDay, limit: number, credits: number): SpendDecision {
  if (limit <= 0) return { allowed: false, reason: 'not_included' };
  const used = dailyUnitsSpent(day);
  if (used < limit) return { allowed: true, source: 'daily', remaining: limit - used - 1 + credits, credits };
  if (credits > 0) return { allowed: true, source: 'credit', remaining: credits - 1, credits: credits - 1 };
  return { allowed: false, reason: 'capped' };
}

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
    return dailyUnitsSpent(readUsageDay(snap.data()));
  } catch (err) {
    console.error(`[usage] read failed for ${kind}/${uid}:`, err);
    return 0;
  }
}

/** Today's counter in full, for the admin panel. Never throws. */
export async function readUsageToday(kind: UsageKind, uid: string): Promise<UsageDay> {
  try {
    const snap = await usageDoc(kind, uid, usageDay()).get();
    return readUsageDay(snap.data());
  } catch (err) {
    console.error(`[usage] read failed for ${kind}/${uid}:`, err);
    return EMPTY_DAY;
  }
}

/** The credit bank. Never throws — an unreadable bank is empty, which is the safe direction. */
export async function readUserCredits(uid: string): Promise<UsageCredits> {
  try {
    const snap = await creditsDoc(uid).get();
    return readCredits(snap.data());
  } catch (err) {
    console.error(`[usage] credits read failed for ${uid}:`, err);
    return NO_CREDITS;
  }
}

export type ConsumeResult =
  /** `remaining` counts everything still available today, credits included; `credits` is the bank alone. */
  | { ok: true; remaining: number; source: SpendSource; credits: number }
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

  const bank = isCreditKind(kind) ? creditsDoc(uid) : null;

  try {
    return await db.runTransaction(async (tx) => {
      const [snap, bankSnap] = await Promise.all([tx.get(ref), bank ? tx.get(bank) : null]);
      const today = readUsageDay(snap.data());
      const credits = bank && isCreditKind(kind) ? readCredits(bankSnap?.data())[kind] : 0;
      const decision = decideSpend(today, limit, credits);
      if (!decision.allowed) return { ok: false as const, reason: decision.reason };

      const updatedAt = new Date().toISOString();
      const fromCredit = decision.source === 'credit';
      tx.set(
        ref,
        { uid, day, count: today.count + 1, bonus: today.bonus + (fromCredit ? 1 : 0), forgiven: today.forgiven, updatedAt },
        { merge: true },
      );
      if (fromCredit && bank) tx.set(bank, { [kind]: credits - 1, updatedAt }, { merge: true });

      return { ok: true as const, remaining: decision.remaining, source: decision.source, credits: decision.credits };
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
export async function refundDaily(kind: UsageKind, uid: string, source: SpendSource = 'daily'): Promise<void> {
  const day = usageDay();
  const ref = usageDoc(kind, uid, day);
  const db = getAdminFirestore();
  // A unit that came out of the credit bank goes back into it. Refunding it to the day instead
  // would hand back an allowance that expires at midnight in place of one that does not.
  const bank = source === 'credit' && isCreditKind(kind) ? creditsDoc(uid) : null;

  try {
    await db.runTransaction(async (tx) => {
      const [snap, bankSnap] = await Promise.all([tx.get(ref), bank ? tx.get(bank) : null]);
      const today = readUsageDay(snap.data());
      if (today.count <= 0) return;

      const updatedAt = new Date().toISOString();
      const bonus = bank ? Math.max(0, today.bonus - 1) : today.bonus;
      tx.set(ref, { uid, day, count: today.count - 1, bonus, forgiven: today.forgiven, updatedAt }, { merge: true });
      if (bank && isCreditKind(kind)) {
        const credits = readCredits(bankSnap?.data())[kind];
        tx.set(bank, { [kind]: Math.min(MAX_CREDITS, credits + 1), updatedAt }, { merge: true });
      }
    });
  } catch (err) {
    console.error(`[usage] refund failed for ${kind}/${uid}:`, err);
  }
}

/* ------------------------------------------------------------------ admin */

/**
 * Hands today's spent allowance back, without pretending the calls were never made.
 *
 * `forgiven` goes up by what was standing against the cap; `count` is left alone, so the cost
 * report still sees every call. Returns how many units the person got back.
 */
export async function forgiveToday(kind: CreditKind, uid: string): Promise<number> {
  const day = usageDay();
  const ref = usageDoc(kind, uid, day);

  return getAdminFirestore().runTransaction(async (tx) => {
    const today = readUsageDay((await tx.get(ref)).data());
    const spent = dailyUnitsSpent(today);
    if (spent === 0) return 0;
    tx.set(
      ref,
      { uid, day, count: today.count, bonus: today.bonus, forgiven: today.forgiven + spent, updatedAt: new Date().toISOString() },
      { merge: true },
    );
    return spent;
  });
}

/**
 * Adds to (or takes from) the credit bank. Floors at zero and ceilings at MAX_CREDITS; returns the
 * balance the account now holds.
 */
export async function adjustCredits(kind: CreditKind, uid: string, delta: number): Promise<number> {
  const bank = creditsDoc(uid);

  return getAdminFirestore().runTransaction(async (tx) => {
    const current = readCredits((await tx.get(bank)).data())[kind];
    const next = Math.max(0, Math.min(MAX_CREDITS, current + Math.trunc(delta)));
    tx.set(bank, { uid, [kind]: next, updatedAt: new Date().toISOString() }, { merge: true });
    return next;
  });
}
