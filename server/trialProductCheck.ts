import { PAID_TIERS, TIER_PLANS, type Tier } from '../src/config/tiers';
import { TRIAL_DAYS } from '../src/config/trial';
import {
  CREEM_CONFIGURED,
  getProductFacts,
  noTrialProductIdForTier,
  productIdForTier,
  type CreemProductFacts,
} from './creemClient';

/**
 * Whether each plan's Creem products are what the site promises about the free trial.
 *
 * The site says "7-day free trial, then $19/month" and Creem is what does it: the trial length,
 * whether it is free, and the price charged on day 8 all live on the product, where nothing in this
 * codebase used to look. TRIAL_DAYS carried a comment asking for the two to be kept equal by hand.
 * This reads them, for the Ops tab, so a product edited in the Creem dashboard cannot quietly make
 * the pricing page untrue.
 *
 * Two products per plan:
 * - the plan's own monthly product, which must carry a free trial of exactly TRIAL_DAYS;
 * - its no-trial copy, for returning customers, which must carry none.
 * Both must be monthly and priced like the plan, because that price is what a triallist is charged
 * on day 8 and what a returning customer pays on day one.
 */

export interface ProductCheck {
  /** The env var the id is read from, so a problem says where to fix it. */
  envName: string | null;
  set: boolean;
  ok: boolean;
  problems: string[];
}

export interface TrialPlanCheck {
  tier: Tier;
  name: string;
  withTrial: ProductCheck;
  withoutTrial: ProductCheck;
}

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

/**
 * What is wrong with one product, in words, or nothing. Pure.
 *
 * `facts` is null when the id is not set, and an Error when Creem could not be read.
 */
export function productProblems(
  tier: Tier,
  facts: CreemProductFacts | Error | null,
  expectTrial: boolean,
): string[] {
  const plan = TIER_PLANS[tier];
  if (facts === null) {
    return expectTrial
      ? [`Not set, so ${plan.name} cannot be sold.`]
      : [`Not set up, so somebody who has had a trial can take ${plan.name}'s again.`];
  }
  if (facts instanceof Error) return [`Could not be read from Creem: ${facts.message}`];

  const problems: string[] = [];
  if (facts.status === 'archived') problems.push('Archived in Creem.');
  if (facts.price !== plan.price * 100) {
    problems.push(
      `Priced ${facts.price == null ? 'with no price' : dollars(facts.price)}; ${plan.name} is ${dollars(plan.price * 100)} a month${
        expectTrial ? ', which is what a triallist is told they will pay on day 8' : ''
      }.`,
    );
  }
  if (facts.recurringInterval !== 'month') problems.push(`Bills ${facts.recurringInterval ? `every ${facts.recurringInterval}` : 'once'}, not monthly.`);

  if (expectTrial) {
    if (facts.trialPeriodDays == null) {
      problems.push(`Has no free trial, so ${plan.name} checkouts give none. The site promises ${TRIAL_DAYS} days.`);
    } else if (facts.trialPeriodDays !== TRIAL_DAYS) {
      problems.push(`Has a ${facts.trialPeriodDays}-day trial; the site promises ${TRIAL_DAYS} days.`);
    }
    if (facts.trialPrice != null && facts.trialPrice > 0) {
      problems.push(`Its trial costs ${dollars(facts.trialPrice)}; the site promises a free one.`);
    }
  } else if (facts.trialPeriodDays != null) {
    problems.push(`Has a ${facts.trialPeriodDays}-day trial, so returning customers still get one. Turn the trial off on this copy.`);
  }
  return problems;
}

function toCheck(envName: string | null, facts: CreemProductFacts | Error | null, problems: string[]): ProductCheck {
  return { envName, set: facts !== null, ok: problems.length === 0, problems };
}

async function factsFor(id: string | null): Promise<CreemProductFacts | Error | null> {
  if (!id) return null;
  try {
    return await getProductFacts(id);
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err));
  }
}

/** Reads every plan's two products from Creem. Null when payments are not configured. */
export async function readTrialProductCheck(): Promise<TrialPlanCheck[] | null> {
  if (!CREEM_CONFIGURED) return null;
  return Promise.all(
    PAID_TIERS.map(async (tier) => {
      const plan = TIER_PLANS[tier];
      const [withTrial, withoutTrial] = await Promise.all([
        factsFor(productIdForTier(tier, 'month')),
        factsFor(noTrialProductIdForTier(tier)),
      ]);
      return {
        tier,
        name: plan.name,
        withTrial: toCheck(plan.productIdEnv ?? null, withTrial, productProblems(tier, withTrial, true)),
        withoutTrial: toCheck(plan.noTrialProductIdEnv ?? null, withoutTrial, productProblems(tier, withoutTrial, false)),
      };
    }),
  );
}
