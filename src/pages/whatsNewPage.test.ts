import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { CHANGELOG } from '../data/whatsNew';

/*
 * The changelog page, and the version numbering it now depends on.
 *
 * Two things are worth holding still here. The versions are hand-written, newest at the top, and
 * nothing derives them — so a duplicate or an out-of-order entry is a typo no type can catch and
 * the page would render two "v2.1"s without complaint, both linking to the same anchor.
 *
 * And the entries are collapsed now, which is only safe because the text stays in the document.
 * The whole point of using <details> over React state was that the prerender and search engines
 * still read every word; a future change to a click-to-load panel would pass a smoke test and
 * quietly empty this page of its content, so the paragraph count is asserted against the source.
 */

vi.mock('../lib/firebase', () => ({
  isFirebaseConfigured: () => false,
  getFirebaseAuth: () => ({ currentUser: null }),
  getFirebaseDb: () => ({}),
}));

// Reads window.history.state on render, and the suite runs in node. It is page chrome either way.
vi.mock('../components/BackLink', () => ({
  BackLink: () => null,
}));

vi.mock('../context/useAuth', () => ({
  useAuth: () => ({
    user: null,
    username: null,
    loading: false,
    profileLoading: false,
    needsUsername: false,
    firebaseEnabled: false,
    logout: async () => {},
  }),
}));

const { WhatsNewPage } = await import('./WhatsNewPage');

const noop = () => {};
const html = renderToString(
  createElement(WhatsNewPage, {
    onHome: noop,
    onLaunch: noop,
    onPrivacy: noop,
    onTerms: noop,
  }),
);

describe('changelog data', () => {
  it('numbers every release once', () => {
    const seen = new Set(CHANGELOG.map((e) => e.version));
    expect(seen.size).toBe(CHANGELOG.length);
  });

  it('runs newest first', () => {
    const asNumber = (v: string) => {
      const [major, minor] = v.split('.');
      // Minor is a counter, not a decimal — 1.13 comes after 1.9, so it cannot be parsed as a float.
      return Number(major) * 1000 + Number(minor);
    };

    for (let i = 1; i < CHANGELOG.length; i += 1) {
      expect(asNumber(CHANGELOG[i - 1]!.version), CHANGELOG[i - 1]!.version).toBeGreaterThan(
        asNumber(CHANGELOG[i]!.version),
      );
    }
  });

  it('gives every entry a version, a date, a title and a description', () => {
    for (const entry of CHANGELOG) {
      expect(entry.version, entry.title).toMatch(/^\d+\.\d+$/);
      expect(entry.date.length, entry.title).toBeGreaterThan(0);
      expect(entry.title.length, entry.title).toBeGreaterThan(0);
      expect(entry.description.length, entry.title).toBeGreaterThan(0);
    }
  });
});

describe('WhatsNewPage', () => {
  it('renders one entry per release', () => {
    for (const entry of CHANGELOG) {
      expect(html, entry.version).toContain(`v${entry.version}`);
      expect(html, entry.title).toContain(`id="v${entry.version.replace(/\./g, '-')}"`);
    }
  });

  it('opens the newest release and leaves the rest closed', () => {
    // `open=""`, not `\sopen\b` — the class list carries Tailwind's own `open:` variants.
    expect(html.match(/<details[^>]*\sopen=""/g) ?? []).toHaveLength(1);
    expect(html.match(/<details/g) ?? []).toHaveLength(CHANGELOG.length);
  });

  it('renders every paragraph of every entry, collapsed or not', () => {
    const paragraphs = CHANGELOG.reduce(
      (total, entry) => total + entry.description.split('\n\n').length,
      0,
    );
    // Every description paragraph is its own <p>; the layout's own copy uses other tags.
    expect(html.match(/text-sm leading-relaxed text-text-secondary/g) ?? []).toHaveLength(
      paragraphs,
    );
  });

  it('keeps each release title as a heading even while collapsed', () => {
    expect(html.match(/<h2/g) ?? []).toHaveLength(CHANGELOG.length);
  });
});
