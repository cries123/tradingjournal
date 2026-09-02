import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BROKER_GUIDES, BROKER_GUIDE_PATHS, getBrokerGuideBySlug } from './brokerGuides';
import { BROKER_REGISTRY, THINKORSWIM_DISPLAY } from '../data/brokerRegistry';
import { TIER_PLANS } from '../config/tiers';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');

describe('broker guides', () => {
  it('covers every broker the app says it supports', () => {
    const named = [THINKORSWIM_DISPLAY.name, ...BROKER_REGISTRY.map((b) => b.name)];
    expect(BROKER_GUIDES.map((g) => g.brokerName).sort()).toEqual([...named].sort());
  });

  /*
   * These three were the only guides that existed, and they are the ones search has indexed.
   * /brokers/charles-schwab in particular does not match its registry id, so deriving the slug
   * without an override would silently 404 a ranking page.
   */
  it('keeps the addresses the already-published guides live at', () => {
    for (const slug of ['thinkorswim', 'charles-schwab', 'robinhood']) {
      expect(getBrokerGuideBySlug(slug), slug).toBeDefined();
    }
  });

  it('gives every guide a unique slug', () => {
    const slugs = BROKER_GUIDES.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('says something about every broker, with no gaps left by a missing note', () => {
    for (const guide of BROKER_GUIDES) {
      expect(guide.intro, guide.slug).not.toContain('undefined');
      expect(guide.title.length, guide.slug).toBeGreaterThan(10);
      expect(guide.sections.length, guide.slug).toBeGreaterThanOrEqual(3);
      expect(guide.faq.length, guide.slug).toBeGreaterThanOrEqual(3);
      for (const section of guide.sections) {
        expect(section.paragraphs.length, `${guide.slug}/${section.heading}`).toBeGreaterThan(0);
      }
    }
  });

  /*
   * Two of the hand-written guides told readers broker sync was free long after it became a paid
   * feature, because the claim was typed into the page. It is read from the plans now, and this
   * checks it still is.
   */
  it('quotes the real price of broker sync', () => {
    const answer = BROKER_GUIDES[0].faq.find((f) => f.question === 'What does it cost?')?.answer;
    expect(answer).toContain(`$${TIER_PLANS.silver.price} a month`);
    expect(answer).not.toMatch(/\bboth are free\b/i);
  });

  it('does not offer options to a crypto-only exchange', () => {
    const coinbase = getBrokerGuideBySlug('coinbase');
    expect(coinbase?.faq.some((f) => /options/i.test(f.question))).toBe(false);
  });

  it('tells readers when a connector is paused, instead of promising it works', () => {
    for (const entry of BROKER_REGISTRY.filter((b) => b.status?.kind === 'down')) {
      const guide = BROKER_GUIDES.find((g) => g.brokerName === entry.name);
      expect(guide?.sections[0].heading, entry.name).toMatch(/paused/i);
    }
  });

  it('is listed in the sitemap, every one of them', () => {
    const sitemap = read('public/sitemap.xml');
    const missing = BROKER_GUIDE_PATHS.filter((p) => !sitemap.includes(`${p}<`));
    expect(missing, 'add these to public/sitemap.xml').toEqual([]);
  });

  it('is prerendered, every one of them', () => {
    const prerender = read('scripts/prerender.mjs');
    const missing = BROKER_GUIDE_PATHS.filter((p) => !prerender.includes(`'${p}'`));
    expect(missing, 'add these to ROUTES in scripts/prerender.mjs').toEqual([]);
  });
});
