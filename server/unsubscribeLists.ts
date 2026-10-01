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

export type UnsubscribeList = 'recap' | 'rule-alerts' | 'trial';

export interface ListDefinition {
  /** Where the preference lives, relative to the user. */
  target: 'emailPrefs' | 'preferences';
  /** The field to set false. */
  field: string;
  /** What the confirmation page says was stopped. */
  stopped: string;
  /**
   * What still arrives, said on the confirmation page beside what stopped.
   *
   * Empty for the lists that really do stop everything. The trial welcome does not: the two notices
   * saying when the card is charged ignore this preference on purpose, and a page that claims the
   * trial mail has stopped followed by an email naming a charge is a spam complaint from somebody
   * who already clicked unsubscribe.
   */
  stillArrives: string;
  /**
   * Whether Settings has a control for this list.
   *
   * Both pages this endpoint renders tell the reader they can turn these emails off in Settings,
   * and for a list with no toggle that sentence is simply false. It is a property of the list
   * rather than a line in the handler because the two have to agree, and the handler is the half
   * that cannot be tested.
   */
  inSettings: boolean;
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
    stillArrives: '',
    inSettings: true,
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
    stillArrives: '',
    inSettings: true,
  },

  /*
   * The welcome note a day into a free trial, and only that one.
   *
   * The other two trial emails say when the card on file is charged and how to stop it, and they
   * carry no link — the same reasoning the broker-link notices are written under: letting somebody
   * opt out of a warning and then be surprised by what it warned about serves nobody. So this list
   * is one email long, which is also why it has no toggle in Settings. A permanent checkbox for a
   * seven-day sequence would sit there forever for the accounts that will never see it.
   *
   * Written only by this endpoint, through the Admin SDK, which is what keeps firestore.rules out
   * of it: the emailPrefs rules pin a client write to uid/recap/updatedAt, and adding a key a
   * client never sends would have meant a rules edit pasted by hand after the deploy, with a window
   * in between where the toggle it was for threw permission-denied.
   */
  trial: {
    target: 'emailPrefs',
    field: 'trial',
    // The WELCOME, named precisely. 'the free-trial reminders' would be a lie on the confirmation
    // page: the link only ever appears in the welcome, the welcome is already deduped once sent, and
    // the two notices about the charge ignore the preference by design. Clicking it stops exactly
    // one future email — the welcome of a later trial — and the page now says so.
    stopped: 'the free-trial welcome note',
    stillArrives:
      'The two notes telling you when your card is charged and how to stop it are not part of this list — you will still get those.',
    inSettings: false,
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
  if (purpose === 'recap' || purpose === 'rule-alerts' || purpose === 'trial') return purpose;
  return null;
}
