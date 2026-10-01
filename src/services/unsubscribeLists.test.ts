import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  resolveList,
  UNSUBSCRIBE_LISTS,
  type UnsubscribeList,
} from '../../server/unsubscribeLists';
import { unsubscribeToken, unsubscribeUrl, verifyUnsubscribeToken } from '../../server/unsubscribeToken';

/*
 * Unsubscribing from the list the reader actually clicked.
 *
 * The purpose has been inside the signature from the start, and the endpoint ignored it: whatever
 * list the link belonged to, it wrote recap: false. So the Unsubscribe link at the bottom of a
 * rule-alert email turned off the WEEKLY RECAP — the reader kept getting the daily mail they had just
 * opted out of, and silently lost the Sunday summary they had never mentioned.
 *
 * The rule-alert job made that certain by minting its link with the default purpose, so even an
 * endpoint that honoured the purpose would have been handed the wrong one.
 */

describe('resolveList', () => {
  it('accepts the two lists that exist', () => {
    expect(resolveList('recap')).toBe('recap');
    expect(resolveList('rule-alerts')).toBe('rule-alerts');
  });

  it('refuses anything else rather than falling back to the recap', () => {
    /*
     * The defaulting is the bug, not a safety net. A link whose list cannot be identified has to say
     * so, because the alternative is confidently stopping a list the reader never asked about — and
     * that is precisely what happened for every rule alert ever sent.
     */
    for (const bad of [undefined, '', 'recaps', 'RECAP', 'trial', 'rule_alerts']) {
      expect(resolveList(bad), String(bad)).toBeNull();
    }
  });
});

describe('what each list turns off', () => {
  it('points the rule alerts at the field the alert job actually reads', () => {
    /*
     * ruleAlertsEnabled on the user's own preferences document — the same field the toggle in
     * Settings writes and the one rule-alerts.ts checks before sending. Writing to emailPrefs
     * instead would have reported success on screen and changed nothing that stops the mail.
     */
    expect(UNSUBSCRIBE_LISTS['rule-alerts']).toEqual({
      target: 'preferences',
      field: 'ruleAlertsEnabled',
      stopped: 'the rule alerts',
    });
  });

  it('leaves the recap where the scheduled job queries it', () => {
    // Top-level emailPrefs, because the weekly job queries across everybody.
    expect(UNSUBSCRIBE_LISTS.recap.target).toBe('emailPrefs');
    expect(UNSUBSCRIBE_LISTS.recap.field).toBe('recap');
  });

  it('says which list was stopped, for the confirmation page', () => {
    // "You won't get the weekly recap any more" on a rule-alert unsubscribe was the visible half of
    // the bug, and the only part a reader could have reported.
    for (const list of Object.keys(UNSUBSCRIBE_LISTS) as UnsubscribeList[]) {
      expect(UNSUBSCRIBE_LISTS[list].stopped.length).toBeGreaterThan(0);
    }
  });
});

describe('token scoping', () => {
  const ORIGINAL = process.env.EMAIL_TOKEN_SECRET;

  beforeEach(() => {
    process.env.EMAIL_TOKEN_SECRET = 'a-test-secret-long-enough';
  });

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.EMAIL_TOKEN_SECRET;
    else process.env.EMAIL_TOKEN_SECRET = ORIGINAL;
  });

  it('will not let one list’s link act on another', () => {
    // The protection that was already there and was being wasted: the purpose is inside the HMAC, so
    // a recap token cannot unsubscribe the alerts even if the query string claims it should.
    const recapToken = unsubscribeToken('u1', 'recap')!;

    expect(verifyUnsubscribeToken('u1', recapToken, 'recap')).toBe(true);
    expect(verifyUnsubscribeToken('u1', recapToken, 'rule-alerts')).toBe(false);
  });

  it('will not let one account’s link act on another', () => {
    const mine = unsubscribeToken('u1', 'recap')!;
    expect(verifyUnsubscribeToken('u2', mine, 'recap')).toBe(false);
  });

  it('carries the list in the link it builds', () => {
    const url = unsubscribeUrl('https://trendchasers.net', 'u1', 'rule-alerts')!;
    expect(url).toContain('p=rule-alerts');
    expect(url).toContain('uid=u1');
  });

  it('mints nothing without a secret, rather than something forgeable', () => {
    delete process.env.EMAIL_TOKEN_SECRET;
    expect(unsubscribeToken('u1', 'recap')).toBeNull();
    expect(unsubscribeUrl('https://trendchasers.net', 'u1')).toBeNull();
    expect(verifyUnsubscribeToken('u1', 'anything', 'recap')).toBe(false);
  });
});

describe('the jobs that send these', () => {
  /*
   * Asserted against the source because both are Netlify handlers, which vitest does not collect.
   * The failure being pinned is not a crash — it is a link that works and stops the wrong list, which
   * nothing else here could notice.
   */
  it('has the rule-alert job signing its link for the rule alerts', () => {
    const job = readFileSync('netlify/functions/rule-alerts.ts', 'utf8');
    expect(job).toContain("unsubscribeUrl(siteUrl(), uid, 'rule-alerts')");
  });

  it('has the recap job signing its links for the recap', () => {
    // The default, and correct here — asserted so that a later change to the default cannot silently
    // re-point these.
    const job = readFileSync('netlify/functions/weekly-recap.ts', 'utf8');
    expect(job).toMatch(/unsubscribeUrl\(siteUrl\(\), uid\)/);
  });

  it('has the endpoint reading the list instead of assuming one', () => {
    const endpoint = readFileSync('netlify/functions/email-unsubscribe.ts', 'utf8');
    expect(endpoint).toContain('resolveList(event.queryStringParameters?.p)');
    // The old line, which wrote the recap preference whatever the link said.
    expect(endpoint).not.toMatch(/\{ uid, recap: false/);
  });
});
