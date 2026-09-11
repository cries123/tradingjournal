import { getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase';
import type { Tier } from '../config/tiers';

/**
 * The account endpoints: renaming a username, and reading what you have paid us.
 *
 * Both go through /api/account rather than Firestore, because both touch collections the client is
 * not allowed to read or write — the username index and the charge ledger. See server/accountHandler.
 */

export interface OrderHistoryEntry {
  id: string;
  at: string;
  amount: number;
  tier: Tier;
  planName: string;
  eventType: string;
}

export interface OrderHistory {
  entries: OrderHistoryEntry[];
  total: number;
}

export interface RenameResult {
  username: string;
  nextChangeAt: string | null;
}

async function accountPost<T>(payload: Record<string, unknown>): Promise<T> {
  if (!isFirebaseConfigured()) throw new Error('Sign in to manage your account.');
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Sign in to manage your account.');

  const token = await user.getIdToken();
  const res = await fetch('/api/account', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong. Try again shortly.');
  return data;
}

export function renameUsername(username: string): Promise<RenameResult> {
  return accountPost<RenameResult>({ action: 'renameUsername', username });
}

export function fetchOrderHistory(): Promise<OrderHistory> {
  return accountPost<OrderHistory>({ action: 'orderHistory' });
}

/**
 * Exchanges a username and password for a custom token.
 *
 * Separate from accountPost because this one is called by somebody who is not signed in — there is
 * no ID token to attach, which is the entire reason the endpoint exists.
 */
export async function usernameLoginToken(username: string, password: string): Promise<string> {
  const res = await fetch('/api/username-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const data = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
  if (!res.ok || !data.token) {
    throw new Error(data.error ?? 'Wrong username or password.');
  }
  return data.token;
}
