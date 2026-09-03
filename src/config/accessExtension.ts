import { TIER_ORDER, type Tier } from './tiers';

/**
 * Complimentary access: a tier given by hand, for a while, alongside whatever billing says.
 *
 * This is the "extend their subscription" the admin panel offers, and it is deliberately not a
 * change to the subscription. Creem owns the billing date and will charge on it whatever is
 * written here; what this can honestly promise is that the account keeps (or gets) a tier until a
 * date, even if the paid period ends, the card fails, or the person cancels. For someone who was
 * never paying, it is a trial. For a grandfathered account it changes nothing, since a permanent
 * grant already outranks it.
 *
 * Shared by the server, which enforces it, and the admin panel, which previews the date before
 * the admin commits to it. One implementation so the preview cannot disagree with the write.
 */
export interface ComplimentaryAccess {
  tier: Tier;
  /** ISO timestamp the access runs to, inclusive of the day the admin picked. */
  until: string;
  grantedBy: string;
  grantedAt: string;
  reason?: string;
}

/** The shape of an entitlement record this module needs to reason about. */
export interface AccessRecord {
  status: 'active' | 'canceled' | 'past_due' | 'expired';
  source: 'purchase' | 'admin';
  currentPeriodEnd?: string | null;
  comp?: ComplimentaryAccess | null;
}

/** Durations the panel offers as one tap. Anything else is a typed date. */
export const EXTENSION_PRESET_DAYS = [7, 14, 30, 90] as const;

/** Two years. Longer than that and the honest tool is a permanent grant. */
export const MAX_EXTENSION_DAYS = 730;

export const DAY_MS = 86_400_000;

/** True while the complimentary access is still running. */
export function compIsLive(comp: ComplimentaryAccess | null | undefined, now: number): comp is ComplimentaryAccess {
  if (!comp) return false;
  const until = Date.parse(comp.until);
  return Number.isFinite(until) && until > now;
}

/** The higher of two tiers. */
export function higherTier(a: Tier, b: Tier): Tier {
  return TIER_ORDER.indexOf(a) >= TIER_ORDER.indexOf(b) ? a : b;
}

/**
 * The moment a new extension counts from.
 *
 * Later of: now; the end of a paid period that is still running (an extension is time on top of
 * what they paid for, never overlapping it); and the end of an extension already in place, so
 * "another 30 days" means another, not a reset to 30.
 */
export function extensionStartsFrom(record: AccessRecord | null, now: number): number {
  let from = now;

  if (record && record.source === 'purchase' && (record.status === 'active' || record.status === 'canceled')) {
    const periodEnd = record.currentPeriodEnd ? Date.parse(record.currentPeriodEnd) : NaN;
    if (Number.isFinite(periodEnd) && periodEnd > from) from = periodEnd;
  }

  if (record && compIsLive(record.comp, now)) {
    const compEnd = Date.parse(record.comp.until);
    if (compEnd > from) from = compEnd;
  }

  return from;
}

/** Where an extension of `days` would run to, as an ISO timestamp. */
export function extensionEndsAt(record: AccessRecord | null, now: number, days: number): string {
  return new Date(extensionStartsFrom(record, now) + days * DAY_MS).toISOString();
}

/** A whole number of days between 1 and the maximum, or null for anything else. */
export function validExtensionDays(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < 1 || value > MAX_EXTENSION_DAYS) return null;
  return value;
}

/** A YYYY-MM-DD the admin typed, or null. The date itself is checked against today by the caller. */
export function validCalendarDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  return value;
}

/**
 * The tier a record confers right now, billing and complimentary access together.
 *
 * `billingTier` is what the subscription alone gives (free for a lapsed one); the complimentary
 * tier is added on top, never subtracted. A comp never takes anything away.
 */
export function tierWithComp(billingTier: Tier, record: AccessRecord | null, now: number): Tier {
  if (!record || !compIsLive(record.comp, now)) return billingTier;
  return higherTier(billingTier, record.comp.tier);
}
