import { randomBytes } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from './firebaseAdmin';
import { logServerError } from './errorReports';
import { usageDay } from './usage';
import { ledgerState, replayRoom, type ReplaySpendState } from '../src/utils/replayAllowance';

/**
 * What market replay has spent on Databento, per member and across the site.
 *
 * All server-only (no security rule matches them), keyed by the Eastern day or month so they roll
 * over with no cleanup job:
 *
 *   replayMonths/{uid}_{month}   one member's month: `usd`, `days.{day}`, the in-flight `pending`
 *                                reservations, and bytes/charts/pulls for the admin panel
 *   replayStats/{day}            the site's day     — Ops → Market replay data
 *   replayStats/month-{month}    the site's month
 *
 * A pull is reserved before Databento is asked (at the most it could cost) and settled at Databento's
 * own price once its bars are in hand, so simultaneous requests cannot each slip under the allowance
 * on a reading taken before any of them was counted. Only data bought is recorded; a day served from
 * the cache costs nothing and never touches the ledger.
 */

const MEMBER_MONTHS = 'replayMonths';
const SITE = 'replayStats';

export function replayPeriods(now: Date = new Date()): { day: string; month: string } {
  const day = usageDay(now);
  return { day, month: day.slice(0, 7) };
}

const amount = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);

function memberRef(uid: string, month: string) {
  return getAdminFirestore().collection(MEMBER_MONTHS).doc(`${uid}_${month}`);
}

export interface ReplayPull {
  /** Databento's price for what was returned, in dollars. */
  usd: number;
  /** Its size as Databento bills it: one-minute bars at 56 bytes each in their binary encoding. */
  bytes: number;
  bars: number;
  /** Instrument-days bought: one contract's or one stock's session. */
  symbols: number;
  /** Priced from a rate because Databento's cost endpoint did not answer. */
  estimated: boolean;
}

export interface ReplayReservation {
  id: string;
  usd: number;
}

export type ReserveResult =
  | { ok: true; reservation: ReplayReservation; state: ReplaySpendState }
  | { ok: false; reason: 'day' | 'month'; state: ReplaySpendState };

/**
 * Holds room for a pull, or refuses it.
 *
 * In one transaction: read the member's month, count what is recorded and what is in flight, refuse
 * if either allowance is used, otherwise add this pull's reservation. `enforce: false` (the site
 * admin) never refuses but still reserves, so the pull is counted like anybody's. Throws when
 * Firestore cannot be reached: the caller refuses new data rather than guess at somebody's month.
 */
export async function reserveReplaySpend(
  uid: string,
  opts: { estimateUsd: number; monthlyUsd: number; enforce: boolean },
  now: Date = new Date(),
): Promise<ReserveResult> {
  const { day, month } = replayPeriods(now);
  const ref = memberRef(uid, month);
  return getAdminFirestore().runTransaction(async (tx) => {
    const data = ((await tx.get(ref)).data() ?? {}) as Record<string, unknown>;
    const { state, live } = ledgerState(data, day, now.getTime());
    if (opts.enforce) {
      const room = replayRoom(state, opts.monthlyUsd, day);
      if (!room.ok) return { ok: false as const, reason: room.reason, state };
    }
    const id = randomBytes(8).toString('hex');
    // A whole-document write, not a merge: a merge would keep the dead reservations this drops.
    tx.set(ref, {
      ...data,
      uid,
      month,
      pending: { ...live, [id]: { usd: opts.estimateUsd, at: now.toISOString() } },
      updatedAt: now.toISOString(),
    });
    return { ok: true as const, reservation: { id, usd: opts.estimateUsd }, state };
  });
}

/**
 * Replaces a reservation with what the pull really cost, or just drops it when the pull failed.
 *
 * Best-effort: the trader already has the bars, and failing their replay because a counter did not
 * save would be the wrong way round. A failure is reported, and the reservation runs out on its own
 * (PENDING_TTL_MS). Returns the member's spend afterwards, or null if it could not be written.
 */
export async function settleReplaySpend(
  uid: string,
  reservationId: string,
  pull: ReplayPull | null,
  now: Date = new Date(),
): Promise<ReplaySpendState | null> {
  const { day, month } = replayPeriods(now);
  const ref = memberRef(uid, month);
  try {
    const state = await getAdminFirestore().runTransaction(async (tx) => {
      const data = ((await tx.get(ref)).data() ?? {}) as Record<string, unknown>;
      const { live } = ledgerState(data, day, now.getTime());
      delete live[reservationId];
      const days = { ...((data.days as Record<string, number> | undefined) ?? {}) };
      const next: Record<string, unknown> = { ...data, uid, month, pending: live, updatedAt: now.toISOString() };
      if (pull) {
        days[day] = amount(days[day]) + pull.usd;
        Object.assign(next, {
          usd: amount(data.usd) + pull.usd,
          days,
          bytes: amount(data.bytes) + pull.bytes,
          bars: amount(data.bars) + pull.bars,
          symbols: amount(data.symbols) + pull.symbols,
          pulls: amount(data.pulls) + 1,
          estimatedPulls: amount(data.estimatedPulls) + (pull.estimated ? 1 : 0),
          lastPullAt: now.toISOString(),
        });
      }
      tx.set(ref, next);
      return ledgerState(next, day, now.getTime()).state;
    });
    if (pull) await recordSiteStats(uid, pull, now);
    return state;
  } catch (err) {
    console.error('[replay-ledger] could not settle a pull:', err);
    await logServerError('market-replay-ledger', err, { uid });
    return null;
  }
}

/** The site-wide day and month totals the Ops tab reads. Best-effort, like the member's settle. */
async function recordSiteStats(uid: string, pull: ReplayPull, now: Date): Promise<void> {
  const { day, month } = replayPeriods(now);
  const db = getAdminFirestore();
  const add = (n: number) => FieldValue.increment(n);
  const totals = {
    usd: add(pull.usd),
    bytes: add(pull.bytes),
    bars: add(pull.bars),
    symbols: add(pull.symbols),
    pulls: add(1),
    estimatedPulls: add(pull.estimated ? 1 : 0),
    members: { [uid]: true },
    updatedAt: now.toISOString(),
  };
  try {
    const batch = db.batch();
    batch.set(db.collection(SITE).doc(day), { day, ...totals }, { merge: true });
    batch.set(db.collection(SITE).doc(`month-${month}`), { month, ...totals }, { merge: true });
    await batch.commit();
  } catch (err) {
    console.error('[replay-ledger] could not record the site totals:', err);
    await logServerError('market-replay-ledger', err, { uid });
  }
}

/** A member's spend right now, for the replay screen's allowance line. Throws when unreadable. */
export async function readReplaySpendState(uid: string, now: Date = new Date()): Promise<ReplaySpendState> {
  const { day, month } = replayPeriods(now);
  const snap = await memberRef(uid, month).get();
  return ledgerState(snap.data(), day, now.getTime()).state;
}

/** One member's replay spend, for their profile in the admin panel. */
export interface MemberReplayUsage {
  todayUsd: number;
  monthUsd: number;
  lifetimeUsd: number;
  /** This month's data, charts bought, pulls, and how many of those were priced by estimate. */
  monthBytes: number;
  monthSymbols: number;
  monthPulls: number;
  monthEstimatedPulls: number;
  /** The last Eastern day they bought new data, if ever. */
  lastDay: string | null;
}

export async function readMemberReplayUsage(uid: string, now: Date = new Date()): Promise<MemberReplayUsage> {
  const { day, month } = replayPeriods(now);
  // Equality on one field rides Firestore's automatic index: nothing to build in the console.
  const snap = await getAdminFirestore().collection(MEMBER_MONTHS).where('uid', '==', uid).get();
  const out: MemberReplayUsage = {
    todayUsd: 0,
    monthUsd: 0,
    lifetimeUsd: 0,
    monthBytes: 0,
    monthSymbols: 0,
    monthPulls: 0,
    monthEstimatedPulls: 0,
    lastDay: null,
  };
  for (const doc of snap.docs) {
    const d = doc.data() as Record<string, unknown>;
    out.lifetimeUsd += amount(d.usd);
    const days = d.days && typeof d.days === 'object' ? (d.days as Record<string, unknown>) : {};
    for (const [k, v] of Object.entries(days)) if (amount(v) > 0 && (!out.lastDay || k > out.lastDay)) out.lastDay = k;
    if (d.month !== month) continue;
    out.todayUsd = amount(days[day]);
    out.monthUsd = amount(d.usd);
    out.monthBytes = amount(d.bytes);
    out.monthSymbols = amount(d.symbols);
    out.monthPulls = amount(d.pulls);
    out.monthEstimatedPulls = amount(d.estimatedPulls);
  }
  return out;
}

/** A month's replay spend across the site and per member, for the Costs tab. */
export async function readReplayMonthCosts(month: string): Promise<{ usd: number; perUser: Map<string, number> }> {
  const snap = await getAdminFirestore().collection(MEMBER_MONTHS).where('month', '==', month).get();
  const perUser = new Map<string, number>();
  let usd = 0;
  for (const doc of snap.docs) {
    const d = doc.data() as { uid?: unknown; usd?: unknown };
    const spent = amount(d.usd);
    usd += spent;
    if (typeof d.uid === 'string' && spent > 0) perUser.set(d.uid, (perUser.get(d.uid) ?? 0) + spent);
  }
  return { usd, perUser };
}

/** One period's site totals, for the Ops tab. */
export interface ReplayPeriodStats {
  period: string;
  usd: number;
  bytes: number;
  symbols: number;
  pulls: number;
  estimatedPulls: number;
  members: number;
}

function periodStats(period: string, data: unknown): ReplayPeriodStats {
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    period,
    usd: amount(d.usd),
    bytes: amount(d.bytes),
    symbols: amount(d.symbols),
    pulls: amount(d.pulls),
    estimatedPulls: amount(d.estimatedPulls),
    members: d.members && typeof d.members === 'object' ? Object.keys(d.members).length : 0,
  };
}

export interface ReplayStats {
  month: ReplayPeriodStats;
  /** The last fourteen days, newest first. */
  days: ReplayPeriodStats[];
}

export async function readReplayStats(now: Date = new Date()): Promise<ReplayStats> {
  const db = getAdminFirestore();
  const { month } = replayPeriods(now);
  const days = Array.from({ length: 14 }, (_, i) => usageDay(new Date(now.getTime() - i * 86_400_000)));
  const [monthSnap, ...daySnaps] = await Promise.all([
    db.collection(SITE).doc(`month-${month}`).get(),
    ...days.map((d) => db.collection(SITE).doc(d).get()),
  ]);
  return {
    month: periodStats(month, monthSnap.data()),
    days: days.map((d, i) => periodStats(d, daySnaps[i].data())),
  };
}
