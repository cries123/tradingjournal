#!/usr/bin/env node
/**
 * Record a payment the ledger missed.
 *
 * The billing ledger only sees Creem events from the moment it shipped, so sales made before it
 * existed — or any webhook that genuinely failed to arrive — leave a hole in the revenue column.
 * This fills one, deliberately and visibly.
 *
 * It is a script rather than a button because backfilling revenue should be inconvenient. Every
 * row it writes is stamped `backfilled: true` with a note, so a month's total can always be
 * separated back into what the processor reported and what a human asserted.
 *
 * Dating: the --at you give is the date it lands under. If a sale sits on a month boundary and you
 * want it counted in the following month, say so here — once, on the record — rather than by
 * teaching the code an exception it would apply forever.
 *
 * Usage:
 *   FIREBASE_SERVICE_ACCOUNT_JSON='<json>' node scripts/record-past-charge.mjs \
 *     --uid <uid> --tier silver --at 2026-09-01 --note "Aug 31 sale, counted in Sept"
 *
 *   Add --dry-run to see what it would write.
 */
import admin from 'firebase-admin';

const PRICES = { silver: 5, gold: 10, diamond: 25 };

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
};
const has = (name) => process.argv.includes(`--${name}`);

const uid = arg('uid');
const tier = (arg('tier') ?? '').toLowerCase();
const at = arg('at');
const note = arg('note') ?? '';
const dryRun = has('dry-run');

if (!uid || !PRICES[tier] || !/^\d{4}-\d{2}-\d{2}$/.test(at ?? '')) {
  console.error(
    'Usage: node scripts/record-past-charge.mjs --uid <uid> --tier silver|gold|diamond --at YYYY-MM-DD [--note "..."] [--dry-run]',
  );
  process.exit(1);
}

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
if (!raw) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set. Refusing to run.');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
const db = admin.firestore();

// Deterministic id from the facts, so running this twice writes the same row rather than banking
// the money a second time.
const id = `backfill_${uid}_${at}_${tier}`;
const amount = PRICES[tier];

const row = {
  uid,
  tier,
  amount,
  eventType: 'backfill',
  at: `${at}T12:00:00.000Z`,
  backfilled: true,
  note,
  recordedAt: new Date().toISOString(),
};

console.log(`billingCharges/${id}`);
console.log(JSON.stringify(row, null, 2));

if (dryRun) {
  console.log('\n--dry-run: nothing written.');
  process.exit(0);
}

const ref = db.doc(`billingCharges/${id}`);
const existing = await ref.get();
if (existing.exists) {
  console.log('\nAlready recorded — nothing to do.');
  process.exit(0);
}

await ref.set(row);
console.log(`\nRecorded $${amount.toFixed(2)} for ${tier} on ${at}.`);
process.exit(0);
