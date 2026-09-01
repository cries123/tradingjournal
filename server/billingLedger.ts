import { getAdminFirestore } from './firebaseAdmin';
import { TIER_PLANS, type Tier } from '../src/config/tiers';

/**
 * A record of money actually collected.
 *
 * Entitlements say what somebody is entitled to right now; they say nothing about what was paid or
 * when. So "how much did I make in August" had no answer, and the admin panel could only show a
 * run-rate — a number that reads like today's takings and isn't.
 *
 * One document per Creem event that represents a payment, keyed by the event id so a retried
 * webhook cannot bank the same money twice. Server-only: nothing else may write it, because
 * anything that could would be able to invent revenue.
 */

const COLLECTION = 'billingCharges';

/**
 * Only an event that actually moved money.
 *
 * Creem sends subscription lifecycle events too — a status flipping to active is not by itself a
 * payment, and counting one would book revenue for a resumed subscription that billed nothing.
 * "paid" and "completed" are the two that mean a charge went through.
 */
export function isPaymentEvent(eventType: string | undefined): boolean {
  const type = (eventType ?? '').toLowerCase();

  /*
   * The failures are checked FIRST, and they have to be: "unpaid" contains "paid". A substring
   * test alone books revenue for the exact event that means a charge did not go through, which is
   * the one direction this must never get wrong — every month would read higher than the bank.
   */
  if (type.includes('unpaid') || type.includes('failed') || type.includes('refund')) return false;

  return type.includes('paid') || type.includes('completed');
}

export async function recordCharge(input: {
  eventId: string;
  uid: string;
  tier: Tier;
  eventType: string;
}): Promise<void> {
  const amount = TIER_PLANS[input.tier]?.price ?? 0;
  if (amount <= 0 || !input.eventId) return;

  try {
    await getAdminFirestore()
      .doc(`${COLLECTION}/${input.eventId}`)
      .set(
        {
          uid: input.uid,
          tier: input.tier,
          amount,
          eventType: input.eventType,
          at: new Date().toISOString(),
        },
        // create-or-overwrite by event id: a retry of the same event rewrites its own row rather
        // than adding a second one.
        { merge: true },
      );
  } catch (err) {
    // A missing ledger row costs one line of reporting accuracy. It must never fail the webhook
    // and make Creem retry a payment that was already applied.
    console.error('[billingLedger] could not record charge:', err);
  }
}

export interface MonthRevenue {
  revenue: number;
  charges: number;
}

/** What was collected in one YYYY-MM month. Zero for months before the ledger existed. */
export async function readMonthRevenue(month: string): Promise<MonthRevenue> {
  const snap = await getAdminFirestore()
    .collection(COLLECTION)
    .where('at', '>=', `${month}-01`)
    .where('at', '<=', `${month}-32`)
    .get();

  let revenue = 0;
  for (const doc of snap.docs) {
    const amount = (doc.data() as { amount?: number }).amount;
    if (typeof amount === 'number' && amount > 0) revenue += amount;
  }
  return { revenue, charges: snap.size };
}
