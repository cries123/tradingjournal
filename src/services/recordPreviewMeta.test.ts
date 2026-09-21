import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  describeRecord,
  escapeHtml,
  injectMeta,
  tagsForMissingRecord,
  tagsForRecord,
} from '../../server/recordPreviewMeta';
import type { PublishedRecord } from '../utils/trackRecord';

/*
 * The link-preview card.
 *
 * Worth testing rather than eyeballing for two reasons. It is regex surgery on HTML, where the
 * failure mode is a tag appended instead of replaced — the page still renders and each crawler
 * quietly picks one of the two duplicates. And it is the only part of this feature a reader sees
 * before deciding whether to click, so the words on it are the claim.
 */

const record: PublishedRecord = {
  published: true,
  showAmounts: true,
  verifiedTrades: 412,
  excludedTrades: 38,
  brokers: [],
  firstDate: '2026-01-05',
  lastDate: '2026-09-18',
  tradingDays: 171,
  journalsEligible: 1,
  journalsIncluded: 1,
  winRate: 39.9,
  profitFactor: 1.24,
  updatedAt: '2026-09-20T15:04:00.000Z',
};

/** The real shell's tags, in the shape index.html actually writes them. */
const SHELL = `<!doctype html><html><head>
    <link rel="canonical" href="https://trendchasers.net/" />
    <meta property="og:url" content="https://trendchasers.net/" />
    <meta property="og:title" content="Trend Chasers" />
    <meta property="og:description" content="Free trading journal." />
    <meta name="twitter:title" content="Trend Chasers" />
    <meta name="twitter:description" content="Free trading journal." />
    <meta name="twitter:card" content="summary_large_image" />
  </head><body><div id="root"></div></body></html>`;

describe('describeRecord', () => {
  it('never claims the record was audited', () => {
    /*
     * The one word this card must not contain.
     *
     * Nobody audits these trades. "Audited track record" is a specific, regulated claim in
     * performance advertising, and it is the first thing a sceptic tests — the page survives being
     * checked only while every word on it is true.
     */
    const { title, description } = describeRecord(record);
    expect(`${title} ${description}`.toLowerCase()).not.toContain('audit');
  });

  it('does not claim the record cannot be manipulated', () => {
    // The trader picks which brokerage accounts to connect and which journals to include. What
    // they cannot do is edit a figure, and that is the narrower claim the card makes instead.
    const { description } = describeRecord(record);
    expect(description.toLowerCase()).not.toContain('cannot be manipulated');
    expect(description).toContain('cannot edit these figures');
  });

  it('reports the counts without naming anybody', () => {
    const { title, description } = describeRecord(record);
    expect(description).toContain('412');
    expect(description).toContain('171');
    // The card is pasted into group chats and indexed by search engines. It carries figures,
    // never a person.
    expect(`${title} ${description}`).not.toContain('jaryn');
  });

  it('states the exclusions on the card, not only on the page', () => {
    // The number that makes the rest believable has to survive into the preview, because the
    // preview is what most people will read.
    expect(describeRecord(record).description).toContain('38 hand-entered trades excluded');
  });

  it('says nothing about exclusions when there were none', () => {
    const clean = { ...record, excludedTrades: 0 };
    expect(describeRecord(clean).description).not.toContain('excluded');
  });

  it('uses the singular for one excluded trade', () => {
    const one = { ...record, excludedTrades: 1 };
    expect(describeRecord(one).description).toContain('1 hand-entered trade excluded');
  });

  it('has no name to leak, whatever the slug is', () => {
    // There is no name field on a published record any more, so there is nothing for the card
    // to fall back to and nothing for a future edit to accidentally reintroduce.
    expect('username' in record).toBe(false);
  });
});

describe('injectMeta', () => {
  it('replaces the shell tags instead of adding a second copy', () => {
    const out = injectMeta(SHELL, tagsForRecord(record), 'https://trendchasers.net/r/jaryn');

    expect(out.match(/property="og:title"/g)).toHaveLength(1);
    expect(out.match(/name="twitter:title"/g)).toHaveLength(1);
    expect(out).not.toContain('content="Trend Chasers"');
  });

  it('points og:url and canonical at the record, not the homepage', () => {
    // Left alone, every published record would declare itself a duplicate of "/" and drop out of
    // search — on a page whose entire purpose is being found.
    const out = injectMeta(SHELL, tagsForRecord(record), 'https://trendchasers.net/r/jaryn');

    expect(out).toContain('<meta property="og:url" content="https://trendchasers.net/r/jaryn" />');
    expect(out).toContain('<link rel="canonical" href="https://trendchasers.net/r/jaryn" />');
    expect(out).not.toContain('href="https://trendchasers.net/" />');
  });

  it('adds a tag the shell does not already have', () => {
    const out = injectMeta(SHELL, { 'og:type': 'profile' }, 'https://trendchasers.net/r/jaryn');
    expect(out).toContain('<meta property="og:type" content="profile" />');
    expect(out).toContain('</head>');
  });

  it('leaves the app shell intact so the page still boots', () => {
    const out = injectMeta(SHELL, tagsForRecord(record), 'https://trendchasers.net/r/jaryn');
    expect(out).toContain('<div id="root"></div>');
  });

  it('escapes a url that would otherwise break out of the attribute', () => {
    // Slugs are validated elsewhere, but this string is written into an HTML attribute on a
    // public page — escaping belongs where the attribute is written, not in a rule elsewhere.
    const out = injectMeta(
      SHELL,
      tagsForRecord(record),
      'https://trendchasers.net/r/a" onload="alert(1)',
    );

    expect(out).not.toContain('onload="alert(1)"');
    expect(out).toContain('&quot;');
  });

  it('describes a missing record without inventing one', () => {
    const out = injectMeta(SHELL, tagsForMissingRecord(), 'https://trendchasers.net/r/nobody');
    expect(out).toContain('No record here');
    expect(out).not.toContain('412');
  });
});

describe('escapeHtml', () => {
  it('escapes the four characters that matter in an attribute', () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  });

  it('escapes ampersands before the entities it creates', () => {
    // Ordering bug: escaping < first and & second turns "<" into "&amp;lt;".
    expect(escapeHtml('&<')).toBe('&amp;&lt;');
  });
});

/*
 * The fixture above is hand-written, which makes it worth exactly nothing if index.html is
 * formatted differently from it. This runs the injector against the real file.
 *
 * The failure it guards against is silent: a tag the regex cannot match is appended instead of
 * replaced, leaving two og:title tags in the document and each crawler free to pick either. The
 * page still works, the preview is wrong on some platforms and right on others, and nobody can
 * reproduce it. Reformatting index.html should fail here instead.
 */
describe('against the real index.html', () => {
  const shell = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const url = 'https://trendchasers.net/r/jaryn';

  it('replaces every tag it sets, leaving exactly one of each', () => {
    const out = injectMeta(shell, tagsForRecord(record), url);

    for (const tag of ['og:title', 'og:description', 'og:url', 'og:type']) {
      expect(out.match(new RegExp(`property="${tag}"`, 'g')), tag).toHaveLength(1);
    }
    for (const tag of ['twitter:title', 'twitter:description', 'twitter:card']) {
      expect(out.match(new RegExp(`name="${tag}"`, 'g')), tag).toHaveLength(1);
    }
  });

  it('leaves no homepage copy behind in the tags it owns', () => {
    const out = injectMeta(shell, tagsForRecord(record), url);
    const head = out.slice(0, out.indexOf('</head>'));

    expect(head).not.toContain('property="og:title" content="Trend Chasers');
    expect(head).not.toContain('href="https://trendchasers.net/" />');
    expect(head).toContain('broker-verified');
  });

  it('keeps the module script, so the page still boots after injection', () => {
    const out = injectMeta(shell, tagsForRecord(record), url);
    expect(out).toContain('<div id="root">');
    expect(out).toContain('<script type="module"');
  });
});
