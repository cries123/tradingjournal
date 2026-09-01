import { describe, expect, it } from 'vitest';
import { escapeHtml, ticketReplyEmail, weeklyRecapEmail } from '../../server/emailTemplates';
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
