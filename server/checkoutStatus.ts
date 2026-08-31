import { getAdminFirestore } from './firebaseAdmin';
import {
  normalizeCheckoutStatus,
  OPEN_CHECKOUT,
  type CheckoutStatus,
} from '../src/config/checkoutStatus';

/**
 * Server-side read of the checkout kill switch.
 *
 * The switch has to be enforced here, not in the pricing page. A button the client hides is not a
 * closed store — anyone can still POST to /api/creem-checkout, and during a maintenance window
 * that is exactly the request that must not go through to Creem.
 */

const CACHE_TTL_MS = 30_000;

/**
 * Last successful read, kept in module scope.
 *
 * Netlify reuses a warm container across invocations, so this both saves a Firestore read on every
 * checkout and — more importantly — decides what happens when Firestore is briefly unreachable.
 *
 * The rule is: never let a failed read re-open a store the owner deliberately closed. If the last
 * thing we knew was "closed", a read failure keeps it closed. Only a cold container with no
 * knowledge at all falls back to open, because the alternative is that a Firestore blip silently
 * takes payments offline with nothing in the admin panel to explain why.
 */
let cached: { at: number; value: CheckoutStatus } | null = null;

export async function readCheckoutStatus(): Promise<CheckoutStatus> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  try {
    const snap = await getAdminFirestore().doc('config/checkout').get();
    const value = snap.exists ? normalizeCheckoutStatus(snap.data()) : OPEN_CHECKOUT;
    cached = { at: Date.now(), value };
    return value;
  } catch (err) {
    console.error('[checkout-status] read failed:', err);
    // Stale-but-known beats guessing. See the note on `cached` above.
    if (cached) return cached.value;
    return OPEN_CHECKOUT;
  }
}

/**
 * Drops the cache so the next read hits Firestore.
 *
 * Only useful inside a single warm container, which is why the admin panel does not depend on it:
 * the 30s TTL is the real guarantee that a toggle takes effect everywhere.
 */
export function clearCheckoutStatusCache(): void {
  cached = null;
}
