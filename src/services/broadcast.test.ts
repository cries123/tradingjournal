import { describe, expect, it } from 'vitest';
import { broadcastBodyHtml, broadcastEmail } from '../../server/emailTemplates';
import { chooseRecipients, parseDraft, readinessProblem, safeHttpsUrl } from '../../server/broadcast';
import { audienceSummary, progressLabel } from '../components/admin/broadcastCopy';
import type { Tier } from '../config/tiers';

/* The parts of the email to everybody that need no server: the list, the draft, the template. */

const draft = (over: Record<string, unknown> = {}) => ({ kind: 'news', audience: 'all', subject: 'Hello', body: 'Hi there.', ...over });

describe('chooseRecipients', () => {
  const accounts = [
    { uid: 'free1', email: 'free1@example.com' },
    { uid: 'gold1', email: 'gold1@example.com' },
    { uid: 'out', email: 'out@example.com' },
  ];
  const tiers = new Map<string, Tier>([['gold1', 'gold']]);

  it('filters by plan before counting opt-outs, so the count is about the audience', () => {
    const { counts } = chooseRecipients(accounts, tiers, new Set(['out', 'gold1']), 'free', 'news');
    // gold1 unsubscribed but is not in the free audience: it is "other plans", not "unsubscribed".
    expect(counts).toMatchObject({ recipients: 1, otherPlans: 1, optedOut: 1 });
  });

  it('only honors the news opt-out for news', () => {
    expect(chooseRecipients(accounts, tiers, new Set(['out']), 'all', 'notice').recipients).toHaveLength(3);
    expect(chooseRecipients(accounts, tiers, new Set(['out']), 'all', 'news').recipients).toHaveLength(2);
  });
});

describe('parseDraft', () => {
  it('uses the subject as the heading when none is given', () => {
    expect(parseDraft(draft(), { confirmNotice: true }).heading).toBe('Hello');
  });

  it('wants a button to have both halves, and an https link', () => {
    expect(() => parseDraft(draft({ ctaLabel: 'Go' }), { confirmNotice: true })).toThrow(/label and a link/);
    expect(() => parseDraft(draft({ ctaLabel: 'Go', ctaUrl: 'http://example.com' }), { confirmNotice: true })).toThrow(/https/);
    expect(() => parseDraft(draft({ ctaLabel: 'Go', ctaUrl: 'javascript:alert(1)' }), { confirmNotice: true })).toThrow(/https/);
    expect(parseDraft(draft({ ctaLabel: 'Go', ctaUrl: 'https://trendchasers.net/market-replay' }), { confirmNotice: true }).ctaUrl).toBe(
      'https://trendchasers.net/market-replay',
    );
  });

  it('will not send a notice unless the admin ticked that it is one', () => {
    expect(() => parseDraft(draft({ kind: 'notice' }), { confirmNotice: true })).toThrow(/not a promotion/);
    expect(parseDraft(draft({ kind: 'notice', noticeConfirmed: true }), { confirmNotice: true }).kind).toBe('notice');
    // The preview and the test are not sends to anybody else.
    expect(parseDraft(draft({ kind: 'notice' }), { confirmNotice: false }).kind).toBe('notice');
  });

  it('keeps a link from breaking out of its attribute', () => {
    expect(safeHttpsUrl('https://example.com/a"onmouseover="x')).not.toContain('"');
  });
});

describe('readinessProblem', () => {
  const ready = { mail: true, unsubscribe: true, postalAddress: 'PO Box 1, Austin, TX' };

  it('asks for a postal address and an unsubscribe link for news only', () => {
    expect(readinessProblem('news', { ...ready, postalAddress: null })).toContain('MAIL_POSTAL_ADDRESS');
    expect(readinessProblem('news', { ...ready, unsubscribe: false })).toContain('EMAIL_TOKEN_SECRET');
    expect(readinessProblem('notice', { ...ready, postalAddress: null, unsubscribe: false })).toBeNull();
  });

  it('needs a mail provider for either', () => {
    expect(readinessProblem('notice', { ...ready, mail: false })).toContain('RESEND_API_KEY');
  });
});

describe('the template', () => {
  it('escapes what was typed, then adds back bold, links and paragraphs', () => {
    const html = broadcastBodyHtml('Hi <script>x</script> **there**\n\nSee https://trendchasers.net/market-replay.');
    expect(html).not.toContain('<script>');
    expect(html).toContain('<strong>there</strong>');
    expect(html).toContain('<a href="https://trendchasers.net/market-replay"');
    // The full stop after the address is the sentence's, not the link's.
    expect(html).toContain('market-replay</a>.');
    expect(html.match(/<p /g)).toHaveLength(2);
  });

  it('loads the logo from the site even when the button points elsewhere', () => {
    const mail = broadcastEmail({ kind: 'news', subject: 's', heading: 'h', body: 'b', ctaLabel: 'Read', ctaUrl: 'https://example.com/post', siteUrl: 'https://trendchasers.net' });
    expect(mail.html).toContain('https://trendchasers.net/nav-logo.png');
    expect(mail.html).not.toContain('https://example.com/nav-logo.png');
  });

  it('writes the plain-text part too, with the unsubscribe link for news', () => {
    const mail = broadcastEmail({ kind: 'news', subject: 's', heading: 'Heading', body: 'One **two**', siteUrl: 'https://t.net', unsubscribeUrl: 'https://t.net/u' });
    expect(mail.text).toContain('One two');
    expect(mail.text).toContain('Unsubscribe: https://t.net/u');
    const notice = broadcastEmail({ kind: 'notice', subject: 's', heading: 'h', body: 'b', siteUrl: 'https://t.net', unsubscribeUrl: 'https://t.net/u' });
    expect(notice.text).not.toContain('Unsubscribe');
  });
});

describe('the panel’s words', () => {
  it('names only the reasons that apply', () => {
    expect(audienceSummary({ recipients: 1, optedOut: 0, noEmail: 0, disabled: 0, otherPlans: 3, duplicates: 0 })).toBe('Reaches 1 person.');
    expect(audienceSummary({ recipients: 1204, optedOut: 37, noEmail: 2, disabled: 0, otherPlans: 0, duplicates: 0 })).toBe(
      'Reaches 1,204 people. Left out: 37 unsubscribed from news, 2 with no usable email.',
    );
  });

  it('says how far a send got', () => {
    expect(progressLabel({ status: 'sending', total: 1204, sent: 300, failed: 0 })).toBe('Unfinished: 300 of 1,204 sent');
    expect(progressLabel({ status: 'done', total: 10, sent: 9, failed: 1 })).toBe('Done: 9 of 10 sent, 1 failed');
  });
});
