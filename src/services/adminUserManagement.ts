import { sendPasswordResetEmail } from 'firebase/auth';
import type { AdminUsageReport, AdminUserAction } from '../../server/adminUserHandler';
import type { CreditKind } from '../../server/usage';
import type { Tier } from '../config/tiers';
import { deleteUserViaFirestore } from './adminDeleteUserClient';
import { getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase';

export type { AdminUsageReport, CreditKind };

interface AdminApiPayload {
  action: AdminUserAction;
  targetUid: string;
  email?: string;
  password?: string;
  tier?: Tier;
  days?: number;
  until?: string;
  reason?: string;
  kind?: CreditKind;
  delta?: number;
  suspended?: boolean;
  subject?: string;
  message?: string;
}

async function adminApiPost<Extra extends Record<string, unknown> = Record<string, never>>(
  payload: AdminApiPayload,
): Promise<{ ok: true; message: string } & Extra> {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured');
  }

  const user = getFirebaseAuth().currentUser;
  if (!user) {
    throw new Error('Sign in required');
  }

  const token = await user.getIdToken();
  const res = await fetch('/api/admin-user', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = (await res.json()) as { ok?: boolean; message?: string; error?: string } & Partial<Extra>;
  if (!res.ok) {
    throw new Error(data.error ?? 'Request failed');
  }

  return { ...(data as Extra), ok: true, message: data.message ?? 'Done' };
}

export type UserUsage = AdminUsageReport;

/**
 * What one person has actually spent of their metered allowances, what today looks like, and
 * what they have banked.
 *
 * Served from the admin function rather than read directly: the usage counters are server-only by
 * rule, because a client that could read them could read everybody's.
 */
export async function adminReadUserUsage(targetUid: string): Promise<UserUsage | null> {
  if (!isFirebaseConfigured()) return null;

  const user = getFirebaseAuth().currentUser;
  if (!user) return null;

  try {
    const res = await fetch('/api/admin-user', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await user.getIdToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'readUsage', targetUid }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { usage?: UserUsage };
    return data.usage ?? null;
  } catch {
    return null;
  }
}

/** Sends Firebase's standard password reset email to the user. */
export async function adminSendPasswordResetEmail(email: string): Promise<void> {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured');
  }
  const trimmed = email.trim();
  if (!trimmed) {
    throw new Error('No email on file for this user');
  }
  await sendPasswordResetEmail(getFirebaseAuth(), trimmed);
}

export async function adminUpdateUserEmail(
  targetUid: string,
  email: string,
): Promise<{ message: string }> {
  return adminApiPost({ action: 'updateEmail', targetUid, email });
}

export async function adminUpdateUserPassword(
  targetUid: string,
  password: string,
): Promise<{ message: string }> {
  return adminApiPost({ action: 'updatePassword', targetUid, password });
}

export async function adminDeleteUser(targetUid: string): Promise<{ message: string }> {
  try {
    return await adminApiPost({ action: 'deleteUser', targetUid });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('not configured') || msg.includes('503')) {
      return deleteUserViaFirestore(targetUid);
    }
    throw err;
  }
}

/** Grandfathers a user into a tier by hand. Survives billing webhooks until it's cleared. */
export async function adminSetUserTier(targetUid: string, tier: Tier): Promise<{ message: string }> {
  return adminApiPost({ action: 'setTier', targetUid, tier });
}

/** Removes a hand-granted tier, handing the account back to whatever they actually pay for. */
export async function adminClearUserTierGrant(targetUid: string): Promise<{ message: string }> {
  return adminApiPost({ action: 'clearTierGrant', targetUid });
}

/* ------------------------------------------------------------------ complimentary access */

/**
 * Gives (or extends) a paid tier for a while, on top of whatever billing says.
 *
 * Pass `days` to add time from where their access currently ends, or `until` (YYYY-MM-DD) for a
 * fixed date. The server works out the date; the message says what it landed on.
 */
export async function adminExtendAccess(
  targetUid: string,
  input: { tier: Tier; days?: number; until?: string; reason?: string },
): Promise<{ message: string; until: string }> {
  return adminApiPost<{ until: string }>({ action: 'extendAccess', targetUid, ...input });
}

export async function adminClearAccessExtension(targetUid: string): Promise<{ message: string }> {
  return adminApiPost({ action: 'clearAccessExtension', targetUid });
}

/* ------------------------------------------------------------------ usage */

/** Hands back whatever of today's allowance they have spent. The record of the calls is kept. */
export async function adminResetUsageToday(
  targetUid: string,
  kind: CreditKind,
): Promise<{ message: string; given: number }> {
  return adminApiPost<{ given: number }>({ action: 'resetUsageToday', targetUid, kind });
}

/** Adds bonus units that sit outside the daily cap. A negative delta takes them back. */
export async function adminAdjustCredits(
  targetUid: string,
  kind: CreditKind,
  delta: number,
): Promise<{ message: string; balance: number }> {
  return adminApiPost<{ balance: number }>({ action: 'adjustCredits', targetUid, kind, delta });
}

/* ------------------------------------------------------------------ account */

export async function adminSetSuspended(
  targetUid: string,
  suspended: boolean,
  reason = '',
): Promise<{ message: string }> {
  return adminApiPost({ action: 'setSuspended', targetUid, suspended, reason });
}

/** Wipes the SnapTrade link so the user can connect again from scratch. Trades are untouched. */
export async function adminResetBrokerLink(targetUid: string): Promise<{ message: string; hadLink: boolean }> {
  return adminApiPost<{ hadLink: boolean }>({ action: 'resetBrokerLink', targetUid });
}

/** Sends a note to the address on the account, from support@. */
export async function adminEmailUser(
  targetUid: string,
  subject: string,
  message: string,
): Promise<{ message: string }> {
  return adminApiPost({ action: 'emailUser', targetUid, subject, message });
}
