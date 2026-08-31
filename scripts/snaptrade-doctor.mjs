#!/usr/bin/env node
/**
 * Answers one question: is broker connect broken because of SnapTrade, or because of us?
 *
 * Every failure in the broker path reaches the user as the same sentence, so the two causes are
 * indistinguishable from the outside — and they need opposite responses. This separates them by
 * making three calls in increasing order of what they prove:
 *
 *   1. Their public status endpoint. No credentials. If this is down, nothing else matters.
 *   2. listAllBrokerages, which needs a valid clientId + consumerKey and nothing else. This is the
 *      one that catches a rotated or mistyped consumer key — the failure that looks exactly like a
 *      broken user connection but is neither.
 *   3. Optionally listUserAccounts for one uid, which additionally needs that user's stored
 *      userSecret to be valid for these credentials. This is what breaks when the credentials
 *      change environment (test to production) while the stored secrets stay behind.
 *
 * Usage:
 *   SNAPTRADE_CLIENT_ID=... SNAPTRADE_CONSUMER_KEY=... node scripts/snaptrade-doctor.mjs
 *   ... plus FIREBASE_SERVICE_ACCOUNT_JSON=... --uid <uid>   to also test one user's secret
 *
 * Read-only. Registers nothing, deletes nothing, connects nothing.
 */
import { Snaptrade, SnaptradeAuth } from 'snaptrade-typescript-sdk';

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
};

const clientId = process.env.SNAPTRADE_CLIENT_ID?.trim();
const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY?.trim();

const line = (label, ok, detail) =>
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(34)} ${detail ?? ''}`);

console.log('');
console.log('SnapTrade diagnostics');
console.log('─'.repeat(72));

// --- 0. Is anything configured at all? -------------------------------------
if (!clientId || !consumerKey) {
  line('credentials present', false, 'SNAPTRADE_CLIENT_ID / SNAPTRADE_CONSUMER_KEY not set');
  console.log('\nNothing else can be tested without them. In Netlify these live under');
  console.log('Site configuration -> Environment variables.\n');
  process.exit(1);
}
// The id is safe to print and is the fastest way to catch the classic mistake of a test client id
// sitting in production. The consumer key is never printed.
line('credentials present', true, `client id: ${clientId}`);
if (/test/i.test(clientId)) {
  console.log('      ^ this is a TEST client id. Test credentials cannot reach real brokerage');
  console.log('        accounts — connecting Schwab or Robinhood for real needs production keys.');
}

// --- 1. Is their API up? ---------------------------------------------------
let apiOnline = false;
try {
  const res = await fetch('https://api.snaptrade.com/', { signal: AbortSignal.timeout(15000) });
  const body = await res.json();
  apiOnline = body?.online === true;
  line('snaptrade api reachable', apiOnline, `version ${body?.version}, online=${body?.online}`);
} catch (err) {
  line('snaptrade api reachable', false, err instanceof Error ? err.message : String(err));
  console.log('\nTheir API is unreachable from here. This is not your configuration.\n');
  process.exit(1);
}

const snaptrade = new Snaptrade({ auth: SnaptradeAuth.commercialApiKey({ clientId, consumerKey }) });

// --- 2. Do OUR credentials work? ------------------------------------------
// listAllBrokerages is signed with the client id and consumer key and needs no user context, so a
// failure here is unambiguously about the keys rather than about anyone's connection.
let credsOk = false;
try {
  const res = await snaptrade.referenceData.listAllBrokerages();
  credsOk = Array.isArray(res.data);
  line('our credentials accepted', credsOk, `${res.data?.length ?? 0} brokerages listed`);
} catch (err) {
  const status = err?.response?.status ?? err?.status;
  line('our credentials accepted', false, `${status ?? 'no status'} ${String(err?.message ?? '').slice(0, 120)}`);
  console.log('\nSnapTrade is up but rejected these keys. Almost always one of:');
  console.log('  - the consumer key was rotated on the dashboard and Netlify still has the old one');
  console.log('  - the client id and consumer key are from different environments (test vs production)');
  console.log('  - a stray space or newline in the environment variable');
  console.log('\nUntil this passes, every broker action fails and no user connection is at fault.\n');
  process.exit(1);
}

// --- 3. Does one user's stored secret still work? --------------------------
const uid = arg('uid');
if (!uid) {
  console.log('\nPass --uid <uid> (with FIREBASE_SERVICE_ACCOUNT_JSON) to also test one user\'s stored secret.\n');
  process.exit(0);
}

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
if (!raw) {
  line('user secret valid', false, 'FIREBASE_SERVICE_ACCOUNT_JSON not set, cannot read it');
  process.exit(1);
}

const admin = (await import('firebase-admin')).default;
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });

const snap = await admin.firestore().doc(`users/${uid}/private/snaptrade`).get();
const userSecret = snap.data()?.userSecret;
if (!userSecret) {
  line('user secret stored', false, 'no secret on file — this user has never connected, or it was cleared');
  process.exit(1);
}
line('user secret stored', true, 'present');

try {
  const res = await snaptrade.accountInformation.listUserAccounts({ userId: uid, userSecret });
  line('user secret valid', true, `${res.data?.length ?? 0} account(s) visible`);
} catch (err) {
  const status = err?.response?.status ?? err?.status;
  line('user secret valid', false, `${status ?? 'no status'} ${String(err?.message ?? '').slice(0, 120)}`);
  console.log('\nThe keys work but this user\'s stored secret does not. That is the test-to-production');
  console.log('case: the secret was issued against different credentials and cannot be carried over.');
  console.log('This user needs to reconnect their brokerage.\n');
  process.exit(1);
}

console.log('\nAll checks passed — broker connect should work for this user.\n');
process.exit(0);
