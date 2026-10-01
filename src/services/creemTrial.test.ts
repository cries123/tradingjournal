import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBillingEvent } from '../../server/creemClient';
import { trialPatch, trialUntil } from '../../server/entitlements';
import type { Entitlement } from '../../server/entitlements';

/*
 * One trial, Creem's, and the two dates that make it visible.
 *
 * There were two trial systems. The one that ran was Creem's — the Silver product has a trial on
 * it, so checkout takes the card and the subscription starts in 'trialing'. The other granted a
 * week of complimentary Silver with no card, from POST /api/start-trial, and when the trial moved
 * to Creem only the BUTTON was repointed: the endpoint stayed routed and any signed-in verified
 * account could still call it.
 *
 * Everything downstream read the dead one. parseBillingEvent mapped 'trialing' to status 'active'
 * and dropped the fact, so the record was byte-for-byte a paid subscription: the three trial emails
 * never sent, the "one trial per brokerage" guard never fired, every screen said "renews", and the
 * admin run rate counted $9 nobody had paid.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf-8');

/*
 * Comments stripped before a 'does not contain' assertion.
 *
 * Several of the comments written for this change quote the thing being removed — "this used to
 * read comp.until", "the endpoint behind /api/start-trial" — and a bare string search is happy to
 * find the prose and call the wire still connected. That has fooled a test in this suite before.
 */
const codeOnly = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

const event = (eventType: string, object: Record<string, unknown> = {}) =>
  parseBillingEvent({
    eventType,
    object: { id: 'sub_1', metadata: { uid: 'u1', tier: 'silver' }, ...object },
  } as never);

describe('spotting a trial on the way in', () => {
  it('reads it from the event type Creem is configured to send', () => {
    // subscription.trialing is one of the fourteen enabled in the dashboard — see billingLedger's
    // own list, which pins the same event mapping to 'active'.
    expect(event('subscription.trialing')?.trialing).toBe(true);
  });

  it('reads it from the object status too, for the events that do not say it in the name', () => {
    /*
     * One purchase emits checkout.completed as well, and if Creem ever stops sending the dedicated
     * event the object's own status is the only thing left to read. Missing it costs the emails;
     * a false positive would tell a paying customer their card is about to be charged for the
     * first time, which is why neither test is looser than the literal word.
     */
    expect(event('checkout.completed', { status: 'trialing' })?.trialing).toBe(true);
    expect(event('checkout.completed')?.trialing).toBe(false);
    expect(event('subscription.paid')?.trialing).toBe(false);
  });

  it('still treats a trial as active access, which is the whole point of the trial', () => {
    // Somebody who handed over a card at checkout must pass every gate a subscriber passes. If this
    // ever becomes its own status, billingTier returns free and the triallist is shown the paywall
    // they just paid to get past.
    expect(event('subscription.trialing')?.status).toBe('active');
  });
});

describe('what gets written down', () => {
  const NOW = '2026-09-08T15:00:00.000Z';

  it('records both dates when a trial starts', () => {
    expect(
      trialPatch({ trialing: true, currentPeriodEnd: '2026-09-15T15:00:00.000Z' }, NOW, null),
    ).toEqual({
      trialStartedAt: NOW,
      trialEndsAt: '2026-09-15T15:00:00.000Z',
    });
  });

  it('writes nothing at all for an event that is not a trial', () => {
    /*
     * Only ever adds. A rule of the form "a non-trial event ends the trial" would wipe the marker
     * depending on which of checkout.completed and subscription.trialing arrived second — creemClient
     * says outright that the order is not guaranteed — and the emails would go back to never sending.
     */
    expect(
      trialPatch({ trialing: false, currentPeriodEnd: '2026-10-15T15:00:00.000Z' }, NOW, null),
    ).toEqual({});
  });

  it('still remembers the trial happened when Creem omits the end date', () => {
    // Two different questions. "Has this account ever had a trial" should not depend on a field the
    // payload might leave out; only the countdown does.
    expect(trialPatch({ trialing: true }, NOW, null)).toEqual({ trialStartedAt: NOW });
    expect(trialPatch({ trialing: true, currentPeriodEnd: 'not a date' }, NOW, null)).toEqual({
      trialStartedAt: NOW,
    });
  });

  it('refuses an end date further out than a trial can run', () => {
    /*
     * The trialing flag is read from the event name OR the object's status, so a later event whose
     * object snapshot still says trialing while carrying an ordinary month-long period end would
     * re-arm a full countdown on a customer who has already been charged — and mail them three
     * warnings about a first charge that happened weeks ago.
     */
    const monthOut = new Date(Date.parse(NOW) + 30 * 86_400_000).toISOString();
    expect(trialPatch({ trialing: true, currentPeriodEnd: monthOut }, NOW, null)).toEqual({
      trialStartedAt: NOW,
    });
  });

  it('normalises the date instead of storing whatever Creem spelled', () => {
    /*
     * Three readers compare this value three ways: a Firestore lexicographic range, a string
     * compare in the costs tile, and Date.parse in the app. Date.parse is happy with '10/08/2026',
     * which sorts below every '2026-…' string — the query would match nobody and the emails would
     * go silent while every screen kept showing the countdown correctly.
     */
    const patch = trialPatch({ trialing: true, currentPeriodEnd: '2026-09-15T15:00:00+02:00' }, NOW, null);
    expect(patch.trialEndsAt).toBe('2026-09-15T13:00:00.000Z');
  });

  it('stamps the start once, not on every delivery', () => {
    // Creem can send more than one trialing event for a subscription. Re-stamping would move the
    // start forward under a trial already running, and the welcome note's "a day in" boundary is
    // measured from it.
    const already = { trialStartedAt: '2026-09-01T00:00:00.000Z' } as never;
    expect(
      trialPatch({ trialing: true, currentPeriodEnd: '2026-09-15T15:00:00.000Z' }, NOW, already),
    ).toMatchObject({ trialStartedAt: '2026-09-01T00:00:00.000Z' });
  });
});

describe('whether a trial is running right now', () => {
  const record = (trialEndsAt: string | null): Entitlement => ({
    tier: 'silver',
    source: 'purchase',
    status: 'active',
    updatedAt: '2026-09-08T00:00:00.000Z',
    trialEndsAt,
  });

  const NOW = Date.parse('2026-09-08T15:00:00.000Z');

  it('is a date in the future, and nothing else', () => {
    expect(trialUntil(record('2026-09-15T15:00:00.000Z'), NOW)).toBe('2026-09-15T15:00:00.000Z');
  });

  it('ends by the date passing, with nothing having to run', () => {
    // This is why nothing clears the field. A converted trial is simply one whose date is behind
    // us, so no missed event and no failed write can leave somebody counted down at forever.
    expect(trialUntil(record('2026-09-01T15:00:00.000Z'), NOW)).toBeNull();
  });

  it('is null for a record that never had one, and for a hand-edited one', () => {
    expect(trialUntil(record(null), NOW)).toBeNull();
    expect(trialUntil(record('whenever'), NOW)).toBeNull();
    expect(trialUntil(null, NOW)).toBeNull();
  });
});

describe('the plumbing vitest cannot drive', () => {
  /*
   * Netlify handlers are not collected by the test runner, so these are source assertions. What is
   * being pinned is not a crash — it is a wire that was never connected, which is the exact failure
   * the whole of this change is about.
   */
  const WEBHOOK = read('netlify/functions/creem-webhook.ts');
  const JOB = read('netlify/functions/trial-nudges.ts');

  it('has the webhook writing the marker', () => {
    expect(WEBHOOK).toContain('trialPatch(');
    // The record is read before the patch so trialStartedAt is stamped once, and only on a trialing
    // event so every other delivery still costs one read.
    expect(WEBHOOK).toContain('parsed.trialing ? await readEntitlement(parsed.uid) : null');
    expect(WEBHOOK).toMatch(/\.\.\.trial,/);
  });

  it('has the webhook remembering the mailbox, so a second signup cannot take a second trial', () => {
    expect(WEBHOOK).toContain('rememberTrial(parsed.uid)');
    // Swallowed: this is bookkeeping about abuse, and failing it must never make Creem retry a
    // billing change that already landed.
    expect(WEBHOOK).toMatch(/rememberTrial\(parsed\.uid\)\.catch\(/);
  });

  it('has the nudge job selecting on the field the webhook writes', () => {
    /*
     * A single-field range rides Firestore's automatic index, so this deploys with nothing to build
     * by hand. Adding a second filter here would make it composite, and the job would throw
     * FAILED_PRECONDITION on every run until somebody opened the console.
     */
    expect(JOB).toContain(".where('trialEndsAt', '>=', new Date(now).toISOString())");
    expect(codeOnly('netlify/functions/trial-nudges.ts')).not.toContain('comp.until');
  });

  it('has the nudge job passing the date and the charge through to the email', () => {
    expect(JOB).toContain('endsAt: decision.endsAt');
    expect(JOB).toContain('willCharge: decision.willCharge');
  });

  it('has the nudge job reading the tier off the subscription, not a literal', () => {
    // A 'silver' literal here outlived the trial moving tiers once already and went on quoting
    // Silver's price to everybody mid-trial.
    expect(JOB).toContain('entitlement?.tier ?? TRIAL_TIER');
  });

  it('has the opt-out defaulting to opted IN, like both other mailing jobs', () => {
    // `!prefs?.trial` would silence the sequence for every account that has never opened Settings,
    // which is nearly all of them — and the run log would call it skipped rather than an error.
    expect(JOB).toContain("?.trial === false");
  });

  it('has the welcome carrying an unsubscribe link and the two billing notices not', () => {
    expect(JOB).toMatch(/decision\.stage === 'started'\s*\?\s*unsubscribeUrl\(siteUrl\(\), uid, 'trial'\)\s*:\s*null/);
  });

  it('has the self-serve trial endpoint gone, not just unreferenced', () => {
    /*
     * The endpoint outlived its button. /api/* maps to /.netlify/functions/*, so it stayed routed
     * and any signed-in, verified account could POST it and be granted a week of Silver with no
     * card — and the comp it merged on survives a webhook, so the same account could hold a free
     * week and a paid subscription at once.
     */
    expect(() => read('netlify/functions/start-trial.ts')).toThrow();
    expect(codeOnly('src/services/entitlement.ts')).not.toContain('/api/start-trial');
    expect(codeOnly('server/trialHandler.ts')).not.toContain('handleStartTrial');
  });

  it('has nothing writing the comp-shaped trial marker any more', () => {
    // Four readers keyed on comp.trial. Leaving one behind is a silently inert guard, which is what
    // this whole change is undoing.
    for (const file of [
      'server/brokerConnectHandler.ts',
      'netlify/functions/entitlement.ts',
      'server/trialNudges.ts',
      'server/trialHandler.ts',
    ]) {
      expect(read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''), file).not.toContain(
        'comp?.trial',
      );
    }
  });

  it('books no money for a trial start, whatever the event is called', () => {
    /*
     * isPaymentEvent matches any type containing 'paid', and amountFromEvent returns null when the
     * payload carries no amount — at which point chargeAmount falls back to the list price by
     * design. So a trial start could book a full month, and the real charge a week later would book
     * it again, on the one screen that exists to answer 'did you charge me twice'.
     */
    expect(WEBHOOK).toContain('!parsed.trialing && isPaymentEvent(payload.eventType)');
  });

  it('clears the marker when a trialist changes plan in place', () => {
    // That path writes the entitlement itself, outside the webhook, and tells them we have charged
    // the difference — so the countdown has to stop with it.
    expect(read('netlify/functions/creem-checkout.ts')).toContain("source: 'purchase', trialEndsAt: null");
  });

  it('keeps the trial out of the run rate, and says so where the number is read', () => {
    // A trial is an active subscription with a real id, so it was counted at full list price next
    // to a collected figure that correctly said zero.
    expect(read('server/costsHandler.ts')).toContain("data.trialEndsAt > nowIso");
    expect(read('src/components/admin/CostsPanel.tsx')).toContain('on trial');
  });
});
