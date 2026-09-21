import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb, isFirebaseConfigured } from '../lib/firebase';
import type { PublishedRecord } from '../utils/trackRecord';

/**
 * The two halves of a published record, and they are deliberately asymmetric.
 *
 * READING is a plain Firestore read with no auth, because the whole point of the page is that a
 * stranger can open it. WRITING goes through the Netlify function, because the figures are computed
 * on the server from the trader's own trades — there is no client write path to this collection at
 * all, and `firestore.rules` denies one.
 */

export interface PublishResult {
  published: boolean;
  slug?: string;
  verifiedTrades?: number;
}

async function post<T>(payload: Record<string, unknown>): Promise<T> {
  if (!isFirebaseConfigured()) throw new Error('Sign in to publish a record.');
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Sign in to publish a record.');

  const res = await fetch('/api/track-record', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong. Try again shortly.');
  return data;
}

export function publishRecord(options: {
  showAmounts: boolean;
  anonymous: boolean;
  journals: string[];
}): Promise<PublishResult> {
  return post<PublishResult>({ action: 'publish', ...options });
}

export function unpublishRecord(): Promise<PublishResult> {
  return post<PublishResult>({ action: 'unpublish' });
}

/**
 * Reads a published record by its slug.
 *
 * Returns null for "no such record" rather than throwing, because that is the ordinary case on this
 * page — a mistyped URL, or one whose owner has taken it down — and it is not an error worth an
 * error screen. A genuine failure (offline, Firestore down) still throws, so the page can tell the
 * two apart instead of showing "not found" to somebody on a bad connection.
 */
export async function fetchPublishedRecord(slug: string): Promise<PublishedRecord | null> {
  if (!isFirebaseConfigured()) return null;

  const snap = await getDoc(doc(getFirebaseDb(), 'trackRecords', slug.toLowerCase()));
  if (!snap.exists()) return null;

  // No uid to strip: ownership lives in an admin-only collection precisely so that this
  // public-read document carries nothing the trader did not choose to publish.
  return snap.data() as PublishedRecord;
}
