import { hasTrial, REFUSALS, TRIAL_DAYS, type TrialDecision } from '../src/config/trial';
import type { BillingInterval, Tier } from '../src/config/tiers';

export type CheckoutTrialPlan =
  | { action: 'checkout'; trial: boolean }
  | { action: 'confirm-email'; message: string };

/**
 * Whether a new checkout may carry the free trial. Pure, so every branch is tested without Creem.
 *
 * Creem gives the trial to every new subscription of a product that has one, so this is the only
 * place "one trial per person" is enforced at the till. Before it, the eligibility rules only
 * decided whether the trial BUTTON showed: the ordinary buy button went to the same product, and
 * somebody could take Silver's week, cancel, take Gold's, cancel, and take Diamond's.
 *
 * `blocking` is whether this plan has its no-trial copy. Without one there is nowhere else to send
 * a returning customer, so nothing changes, which is how checkout behaved before the copies.
 *
 * Two deliberate leans:
 * - A failed eligibility check gives the trial. The two mistakes are not the same size: a trial
 *   given twice costs a dollar or two of SnapTrade and assistant fees, while charging on day one
 *   somebody the pricing page promised a free week is a refund request and a lost customer.
 * - An unconfirmed email is asked to confirm, not charged. It is the one refusal that is not about
 *   the past, so sending them to the no-trial product would take a first-timer's trial away for
 *   not having clicked a link yet.
 */
export function planCheckoutTrial(
  decision: TrialDecision | null,
  tier: Tier,
  interval: BillingInterval,
  blocking: boolean,
  /**
   * False when the buyer chose to skip the trial and pay now. Sold through the same no-trial copy
   * a returning customer gets, so it is only a real choice once that copy exists: until then the
   * plan's own product is the only one, and Creem puts its trial on the checkout regardless.
   * payments-status reports which copies exist, for the page to offer the choice only where it works.
   */
  wantsTrial = true,
): CheckoutTrialPlan {
  if (interval === 'year' || !hasTrial(tier)) return { action: 'checkout', trial: false };
  if (!wantsTrial) return { action: 'checkout', trial: false };
  if (!decision || decision.eligible) return { action: 'checkout', trial: true };
  if (!blocking) return { action: 'checkout', trial: true };
  if (decision.reason === 'email-unverified') {
    return {
      action: 'confirm-email',
      message: `${REFUSALS['email-unverified']} Your ${TRIAL_DAYS}-day free trial starts at checkout once it is confirmed.`,
    };
  }
  return { action: 'checkout', trial: false };
}
