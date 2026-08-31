#!/usr/bin/env node
/**
 * Tells you, per user, whether their broker connection is real under the credentials you are
 * running now — and whether what the admin panel says about them is stale.
 *
 * Written for one question: the panel reported three connected users after a move from test to
 * production SnapTrade keys, and it was not clear whether those were live connections or the
 * remains of test ones. Both halves of that number could be wrong independently:
 *
 *   - Every stored userSecret was issued by ONE SnapTrade client. Change keys and all of them stop
 *     working at once, so a "connected" user may simply be a user nobody could ask about.
 *   - The cached rows in brokerConnections were written while the old keys still worked, and the
 *     panel fell back to them when the live check failed — reporting connections that had ceased
 *     to exist.
 *
 * Read-only. Registers nothing, deletes nothing, writes nothing.
 *
 * Usage:
 *   SNAPTRADE_CLIENT_ID=... SNAPTRADE_CONSUMER_KEY=... FIREBASE_SERVICE_ACCOUNT_JSON=... \
 *     node scripts/broker-connection-audit.mjs
 */
import { Snaptrade, SnaptradeAuth } from 'snaptrade-typescript-sdk';

const clientId = process.env.SNAPTRADE_CLIENT_ID?.trim();
const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY?.trim();
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();

if (!clientId || !consumerKey || !serviceAccount) {
  console.error('Needs SNAPTRADE_CLIENT_ID, SNAPTRADE_CONSUMER_KEY and FIREBASE_SERVICE_ACCOUNT_JSON.');
  process.exit(1);
}

const admin = (await import('firebase-admin')).default;
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(serviceAccount)) });
const db = admin.firestore();
const snaptrade = new Snaptrade({ auth: SnaptradeAuth.commercialApiKey({ clientId, consumerKey }) });

console.log(`\nAuditing against client id: ${clientId}\n${'─'.repeat(78)}`);

// Same definition of "registered" the admin panel uses.
const privateDocs = await db.collectionGroup('private').get();
const users = [];
for (const doc of privateDocs.docs) {
  if (doc.id !== 'snaptrade') continue;
  const uid = doc.ref.parent.parent?.id;
  const { userId, userSecret } = doc.data();
  if (uid && userId && userSecret) users.push({ uid, userId, userSecret });
}

if (users.length === 0) {
  console.log('No users have ever started the connect flow.\n');
  process.exit(0);
}

const cached = new Map();
for (const doc of (await db.collection('brokerConnections').get()).docs) {
  cached.set(doc.id, doc.data());
}

let live = 0;
let rejected = 0;
let errored = 0;
let cachedSaysConnected = 0;

for (const user of users) {
  const row = cached.get(user.uid);
  const cachedConnected = row?.connected === true;
  if (cachedConnected) cachedSaysConnected++;

  let verdict;
  try {
    const res = await snaptrade.accountInformation.listUserAccounts({
      userId: user.userId,
      userSecret: user.userSecret,
    });
    const n = res.data?.length ?? 0;
    if (n > 0) live++;
    verdict = n > 0 ? `LIVE      ${n} account(s)` : 'NONE      registered, nothing linked';
  } catch (err) {
    const status = err?.status ?? err?.response?.status;
    const body = typeof err?.responseBody === 'string' ? err.responseBody : JSON.stringify(err?.responseBody ?? '');
    // A rejected secret means it was issued by different credentials — the test-to-production case.
    const isAuth = status === 401 || status === 403 || /signature|unauthorized|not found/i.test(body);
    if (isAuth) {
      rejected++;
      verdict = `REJECTED  secret not valid for these keys (HTTP ${status ?? '?'})`;
    } else {
      errored++;
      verdict = `ERROR     ${status ?? ''} ${String(body).slice(0, 60)}`;
    }
  }

  const claim = row
    ? cachedConnected
      ? `panel cache says CONNECTED (checked ${row.lastCheckedAt ?? 'unknown'})`
      : 'panel cache says not connected'
    : 'no cached row';
  console.log(`${user.uid.padEnd(30)} ${verdict.padEnd(52)} ${claim}`);
}

console.log('─'.repeat(78));
console.log(`registered users        : ${users.length}`);
console.log(`genuinely connected now : ${live}`);
console.log(`secret rejected         : ${rejected}   <- must reconnect; not connected under these keys`);
console.log(`check failed (other)    : ${errored}`);
console.log(`cache claims connected  : ${cachedSaysConnected}`);

if (cachedSaysConnected !== live) {
  console.log(
    `\nThe admin panel's number comes from the cache when a live check fails, so it can read ` +
      `${cachedSaysConnected} while the truth is ${live}.`,
  );
}
console.log('');
process.exit(0);
