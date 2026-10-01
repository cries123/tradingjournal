import { describe, expect, it } from 'vitest';
import { escapeHtml, ticketReplyEmail, trialEmail, weeklyRecapEmail } from '../../server/emailTemplates';
import { TIER_PLANS, type Tier } from '../config/tiers';
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
   * The price in a trial email was typed in by hand while the plan name came from TIER_PLANS, and the
   * hand-typed one said five dollars a month for a plan that costs nine. Two of the three stages
   * quoted it — to everybody whose trial was ending, which is the worst audience there is for a wrong
   * price.
   *
   * Taking the tier rather than a rendered name is what makes that impossible now: both come out of
   * tiers.ts, which the repo treats as the only source of truth for the ladder.
   */
  const progress = { imported: 12, connected: true };

  const email = (stage: 'started' | 'ending' | 'last-day', tier: Tier = 'silver') =>
    trialEmail({ stage, daysLeft: 2, tier, progress, siteUrl: 'https://trendchasers.net' });

  it('quotes the price the plan actually costs', () => {
    const price = `$${TIER_PLANS.silver.price}`;

    for (const stage of ['ending', 'last-day'] as const) {
      const body = email(stage).html;
      expect(body, stage).toContain(`${TIER_PLANS.silver.name} is ${price} a month`);
      expect(body, stage).not.toContain('$5 a month');
    }
  });

  it('quotes the right price for a trial on a different plan', () => {
    // The reason this takes a tier: the trial tier is a constant that can move, and a comped trial
    // can be on any plan at all.
    const body = email('ending', 'diamond').html;
    expect(body).toContain(`${TIER_PLANS.diamond.name} is $${TIER_PLANS.diamond.price} a month`);
  });

  it('names the plan consistently in the subject and the body', () => {
    const { subject, html } = email('ending');
    expect(subject).toContain(TIER_PLANS.silver.name);
    expect(html).toContain(TIER_PLANS.silver.name);
  });

  it('never promises a price on the welcome note, which has nothing to sell', () => {
    // The first email's job is to get them to connect a broker. A price in it is a sales pitch at
    // somebody who has not seen the product work yet.
    expect(email('started').html).not.toContain('a month');
  });

  it('always sends a plain-text alternative', () => {
    for (const stage of ['started', 'ending', 'last-day'] as const) {
      expect(email(stage).text.length, stage).toBeGreaterThan(0);
    }
  });
});
