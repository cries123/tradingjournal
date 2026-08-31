#!/usr/bin/env node
/**
 * One-time cleanup: remove `username` from anonymous leaderboard entries.
 *
 * upsertLeaderboardEntry used to write the real username onto every leaderboardEntries doc,
 * including entries the user had marked anonymous. leaderboardEntries is world-readable by design
 * (the board is queried straight from the client), so the anonymity setting hid the name in the UI
 * and nowhere else.
 *
 * The app no longer writes it, and because upsert does a full setDoc rather than a merge, any user
 * who trades again overwrites their own document and the field disappears on its own. This script
 * exists for everyone who does not: their name is still sitting in a public document until it is
 * removed here.
 *
 * Usage:
 *   FIREBASE_SERVICE_ACCOUNT_JSON='<service account json>' node scripts/backfill-anonymous-leaderboard.mjs --dry-run
 *   FIREBASE_SERVICE_ACCOUNT_JSON='<service account json>' node scripts/backfill-anonymous-leaderboard.mjs --commit
 *
 * Defaults to a dry run: it will not write anything unless --commit is passed.
 */
import admin from 'firebase-admin';

const COLLECTION = 'leaderboardEntries';
const BATCH_LIMIT = 400; // Firestore caps a batch at 500 writes; leave headroom.

const commit = process.argv.includes('--commit');
if (!commit && !process.argv.includes('--dry-run')) {
  console.log('Neither --dry-run nor --commit given; assuming --dry-run.\n');
}

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
if (!raw) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set. Refusing to run.');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
const db = admin.firestore();

const snapshot = await db.collection(COLLECTION).get();

// Only documents that are BOTH anonymous and still carrying a username need touching. Checking
// both means a re-run after a partial failure is a no-op rather than a second pass of writes.
const offenders = snapshot.docs.filter((doc) => {
  const data = doc.data();
  return data.isAnonymous === true && typeof data.username === 'string';
});

console.log(`${snapshot.size} entr${snapshot.size === 1 ? 'y' : 'ies'} scanned.`);
console.log(`${offenders.length} anonymous entr${offenders.length === 1 ? 'y' : 'ies'} still carrying a username.`);

if (offenders.length === 0) {
  console.log('Nothing to do.');
  process.exit(0);
}

// uids only — printing the usernames would copy the very thing being removed into a terminal
// scrollback and whatever CI log is capturing it.
for (const doc of offenders) console.log(`  ${doc.id}`);

if (!commit) {
  console.log('\nDry run — nothing written. Re-run with --commit to apply.');
  process.exit(0);
}

let written = 0;
for (let i = 0; i < offenders.length; i += BATCH_LIMIT) {
  const batch = db.batch();
  for (const doc of offenders.slice(i, i + BATCH_LIMIT)) {
    batch.update(doc.ref, { username: admin.firestore.FieldValue.delete() });
  }
  await batch.commit();
  written += Math.min(BATCH_LIMIT, offenders.length - i);
  console.log(`  committed ${written}/${offenders.length}`);
}

console.log(`\nDone. Removed username from ${written} anonymous entr${written === 1 ? 'y' : 'ies'}.`);
process.exit(0);
