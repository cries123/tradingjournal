import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  friendlyDate,
  ticketReplyEmail,
  trialEmail,
  weeklyRecapEmail,
} from '../../server/emailTemplates';
import { TIER_PLANS } from '../config/tiers';
import { REFUND_WINDOW_DAYS } from '../config/legal';
import type { WeeklyRecap } from '../utils/insights';

const SITE = 'https://trendchasers.net';

describe('escapeHtml', () => {
  it('neutralises markup, so a ticket subject cannot inject into the email', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
    expect(escapeHtml(`"quoted" & 'single'`)).toBe('&quot;quoted&quot; &amp; &#39;single&#39;');
  });
});

describe('ticketReplyEmail', () => {
  const mail = ticketReplyEmail({
    ticketSubject: 'Paid for Gold but still on Free',
    preview: 'Sorry about that — I can see the payment and have moved you onto Gold now.',
    siteUrl: SITE,
  });

  it('subjects the reply so it threads under the original', () => {
    expect(mail.subject).toBe('Re: Paid for Gold but still on Free');
  });

  it('links back to the thread rather than carrying the conversation', () => {
    expect(mail.html).toContain(`${SITE}/support`);
    expect(mail.text).toContain(`${SITE}/support`);
  });

  it('always sends a plain-text alternative', () => {
    expect(mail.text.length).toBeGreaterThan(40);
    expect(mail.text).not.toContain('<');
  });

  it('escapes a hostile subject line', () => {
    const evil = ticketReplyEmail({
      ticketSubject: '<img src=x onerror=alert(1)>',
      preview: 'hello',
      siteUrl: SITE,
    });
    expect(evil.html).not.toContain('<img src=x');
    expect(evil.html).toContain('&lt;img src=x');
  });

  it('truncates a long reply rather than mailing the whole thread', () => {
    const long = ticketReplyEmail({
      ticketSubject: 'Long one',
      preview: 'x'.repeat(500),
      siteUrl: SITE,
    });
    expect(long.html).toContain('…');
    expect(long.text.length).toBeLessThan(400);
  });
});

describe('weeklyRecapEmail', () => {
  const recap: WeeklyRecap = {
    net: 1240.5,
    greenDays: 3,
    redDays: 1,
    tradeCount: 12,
    bestDay: { date: '2026-08-27', pnl: 900 },
    worstDay: { date: '2026-08-25', pnl: -220 },
    topSetup: { setup: 'BREAKOUT', pnl: 800, trades: 4, winRate: 75 },
    prevNet: 400,
  };

  it('puts the number that matters in the subject line', () => {
    const mail = weeklyRecapEmail({ recap, siteUrl: SITE });
    expect(mail.subject).toContain('$1,240.5');
    expect(mail.subject).toContain('12 trades');
  });

  it('formats a losing week without a double sign', () => {
    const mail = weeklyRecapEmail({ recap: { ...recap, net: -820 }, siteUrl: SITE });
    expect(mail.subject).toContain('-$820');
    expect(mail.subject).not.toContain('--');
  });

  it('shows the week-over-week move when there is history', () => {
    const mail = weeklyRecapEmail({ recap, siteUrl: SITE });
    expect(mail.html).toContain('vs last week');
  });

  it('omits the comparison when there is no prior week', () => {
    const mail = weeklyRecapEmail({ recap: { ...recap, prevNet: null }, siteUrl: SITE });
    expect(mail.html).not.toContain('vs last week');
  });

  it('carries an unsubscribe link when one is available', () => {
    const url = `${SITE}/api/email-unsubscribe?uid=abc&t=deadbeef&p=recap`;
    const mail = weeklyRecapEmail({ recap, siteUrl: SITE, unsubscribeUrl: url });
    expect(mail.html).toContain(url);
    expect(mail.text).toContain(url);
  });

  it('renders without one rather than printing a broken link', () => {
    const mail = weeklyRecapEmail({ recap, siteUrl: SITE, unsubscribeUrl: null });
    expect(mail.html).not.toContain('Unsubscribe');
    expect(mail.text).not.toContain('Unsubscribe');
  });
});

describe('trialEmail', () => {
  /*
   * These three emails described a trial the product does not sell.
   *
   * They were written for a complimentary week with no card. What runs is a Creem subscription with
   * the card taken at checkout, so the welcome said "nothing to cancel and no card on file" and the
   * note two days out said "nothing happens if you don't" — the last thing a customer would read
   * before a $9 line on their statement was a promise that no charge was coming. Nothing had ever
   * been sent, because the job looked for a record only a dead endpoint wrote.
   *
   * So the assertions here are about the disclosure, not the tone. The price has its own history
   * too: it was typed in by hand while the plan name came from TIER_PLANS, and the hand-typed one
   * said five dollars a month for a plan that costs nine.
   */
  const progress = { imported: 12, connected: true };
  const ENDS = '2026-09-18T15:00:00.000Z';

  const email = (
    stage: 'started' | 'ending' | 'last-day',
    over: Partial<Parameters<typeof trialEmail>[0]> = {},
  ) =>
    trialEmail({
      stage,
      daysLeft: 2,
      endsAt: ENDS,
      sentAt: ENDS,
      willCharge: true,
      tier: 'silver',
      progress,
      siteUrl: 'https://trendchasers.net',
      ...over,
    });

  const STAGES = ['started', 'ending', 'last-day'] as const;

  it('tells every stage that a card is on file and will be charged', () => {
    const price = `$${TIER_PLANS.silver.price}`;

    for (const stage of STAGES) {
      const mail = email(stage);
      expect(mail.html, stage).toContain('the card you used at checkout is charged');
      expect(mail.html, stage).toContain(price);
      expect(mail.text, stage).toContain(price);
    }
  });

  it('never says the things that would have caused the chargeback', () => {
    // Quoted from the copy this replaced. A regression here is not a formatting nit — it is an
    // email denying the existence of a card that is about to be charged.
    for (const stage of STAGES) {
      const { html, text } = email(stage);
      for (const lie of ['no card on file', 'Nothing to cancel', 'Nothing happens if you']) {
        expect(html, `${stage}: ${lie}`).not.toContain(lie);
        expect(text, `${stage}: ${lie}`).not.toContain(lie);
      }
    }
  });

  it('names the day, not just a countdown', () => {
    // "in 2 days" is the vague form that let the old copy avoid saying a charge was coming at all.
    // friendlyDate renders the stored ISO in Eastern, which is the clock the rest of the app uses.
    const when = friendlyDate(ENDS);
    for (const stage of STAGES) {
      expect(email(stage).html, stage).toContain(when);
    }
  });

  it('says how to stop it, in every stage', () => {
    for (const stage of STAGES) {
      expect(email(stage).html, stage).toContain('Manage billing or cancel');
    }
  });

  it(`says "ends tomorrow" when it does, rather than ends today beside tomorrow's date`, () => {
    /*
     * decideNudge reaches last-day at daysLeft <= 1, and daysLeft rounds UP — so a trial ending at
     * 6am tomorrow is "1 day" on a run at 3pm today. The job runs at a fixed hour and Creem picks
     * the end time, so for roughly half of all end times this email would have carried "ends today"
     * in the same subject line as tomorrow's date, in the one email whose whole job is a date the
     * reader can trust.
     */
    const dayBefore = email('last-day', { sentAt: '2026-09-17T19:00:00.000Z' });
    expect(dayBefore.subject).toContain('ends tomorrow');
    expect(dayBefore.html).toContain('Tomorrow is the last day');
    expect(dayBefore.subject).not.toContain('ends today');

    const sameDay = email('last-day', { sentAt: ENDS });
    expect(sameDay.subject).toContain('ends today');
    expect(sameDay.html).toContain('Today is the last day');
  });

  it('hedges, because a mid-trial cancellation is invisible to this app', () => {
    /*
     * willCharge is right whenever Creem tells us a subscription was cancelled, and
     * subscription.scheduled_cancel is deliberately ignored upstream — matching it would revoke
     * access weeks early for anybody leaving at the end of a paid period. So somebody who cancels
     * mid-trial still looks active here, and this sentence is the only thing between them and an
     * email insisting on a charge they have already stopped.
     */
    for (const stage of ['ending', 'last-day'] as const) {
      expect(email(stage).html, stage).toContain('If you have already cancelled');
      // The text part is the version some readers get, and it had the hedge only in the HTML.
      expect(email(stage).text, stage).toContain('If you have already cancelled');
    }
    // Not on the one that already says it outright.
    expect(email('ending', { willCharge: false }).html).not.toContain('If you have already cancelled');
  });

  it('does not claim a charge is coming for somebody who has already cancelled', () => {
    for (const stage of STAGES) {
      const mail = email(stage, { willCharge: false });
      expect(mail.html, stage).toContain('already cancelled');
      expect(mail.html, stage).not.toContain('the card you used at checkout is charged');
      expect(mail.subject, stage).not.toContain(`$${TIER_PLANS.silver.price}`);
    }
  });

  it('puts the amount and the date in the subject of the two that carry a charge', () => {
    // The cheapest chargeback insurance there is: the disclosure is read whether or not the email
    // is opened.
    for (const stage of ['ending', 'last-day'] as const) {
      const { subject } = email(stage);
      expect(subject, stage).toContain(`$${TIER_PLANS.silver.price}`);
      expect(subject, stage).toContain(friendlyDate(ENDS));
    }
  });

  it('quotes the right price for a trial on a different plan', () => {
    // The reason this takes a tier rather than a rendered name: the trial tier is a constant that
    // can move, and both the name and the price have to move with it.
    const body = email('ending', { tier: 'diamond' }).html;
    expect(body).toContain(`$${TIER_PLANS.diamond.price}`);
    expect(body).toContain(TIER_PLANS.diamond.name);
    expect(body).not.toContain(`$${TIER_PLANS.silver.price} `);
  });

  it('names the plan consistently in the subject and the body', () => {
    const { subject, html } = email('ending');
    expect(subject).toContain(TIER_PLANS.silver.name);
    expect(html).toContain(TIER_PLANS.silver.name);
  });

  it('offers the refund in the one email that may arrive after the charge', () => {
    // The last-day note can land the same morning the money moves. Pointing at the guarantee is
    // what keeps a surprised customer in the support inbox rather than on the phone to their bank.
    expect(email('last-day').html).toContain(`${REFUND_WINDOW_DAYS}-day money-back guarantee`);
    expect(email('started').html).not.toContain('money-back guarantee');
  });

  it('carries an unsubscribe link on the welcome and on nothing else', () => {
    /*
     * The other two say when a card is charged and how to stop it. Letting somebody opt out of that
     * and then charging them is the surprise the notice exists to prevent — the same reasoning the
     * broker-link notices are written under.
     */
    const link = 'https://trendchasers.net/api/email-unsubscribe?uid=u1&t=abc&p=trial';
    expect(email('started', { unsubscribeUrl: link }).html).toContain(link);
    expect(email('started', { unsubscribeUrl: link }).text).toContain(link);

    for (const stage of ['ending', 'last-day'] as const) {
      expect(email(stage, { unsubscribeUrl: link }).html, stage).not.toContain(link);
    }
  });

  it('always sends a plain-text alternative', () => {
    for (const stage of STAGES) {
      expect(email(stage).text.length, stage).toBeGreaterThan(0);
    }
  });
});


describe('weeklyRecapEmail', () => {
  const recap: WeeklyRecap = {
    net: 1240.5,
    greenDays: 3,
    redDays: 1,
    tradeCount: 12,
    bestDay: { date: '2026-08-27', pnl: 900 },
    worstDay: { date: '2026-08-25', pnl: -220 },
    topSetup: { setup: 'BREAKOUT', pnl: 800, trades: 4, winRate: 75 },
    prevNet: 400,
  };

  it('puts the number that matters in the subject line', () => {
    const mail = weeklyRecapEmail({ recap, siteUrl: SITE });
    expect(mail.subject).toContain('$1,240.5');
    expect(mail.subject).toContain('12 trades');
  });

  it('formats a losing week without a double sign', () => {
    const mail = weeklyRecapEmail({ recap: { ...recap, net: -820 }, siteUrl: SITE });
    expect(mail.subject).toContain('-$820');
    expect(mail.subject).not.toContain('--');
  });

  it('shows the week-over-week move when there is history', () => {
    const mail = weeklyRecapEmail({ recap, siteUrl: SITE });
    expect(mail.html).toContain('vs last week');
  });

  it('omits the comparison when there is no prior week', () => {
    const mail = weeklyRecapEmail({ recap: { ...recap, prevNet: null }, siteUrl: SITE });
    expect(mail.html).not.toContain('vs last week');
  });

  it('carries an unsubscribe link when one is available', () => {
    const url = `${SITE}/api/email-unsubscribe?uid=abc&t=deadbeef&p=recap`;
    const mail = weeklyRecapEmail({ recap, siteUrl: SITE, unsubscribeUrl: url });
    expect(mail.html).toContain(url);
    expect(mail.text).toContain(url);
  });

  it('renders without one rather than printing a broken link', () => {
    const mail = weeklyRecapEmail({ recap, siteUrl: SITE, unsubscribeUrl: null });
    expect(mail.html).not.toContain('Unsubscribe');
    expect(mail.text).not.toContain('Unsubscribe');
  });
});
