/**
 * Which list an unsubscribe link belongs to, and what turning it off means.
 *
 * The link carried a purpose from the day it was written — it is inside the signature, so a token
 * minted for one list cannot be replayed against another — and then the endpoint ignored it and
 * wrote `recap: false` whatever it said. Two lists, one switch.
 *
 * So the Unsubscribe link at the bottom of a rule-alert email turned off the WEEKLY RECAP. The
 * reader went on getting the daily alerts they had just asked to stop, and silently lost the Sunday
 * summary they never mentioned. The rule-alert job made that certain by minting its link with the
 * default purpose, which is 'recap' — so even an endpoint that respected the purpose would have been
 * told the wrong one.
 *
 * Kept here, apart from the handler, because the two facts that have to agree are the purpose a job
 * signs a link with and the preference the endpoint clears. One table is how they stay in step, and
 * it is testable; the handler is not.
 */

export type UnsubscribeList = 'recap' | 'rule-alerts';

export interface ListDefinition {
  /** Where the preference lives, relative to the user. */
  target: 'emailPrefs' | 'preferences';
  /** The field to set false. */
  field: string;
  /** What the confirmation page says was stopped. */
  stopped: string;
}

export const UNSUBSCRIBE_LISTS: Record<UnsubscribeList, ListDefinition> = {
  /*
   * The Sunday summary, opt-in per account.
   *
   * Lives in the top-level emailPrefs collection rather than on the settings document because the
   * scheduled job queries across everybody, and a collectionGroup query would need a hand-built
   * index.
   */
  recap: {
    target: 'emailPrefs',
    field: 'recap',
    stopped: 'the weekly recap',
  },

  /*
   * The daily note about a broken trading rule.
   *
   * This one is a SETTING, not a mail preference — ruleAlertsEnabled on the user's own preferences
   * document, which is what the rule-alert job reads and what the toggle in Settings writes. An
   * unsubscribe that wrote to emailPrefs instead would report success and change nothing the job
   * looks at.
   */
  'rule-alerts': {
    target: 'preferences',
    field: 'ruleAlertsEnabled',
    stopped: 'the rule alerts',
  },
};

/** A purpose from a query string, or null. Never defaulted: see resolveList. */
export function resolveList(purpose: string | undefined): UnsubscribeList | null {
  /*
   * An unrecognised purpose is refused rather than treated as the recap.
   *
   * Defaulting is what turned a rule-alert unsubscribe into a recap unsubscribe. A link whose list
   * cannot be identified should say so, because the alternative is confidently stopping a list the
   * reader never asked about.
   */
  if (purpose === 'recap' || purpose === 'rule-alerts') return purpose;
  return null;
}
