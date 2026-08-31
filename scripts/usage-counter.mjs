#!/usr/bin/env node
/**
 * Read — and optionally give back — a user's daily allowance counters.
 *
 * Written after a Diamond user lost all three of their daily syncs to a SnapTrade outage: the
 * charge is taken before the pull, nothing refunded it when the pull failed, and the badge only
 * updated on success, so three failures in a row read as "3 left" the whole way down. Both halves
 * are fixed in the app now; this exists to check what a counter actually says and to hand back
 * anything that was spent on nobody's behalf.
 *
 * Usage:
 *   FIREBASE_SERVICE_ACCOUNT_JSON='<json>' node scripts/usage-counter.mjs --uid <uid>
 *   FIREBASE_SERVICE_ACCOUNT_JSON='<json>' node scripts/usage-counter.mjs --uid <uid> --kind sync --refund 3
 *   FIREBASE_SERVICE_ACCOUNT_JSON='<json>' node scripts/usage-counter.mjs --uid <uid> --kind sync --reset
 *
 * Reads by default. Nothing is written without --refund or --reset.
 */
import admin from 'firebase-admin';

const COLLECTIONS = { ai: 'aiUsage', sync: 'syncUsage', takeaway: 'takeawayUsage' };
const QUOTA_TIME_ZONE = 'America/New_York';

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
};
const has = (name) => process.argv.includes(`--${name}`);

const uid = arg('uid');
if (!uid) {
  console.error('Usage: node scripts/usage-counter.mjs --uid <uid> [--kind sync] [--refund N|--reset] [--day YYYY-MM-DD]');
  process.exit(1);
}

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
if (!raw) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set. Refusing to run.');
  process.exit(1);
}

/** Must match usageDay() in server/usage.ts — the allowance day is the market day, not UTC. */
function usageDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: QUOTA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
const db = admin.firestore();

const day = arg('day') ?? usageDay();
const kinds = arg('kind') ? [arg('kind')] : Object.keys(COLLECTIONS);

for (const kind of kinds) {
  const collection = COLLECTIONS[kind];
  if (!collection) {
    console.error(`Unknown kind "${kind}". One of: ${Object.keys(COLLECTIONS).join(', ')}`);
    process.exit(1);
  }

  const ref = db.doc(`${collection}/${uid}_${day}`);
  const snap = await ref.get();
  const used = snap.data()?.count ?? 0;
  console.log(`${kind.padEnd(9)} ${day}  used: ${used}`);

  const refund = has('reset') ? used : Number(arg('refund') ?? 0);
  if (!refund) continue;

  const next = Math.max(0, used - refund);
  await ref.set({ uid, day, count: next, updatedAt: new Date().toISOString() }, { merge: true });
  console.log(`${' '.repeat(9)} ${day}  -> ${next} (gave back ${used - next})`);
}

process.exit(0);
