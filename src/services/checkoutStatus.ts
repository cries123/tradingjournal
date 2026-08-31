import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured } from '../lib/firebase';
import {
  normalizeCheckoutStatus,
  OPEN_CHECKOUT,
  type CheckoutStatus,
} from '../config/checkoutStatus';

/**
 * Client-side read/write of the checkout kill switch.
 *
 * This decides what the pricing page *shows*. It does not decide what the server *allows* — that
 * is server/checkoutStatus.ts, read inside the checkout function. Two readers of one document on
 * purpose: the page needs it without an authenticated round trip, and the server can never trust
 * the page.
 */

const CACHE_KEY = 'trend-chasers-checkout-status';
/**
 * Thirty seconds, where the announcement banner caches for five minutes.
 *
 * The banner being stale is cosmetic. This one gates buy buttons: too long a window and someone
 * who flipped the switch off is still being shown a purchase button minutes later. Short enough to
 * feel immediate, long enough that a pricing page refresh loop doesn't bill Firestore reads.
 */
const CACHE_TTL_MS = 30_000;

function readCache(): CheckoutStatus | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; value: CheckoutStatus };
    if (Date.now() - parsed.at > CACHE_TTL_MS) return null;
    return normalizeCheckoutStatus(parsed.value);
  } catch {
    return null;
  }
}

function writeCache(value: CheckoutStatus): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), value }));
  } catch {
    // Private browsing, or storage full. It just re-fetches next time.
  }
}

/**
 * Whether the pricing page should offer purchases.
 *
 * Falls back to open on any failure. That is the right way round for a *display* decision: an
 * unreadable document should not hide pricing from every visitor, and if the store really is
 * closed the server refuses the request anyway with the same message.
 */
export async function fetchCheckoutStatus(options?: { fresh?: boolean }): Promise<CheckoutStatus> {
  if (!isFirebaseConfigured()) return OPEN_CHECKOUT;

  if (!options?.fresh) {
    const cached = readCache();
    if (cached) return cached;
  }

  try {
    const snap = await getDoc(doc(getFirebaseDb(), 'config', 'checkout'));
    const value = snap.exists() ? normalizeCheckoutStatus(snap.data()) : OPEN_CHECKOUT;
    writeCache(value);
    return value;
  } catch {
    return OPEN_CHECKOUT;
  }
}

/** Flips the switch. Admin only — enforced by the Firestore rules, not by this function. */
export async function saveCheckoutStatus(
  next: Pick<CheckoutStatus, 'enabled' | 'message'>,
): Promise<CheckoutStatus> {
  const value: CheckoutStatus = {
    enabled: next.enabled,
    message: next.message.trim(),
    updatedAt: new Date().toISOString(),
  };
  await setDoc(doc(getFirebaseDb(), 'config', 'checkout'), value);
  writeCache(value);
  return value;
}
