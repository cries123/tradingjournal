import type { IncomingHttpHeaders } from 'http';
import { AdminRequestError, assertCallerIsAdmin, getBearerToken } from './adminAuth';
import { getAdminAuth, getAdminFirestore } from './firebaseAdmin';
import { readEntitlement, writeEntitlement } from './entitlements';
import { isTier, TIER_PLANS, type Tier } from '../src/config/tiers';

export type AdminUserAction =
  | 'readUsage'
  | 'updateEmail'
  | 'updatePassword'
  | 'deleteUser'
  | 'setTier'
  | 'clearTierGrant';

export interface AdminUserRequestBody {
  action: AdminUserAction;
  targetUid: string;
  email?: string;
  password?: string;
  tier?: string;
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

  await getAdminFirestore().doc(`entitlements/${targetUid}`).delete();
  return { message: 'Grant removed — back to Free' };
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

  const [syncs, ai, takeaways] = await Promise.all([
    read('syncUsage'),
    read('aiUsage'),
    read('takeawayUsage'),
  ]);

  return { usage: { syncs, ai, takeaways } };
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
