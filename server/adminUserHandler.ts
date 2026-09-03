import type { IncomingHttpHeaders } from 'http';
import { AdminRequestError, assertCallerIsAdmin, getBearerToken } from './adminAuth';
import { getAdminAuth, getAdminFirestore } from './firebaseAdmin';
import { readEntitlement, resolveAccess, writeEntitlement } from './entitlements';
import {
  adjustCredits,
  dailyUnitsSpent,
  forgiveToday,
  isCreditKind,
  MAX_CREDITS,
  readUsageToday,
  readUserCredits,
  usageDay,
  type CreditKind,
  type UsageCredits,
} from './usage';
import { emailAccountHolder, resetBrokerLink, setSignInSuspended } from './adminAccountActions';
import { isTier, TIER_ORDER, TIER_PLANS, type Tier } from '../src/config/tiers';
import {
  compIsLive,
  DAY_MS,
  extensionEndsAt,
  MAX_EXTENSION_DAYS,
  validCalendarDate,
  validExtensionDays,
  type ComplimentaryAccess,
} from '../src/config/accessExtension';

export type AdminUserAction =
  | 'readUsage'
  | 'updateEmail'
  | 'updatePassword'
  | 'deleteUser'
  | 'setTier'
  | 'clearTierGrant'
  | 'extendAccess'
  | 'clearAccessExtension'
  | 'resetUsageToday'
  | 'adjustCredits'
  | 'setSuspended'
  | 'resetBrokerLink'
  | 'emailUser';

export interface AdminUserRequestBody {
  action: AdminUserAction;
  targetUid: string;
  email?: string;
  password?: string;
  tier?: string;
  /** extendAccess: one of `days` (from where their access currently ends) or `until` (YYYY-MM-DD). */
  days?: unknown;
  until?: unknown;
  reason?: unknown;
  /** resetUsageToday / adjustCredits: 'sync' or 'ai'. */
  kind?: unknown;
  /** adjustCredits: how many to add; negative takes away. */
  delta?: unknown;
  /** setSuspended */
  suspended?: unknown;
  /** emailUser */
  subject?: unknown;
  message?: unknown;
}

/** What the panel shows for one person's metered use: lifetime, today, and the bank. */
export interface AdminUsageReport {
  syncs: UsageCounts;
  ai: UsageCounts;
  takeaways: UsageCounts;
  today: Record<CreditKind, { used: number; limit: number; count: number; forgiven: number; bonus: number }>;
  credits: UsageCredits;
  tier: Tier;
}

interface UsageCounts {
  total: number;
  last30: number;
  lastDay: string | null;
}

async function deleteCollectionDocs(collectionPath: string): Promise<number> {
  const db = getAdminFirestore();
  let deleted = 0;

  while (true) {
    const snap = await db.collection(collectionPath).limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += snap.size;
  }

  return deleted;
}

async function deleteUserFirestoreData(uid: string): Promise<void> {
  const db = getAdminFirestore();

  await deleteCollectionDocs(`users/${uid}/trades`);
  await deleteCollectionDocs(`users/${uid}/settings`);
  await deleteCollectionDocs(`users/${uid}/dayNotes`);

  const usernames = await db.collection('usernames').where('uid', '==', uid).get();
  if (!usernames.empty) {
    const batch = db.batch();
    usernames.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }

  const shares = await db.collection('coachShares').where('ownerUid', '==', uid).get();
  if (!shares.empty) {
    const batch = db.batch();
    shares.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }

  await db.doc(`users/${uid}`).delete().catch(() => undefined);
}

async function handleUpdateEmail(targetUid: string, email: string): Promise<{ message: string }> {
  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw new AdminRequestError('Invalid email address', 400);
  }

  await getAdminAuth().updateUser(targetUid, { email: trimmed, emailVerified: false });
  await getAdminFirestore().doc(`users/${targetUid}`).set({ email: trimmed }, { merge: true });

  return { message: `Email updated to ${trimmed}` };
}

async function handleUpdatePassword(targetUid: string, password: string): Promise<{ message: string }> {
  if (password.length < 6) {
    throw new AdminRequestError('Password must be at least 6 characters', 400);
  }

  await getAdminAuth().updateUser(targetUid, { password });
  return { message: 'Password updated' };
}

async function handleDeleteUser(callerUid: string, targetUid: string): Promise<{ message: string }> {
  if (callerUid === targetUid) {
    throw new AdminRequestError('You cannot delete your own account from here', 400);
  }

  const adminSnap = await getAdminFirestore().doc('config/admin').get();
  const siteAdminUid = (adminSnap.data() as { uid?: string } | undefined)?.uid;
  if (siteAdminUid && targetUid === siteAdminUid) {
    throw new AdminRequestError('The site admin account cannot be deleted', 400);
  }

  await deleteUserFirestoreData(targetUid);

  // SnapTrade keeps charging for a connection until the user under it is deleted, and nothing else
  // would ever delete one for an account that no longer exists. Best effort: a refusal here must
  // not leave the account half-deleted.
  await resetBrokerLink(targetUid).catch((err) => {
    console.warn(`[admin-user] could not clear the SnapTrade user for ${targetUid}:`, err);
  });
  const db = getAdminFirestore();
  await db.doc(`brokerConnections/${targetUid}`).delete().catch(() => undefined);
  await db.doc(`usageCredits/${targetUid}`).delete().catch(() => undefined);

  try {
    await getAdminAuth().deleteUser(targetUid);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== 'auth/user-not-found') {
      throw err;
    }
  }

  return { message: 'User deleted' };
}

/**
 * Grants a tier by hand — the grandfathering path.
 *
 * Written with source 'admin', which billing webhooks deliberately refuse to overwrite (see
 * applyBillingUpdate). That's the whole point: someone given Diamond has no subscription, so a
 * webhook about a lapsed or absent one must never take it back off them.
 */
async function handleSetTier(callerUid: string, targetUid: string, tier: Tier) {
  await writeEntitlement(targetUid, {
    tier,
    source: 'admin',
    status: 'active',
    grantedBy: callerUid,
  });
  return { message: `${TIER_PLANS[tier].name} granted` };
}

/**
 * Removes a hand-granted tier.
 *
 * If there's a real subscription underneath, the grant is handed back to billing rather than
 * deleted, so the next webhook can manage it again and the customer keeps what they paid for.
 * With no subscription there's nothing to hand back, so the record goes.
 */
async function handleClearTierGrant(targetUid: string) {
  const existing = await readEntitlement(targetUid);
  if (!existing || existing.source !== 'admin') {
    return { message: 'No manual grant to remove' };
  }

  if (existing.creemSubscriptionId) {
    await writeEntitlement(targetUid, { source: 'purchase', grantedBy: '' });
    return { message: 'Grant removed — their own subscription applies again' };
  }

  if (compIsLive(existing.comp, Date.now())) {
    // The record has to stay for the complimentary access to have somewhere to live.
    await writeEntitlement(targetUid, { tier: 'free', source: 'purchase', status: 'active', grantedBy: '' });
    return { message: `Grant removed — their complimentary ${TIER_PLANS[existing.comp.tier].name} still applies` };
  }

  await getAdminFirestore().doc(`entitlements/${targetUid}`).delete();
  return { message: 'Grant removed — back to Free' };
}

/* ------------------------------------------------------------------ complimentary access */

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  });
}

/**
 * The last moment of a calendar day in New York, as an ISO timestamp.
 *
 * "Until October 12" has to mean through the end of that day where the market lives — the same
 * clock the daily allowances already run on — not until 8pm the evening before because the server
 * thinks in UTC. Tried at both possible offsets rather than hand-rolling DST.
 */
export function endOfDayEastern(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  for (const hours of [4, 5]) {
    const lastMs = Date.UTC(y, m - 1, d + 1, hours) - 1;
    if (usageDay(new Date(lastMs)) === date && usageDay(new Date(lastMs + 1)) !== date) {
      return new Date(lastMs).toISOString();
    }
  }
  // Only reachable on a runtime without the timezone database. UTC end of day is the fallback
  // usageDay itself takes, so at least the two agree.
  return new Date(Date.UTC(y, m - 1, d + 1) - 1).toISOString();
}

async function handleExtendAccess(
  callerUid: string,
  targetUid: string,
  body: AdminUserRequestBody,
): Promise<{ message: string; until: string }> {
  const tier = body.tier;
  if (!isTier(tier) || tier === 'free') {
    throw new AdminRequestError('Pick a paid plan to extend', 400);
  }

  const existing = await readEntitlement(targetUid);
  const now = Date.now();

  if (existing && compIsLive(existing.comp, now) && TIER_ORDER.indexOf(existing.comp.tier) > TIER_ORDER.indexOf(tier)) {
    throw new AdminRequestError(
      `They already have ${TIER_PLANS[existing.comp.tier].name} on the house until ${formatDay(existing.comp.until)}. Extend that plan, or end it first.`,
      400,
    );
  }

  let until: string;
  if (body.until !== undefined && body.until !== null && body.until !== '') {
    const date = validCalendarDate(body.until);
    if (!date) throw new AdminRequestError('The date has to be YYYY-MM-DD', 400);
    until = endOfDayEastern(date);
    if (Date.parse(until) <= now) throw new AdminRequestError('That date has already passed', 400);
    if (Date.parse(until) > now + MAX_EXTENSION_DAYS * DAY_MS) {
      throw new AdminRequestError('Two years is the most this can do. For longer, grant the plan instead.', 400);
    }
  } else {
    const days = validExtensionDays(body.days);
    if (!days) throw new AdminRequestError(`Days must be a whole number from 1 to ${MAX_EXTENSION_DAYS}`, 400);
    until = extensionEndsAt(existing, now, days);
  }

  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 200) : '';
  const comp: ComplimentaryAccess = {
    tier,
    until,
    grantedBy: callerUid,
    grantedAt: new Date(now).toISOString(),
    ...(reason ? { reason } : {}),
  };

  // Someone who has never paid has no record, and a record needs a tier before readEntitlement
  // will accept it. Free is the honest one: the comp is what carries the access, not the tier.
  await writeEntitlement(
    targetUid,
    existing ? { comp } : { tier: 'free', source: 'purchase', status: 'active', comp },
  );

  return { message: `${TIER_PLANS[tier].name} until ${formatDay(until)}`, until };
}

async function handleClearAccessExtension(targetUid: string): Promise<{ message: string }> {
  const existing = await readEntitlement(targetUid);
  if (!existing?.comp) return { message: 'No complimentary access to end' };
  await writeEntitlement(targetUid, { comp: null });
  return { message: 'Complimentary access ended — back to whatever they pay for' };
}

/* ------------------------------------------------------------------ usage */

const KIND_LABEL: Record<CreditKind, { one: string; many: string }> = {
  sync: { one: 'sync', many: 'syncs' },
  ai: { one: 'AI message', many: 'AI messages' },
};

function plural(n: number, kind: CreditKind): string {
  return `${n} ${n === 1 ? KIND_LABEL[kind].one : KIND_LABEL[kind].many}`;
}

function creditKindOrThrow(value: unknown): CreditKind {
  if (!isCreditKind(value)) throw new AdminRequestError("kind must be 'sync' or 'ai'", 400);
  return value;
}

async function handleResetUsageToday(targetUid: string, kind: CreditKind): Promise<{ message: string; given: number }> {
  const given = await forgiveToday(kind, targetUid);
  return {
    given,
    message: given === 0 ? `Nothing spent today — nothing to give back` : `Gave back ${plural(given, kind)} for today`,
  };
}

async function handleAdjustCredits(
  targetUid: string,
  kind: CreditKind,
  delta: unknown,
): Promise<{ message: string; balance: number }> {
  if (typeof delta !== 'number' || !Number.isInteger(delta) || delta === 0 || Math.abs(delta) > MAX_CREDITS) {
    throw new AdminRequestError(`delta must be a whole number between -${MAX_CREDITS} and ${MAX_CREDITS}, not zero`, 400);
  }
  const balance = await adjustCredits(kind, targetUid, delta);
  return {
    balance,
    message: `${delta > 0 ? 'Added' : 'Removed'} ${plural(Math.abs(delta), kind)} — they now have ${plural(balance, kind)} banked`,
  };
}

/**
 * How much of the metered features one person has actually used.
 *
 * The usage counters are one document per user per day and server-only by rule, so the admin panel
 * could show what somebody is entitled to but never what they had spent — which is the number that
 * says whether a heavy user is costing money or a paid tier is going unused.
 */
async function handleReadUsage(targetUid: string) {
  const db = getAdminFirestore();
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const cutoff = since.toISOString().slice(0, 10);

  const read = async (collection: string) => {
    const snap = await db.collection(collection).where('uid', '==', targetUid).get();
    let total = 0;
    let last30 = 0;
    let lastDay: string | null = null;

    for (const doc of snap.docs) {
      const data = doc.data() as { count?: number; day?: string };
      const n = typeof data.count === 'number' && data.count > 0 ? data.count : 0;
      if (n === 0) continue;
      total += n;
      if (data.day && data.day >= cutoff) last30 += n;
      if (data.day && (!lastDay || data.day > lastDay)) lastDay = data.day;
    }
    return { total, last30, lastDay };
  };

  const [syncs, ai, takeaways, syncToday, aiToday, credits, access] = await Promise.all([
    read('syncUsage'),
    read('aiUsage'),
    read('takeawayUsage'),
    readUsageToday('sync', targetUid),
    readUsageToday('ai', targetUid),
    readUserCredits(targetUid),
    resolveAccess(targetUid),
  ]);

  const usage: AdminUsageReport = {
    syncs,
    ai,
    takeaways,
    today: {
      sync: { ...syncToday, used: dailyUnitsSpent(syncToday), limit: access.limits.syncsPerDay },
      ai: { ...aiToday, used: dailyUnitsSpent(aiToday), limit: access.limits.aiMessagesPerDay },
    },
    credits,
    tier: access.tier,
  };

  return { usage };
}

export async function handleAdminUserRequest(
  headers: IncomingHttpHeaders,
  body: AdminUserRequestBody,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const token = getBearerToken(headers);
  if (!token) {
    return { statusCode: 401, body: { error: 'Missing authorization' } };
  }

  try {
    const callerUid = await assertCallerIsAdmin(token);
    const { action, targetUid, email, password, tier } = body;

    if (!targetUid?.trim()) {
      return { statusCode: 400, body: { error: 'targetUid is required' } };
    }

    switch (action) {
      case 'updateEmail': {
        if (!email?.trim()) {
          return { statusCode: 400, body: { error: 'email is required' } };
        }
        const result = await handleUpdateEmail(targetUid, email);
        return { statusCode: 200, body: { ok: true, ...result } };
      }
      case 'updatePassword': {
        if (!password) {
          return { statusCode: 400, body: { error: 'password is required' } };
        }
        const result = await handleUpdatePassword(targetUid, password);
        return { statusCode: 200, body: { ok: true, ...result } };
      }
      case 'deleteUser': {
        const result = await handleDeleteUser(callerUid, targetUid);
        return { statusCode: 200, body: { ok: true, ...result } };
      }
      case 'setTier': {
        if (!isTier(tier)) {
          return { statusCode: 400, body: { error: 'Unknown tier' } };
        }
        const result = await handleSetTier(callerUid, targetUid, tier);
        return { statusCode: 200, body: { ok: true, ...result } };
      }
      case 'clearTierGrant': {
        const result = await handleClearTierGrant(targetUid);
        return { statusCode: 200, body: { ok: true, ...result } };
      }
      case 'readUsage': {
        const result = await handleReadUsage(targetUid);
        return { statusCode: 200, body: { ok: true, ...result } };
      }
      case 'extendAccess': {
        const result = await handleExtendAccess(callerUid, targetUid, body);
        return { statusCode: 200, body: { ok: true, ...result } };
      }
      case 'clearAccessExtension': {
        const result = await handleClearAccessExtension(targetUid);
        return { statusCode: 200, body: { ok: true, ...result } };
      }
      case 'resetUsageToday': {
        const result = await handleResetUsageToday(targetUid, creditKindOrThrow(body.kind));
        return { statusCode: 200, body: { ok: true, ...result } };
      }
      case 'adjustCredits': {
        const result = await handleAdjustCredits(targetUid, creditKindOrThrow(body.kind), body.delta);
        return { statusCode: 200, body: { ok: true, ...result } };
      }
      case 'setSuspended': {
        if (typeof body.suspended !== 'boolean') {
          return { statusCode: 400, body: { error: 'suspended must be true or false' } };
        }
        const reason = typeof body.reason === 'string' ? body.reason : '';
        const result = await setSignInSuspended(callerUid, targetUid, body.suspended, reason);
        return { statusCode: 200, body: { ok: true, ...result } };
      }
      case 'resetBrokerLink': {
        const result = await resetBrokerLink(targetUid);
        return { statusCode: 200, body: { ok: true, ...result } };
      }
      case 'emailUser': {
        const subject = typeof body.subject === 'string' ? body.subject : '';
        const message = typeof body.message === 'string' ? body.message : '';
        const result = await emailAccountHolder(targetUid, subject, message);
        return { statusCode: 200, body: { ok: true, ...result } };
      }
      default:
        return { statusCode: 400, body: { error: 'Unknown action' } };
    }
  } catch (err) {
    if (err instanceof AdminRequestError) {
      return { statusCode: err.statusCode, body: { error: err.message } };
    }
    const message = err instanceof Error ? err.message : 'Request failed';
    if (message.includes('not configured')) {
      return { statusCode: 503, body: { error: message } };
    }
    return { statusCode: 500, body: { error: message } };
  }
}
