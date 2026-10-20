import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from './firebaseAdmin';
import { logServerError } from './errorReports';
import { usageDay } from './usage';

/**
 * What market replay has spent on Databento, per member and across the site.
 *
 * Three running totals, all server-only (no security rule matches them), keyed by the Eastern day or
 * month so they roll over with no cleanup job:
 *
 *   replayMonths/{uid}_{month}   one member's month — what their monthly allowance is checked against
 *   replayStats/{day}            the site's day     — the admin panel's daily rows
 *   replayStats/month-{month}    the site's month   — the admin panel's headline
 *
 * Only data bought from Databento is recorded. A day served from the cache costs nothing and is never
 * counted, which is what lets an allowance stop new pulls without ever stopping a replay of a day
 * somebody has already opened.
 */

const MEMBER_MONTHS = 'replayMonths';
const SITE = 'replayStats';

export function replayPeriods(now: Date = new Date()): { day: string; month: string } {
  const day = usageDay(now);
  return { day, month: day.slice(0, 7) };
}

const amount = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);

/** This month's spend for one member, in dollars. Throws when Firestore cannot be read: the caller refuses new pulls rather than guess. */
export async function readReplayMonthSpend(uid: string, now: Date = new Date()): Promise<number> {
  const { month } = replayPeriods(now);
  const snap = await getAdminFirestore().collection(MEMBER_MONTHS).doc(`${uid}_${month}`).get();
  return amount((snap.data() as Record<string, unknown> | undefined)?.usd);
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

/**
 * Adds one pull to all three totals in one batch.
 *
 * Best-effort: the trader already has the bars, and failing their replay because a counter did not
 * save would be the wrong way round. A failure is reported, because an unrecorded pull is spend the
 * allowance cannot see.
 */
export async function recordReplayPull(uid: string, pull: ReplayPull, now: Date = new Date()): Promise<void> {
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
    updatedAt: now.toISOString(),
  };
  const site = { ...totals, members: { [uid]: true } };
  try {
    const batch = db.batch();
    batch.set(db.collection(MEMBER_MONTHS).doc(`${uid}_${month}`), { uid, month, ...totals }, { merge: true });
    batch.set(db.collection(SITE).doc(day), { day, ...site }, { merge: true });
    batch.set(db.collection(SITE).doc(`month-${month}`), { month, ...site }, { merge: true });
    await batch.commit();
  } catch (err) {
    console.error('[replay-ledger] could not record a pull:', err);
    await logServerError('market-replay-ledger', err, { uid });
  }
}

/** One period's site totals, for the admin panel. */
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
