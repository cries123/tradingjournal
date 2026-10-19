import { getAdminAuth } from './firebaseAdmin';
import { applyBillingUpdate, readEntitlement, trialPatch } from './entitlements';
import { rememberTrial } from './trialHandler';
import { paymentFailedEmail, subscriptionCanceledEmail } from './emailTemplates';
import { isMailConfigured, sendEmail, siteUrl } from './mailer';
import { TIER_PLANS, type Tier } from '../src/config/tiers';
import { amountFromEvent, parseBillingEvent, type CreemWebhookEvent } from './creemClient';
import { isPaymentEvent, recordCharge } from './billingLedger';

/**
 * Turning a Creem event into an entitlement — the part of the webhook that can be run again.
 *
 * Lifted out of the webhook function so the Ops tab can replay a stored event when a plan did not
 * arrive. Everything in here is idempotent: the entitlement write is a merge of an absolute state,
 * the charge is keyed by event id, the trial claim is a set. The one thing a replay must not do is
 * email the customer a second "your payment failed", so notices are the caller's choice.
 */
export type ParsedBillingEvent = NonNullable<ReturnType<typeof parseBillingEvent>>;

export interface ApplyOutcome {
  applied: boolean;
  reason?: string;
}

/**
 * The two billing states worth writing to somebody about.
 *
 * A failed payment is the one email in this product worth real money: most of it is an expired
 * card, and nobody finds out unless we say so — the features simply stop working. A cancellation
 * gets a note too, and deliberately not a discount: what it says is that the journal keeps
 * working for free, which is true, and is the reason people come back.
 */
export async function tellThem(
  parsed: { uid: string; tier: Tier; status: string; currentPeriodEnd?: string },
  eventType: string | undefined,
): Promise<void> {
  if (!isMailConfigured()) return;
  if (parsed.status !== 'past_due' && parsed.status !== 'canceled') return;

  /*
   * A pause is not a cancellation, whatever the entitlement records it as.
   *
   * A paused subscription maps to 'canceled' so that access eventually stops — which is right — but
   * it arrived here and sent an email whose subject and body both say "you will not be billed
   * again". That is a written promise the pause breaks the moment it lifts, and Creem lifts it
   * automatically. The entitlement side stays as it is; the claim does not get made.
   */
  if ((eventType ?? '').toLowerCase().includes('paused')) return;

  const account = await getAdminAuth().getUser(parsed.uid);
  if (!account.email) return;

  const tierName = TIER_PLANS[parsed.tier].name;
  const mail =
    parsed.status === 'past_due'
      ? paymentFailedEmail({ tierName, siteUrl: siteUrl() })
      : subscriptionCanceledEmail({
          tierName,
          until: parsed.currentPeriodEnd ?? null,
          siteUrl: siteUrl(),
        });

  await sendEmail({ to: account.email, ...mail, tag: `billing-${parsed.status}` });
}

export async function applyCreemEvent(
  payload: CreemWebhookEvent,
  parsed: ParsedBillingEvent,
  eventId: string,
  options: { notify: boolean },
): Promise<ApplyOutcome> {
  /*
   * A trialing event is the only place the trial's dates exist.
   *
   * parseBillingEvent maps `subscription.trialing` to status 'active' on purpose — a triallist
   * has handed over a card and should pass every gate a subscriber passes — and that used to be
   * the end of it, so nothing downstream could tell a trial from a paid month. The three trial
   * emails looked for a field only a dead endpoint ever wrote, and had sent nothing to anybody.
   */
  // Read before the write, and only on a trialing event, so trialStartedAt is stamped once rather
  // than moved forward by a second delivery. applyBillingUpdate reads the record again for its own
  // grant check; one extra Firestore read on the rarest event in the set is the cheaper trade.
  const trial = trialPatch(
    parsed,
    new Date().toISOString(),
    parsed.trialing ? await readEntitlement(parsed.uid) : null,
  );
  if (parsed.trialing && !trial.trialEndsAt) {
    // Worth a line in the log: the account still counts as having had a trial, but with no end
    // date nothing can count down to the charge, which is the email that prevents a chargeback.
    console.warn(`[creem-webhook] trialing event for ${parsed.uid} carried no period end`);
  }

  const result = await applyBillingUpdate(parsed.uid, {
    tier: parsed.tier,
    status: parsed.status,
    creemSubscriptionId: parsed.creemSubscriptionId,
    creemCustomerId: parsed.creemCustomerId,
    currentPeriodEnd: parsed.currentPeriodEnd,
    // Only when the event's product said. An event without one must not rewrite a yearly record.
    ...(parsed.interval ? { billingInterval: parsed.interval } : {}),
    ...trial,
  });

  // Books the money, separately from the entitlement. Only for events that actually charged —
  // a subscription flipping to active is not a payment, and counting one would invent revenue.
  // !parsed.trialing, because a trial start can arrive on an event whose type contains "paid".
  // amountFromEvent returns null when the payload carries no amount, and chargeAmount then falls
  // back to the list price by design — so a $0 trial start would book a full month, and the real
  // charge a week later would book it again on the one screen that answers "did you charge me
  // twice".
  if (result.applied && !parsed.trialing && isPaymentEvent(payload.eventType)) {
    await recordCharge({
      eventId,
      uid: parsed.uid,
      tier: parsed.tier,
      eventType: payload.eventType ?? '',
      // Read off the event rather than assumed from the plan, so a $0 trial start books nothing.
      amountPaid: amountFromEvent(payload),
      interval: parsed.interval,
    });
  }

  /*
   * Remembers the mailbox, so a second signup cannot take a second trial.
   *
   * Swallowed, like the email below, and for a stronger reason: this is bookkeeping about abuse,
   * and failing it must never make Creem retry a billing change that has already landed. The
   * worst case is a trial our records forget to count.
   */
  if (result.applied && parsed.trialing) {
    await rememberTrial(parsed.uid).catch((err) => {
      console.error(`[creem-webhook] could not record the trial claim for ${parsed.uid}:`, err);
    });
  }

  // Best effort, and after the entitlement is written: an email that fails must never make a
  // webhook retry, because the retry would re-apply a billing change that already landed. Never
  // on a replay: the customer was told the first time.
  if (result.applied && options.notify) await tellThem(parsed, payload.eventType).catch(() => undefined);

  console.info(
    // object.status is logged because the whole trial feature rests on Creem saying 'trialing'
    // somewhere, and nothing in this repo can prove it does. If the trial emails stay silent, this
    // line on the next real trial checkout is what settles whether the signal ever arrived.
    `[creem-webhook] ${payload.eventType} objectStatus=${payload.object?.status ?? '-'} uid=${parsed.uid} tier=${parsed.tier} status=${parsed.status} trialing=${parsed.trialing} applied=${result.applied}${result.reason ? ` (${result.reason})` : ''}${options.notify ? '' : ' [replay]'}`,
  );
  return result;
}
