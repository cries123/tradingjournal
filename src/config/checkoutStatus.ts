/**
 * The shape of the checkout kill switch, and the one function that decides what a stored document
 * means.
 *
 * Shared by the browser and the Netlify functions rather than written twice, because the two must
 * never disagree: if the pricing page thinks checkout is open and the server thinks it is closed,
 * the buyer gets a button that always errors — and if it disagrees the other way, the page offers
 * a purchase that the server will happily take during a maintenance window the owner declared.
 *
 * It lives in src/config so the server can import it, matching how tiers.ts is already shared.
 */

export interface CheckoutStatus {
  /** False puts checkout into maintenance: no new subscriptions, no plan changes. */
  enabled: boolean;
  /** Shown to buyers while closed. Empty means use DEFAULT_MAINTENANCE_MESSAGE. */
  message: string;
  updatedAt: string;
}

export const DEFAULT_MAINTENANCE_MESSAGE =
  'Plan purchases are paused for maintenance right now. Nothing has been charged — please check back shortly.';

/**
 * Open, and with no maintenance message.
 *
 * This is also the answer when the document has never been written, which matters: a site that has
 * not configured this yet is selling normally, not accidentally closed.
 */
export const OPEN_CHECKOUT: CheckoutStatus = {
  enabled: true,
  message: '',
  updatedAt: '',
};

/**
 * Reads a stored document into a status, tolerating anything.
 *
 * `enabled` is deliberately `!== false` rather than `=== true`: a document written by an older
 * version of the admin panel, or one where the field is missing entirely, should read as open.
 * Only an explicit `false` closes the store — the switch has to be turned off on purpose, never
 * by a field that failed to save.
 */
export function normalizeCheckoutStatus(data: unknown): CheckoutStatus {
  if (!data || typeof data !== 'object') return OPEN_CHECKOUT;
  const raw = data as Partial<CheckoutStatus>;
  return {
    enabled: raw.enabled !== false,
    message: typeof raw.message === 'string' ? raw.message.trim() : '',
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
  };
}

/** What to actually show a buyer while checkout is closed. */
export function maintenanceMessage(status: CheckoutStatus): string {
  return status.message.trim() || DEFAULT_MAINTENANCE_MESSAGE;
}
