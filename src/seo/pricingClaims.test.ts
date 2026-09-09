import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  FREE_INCLUSIONS, MARKET_REPLAY_IS_LIVE, freeAnswer, lowestPaidPrice, paidFeatureNames, priceOf,
} from './pricingClaims';
import { LANDING_FAQ } from './faq';
import { GUIDE_ARTICLES } from './guides';
import { BROKER_GUIDES } from './brokerGuides';
import { PAGE_SEO } from './pageMeta';
import { TIER_PLANS } from '../config/tiers';

/** The features a free account does not get. This is the list that must never be called free. */
const PAID_PHRASES = ['broker sync', 'performance screen', 'ai assistant', 'market replay'];

/** Rough sentence split — good enough to tell "free" in one claim from "paid" in the next. */
function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/);
}

/** Every string of marketing copy the site publishes. */
function allCopy(): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  for (const f of LANDING_FAQ) out.push({ where: `faq: ${f.question}`, text: f.answer });
  for (const g of GUIDE_ARTICLES) {
    out.push({ where: `${g.path} description`, text: g.description });
    for (const s of g.sections) for (const p of s.paragraphs) out.push({ where: g.path, text: p });
  }
  for (const g of BROKER_GUIDES) {
    out.push({ where: `${g.path} intro`, text: g.intro });
    for (const s of g.sections) for (const p of s.paragraphs) out.push({ where: g.path, text: p });
    for (const f of g.faq) out.push({ where: `${g.path} faq`, text: f.answer });
  }
  for (const [key, meta] of Object.entries(PAGE_SEO)) {
    out.push({ where: `meta: ${key}`, text: `${meta.title} ${meta.description}` });
  }
  return out;
}

describe('published pricing claims', () => {
  /*
   * The bug this exists for, three times over: two broker guides said sync was free, and the
   * landing FAQ listed "performance analytics, optional broker sync" as part of the free journal —
   * that one emitted as FAQPage markup, so it is what Google was given.
   */
  it('never calls a paid feature free in the same breath', () => {
    const offences: string[] = [];
    for (const { where, text } of allCopy()) {
      for (const sentence of sentences(text)) {
        const lower = sentence.toLowerCase();
        if (!/\bfree\b/.test(lower)) continue;
        // A sentence may mention both if it also says what the paid thing costs.
        if (/\$\d|\bpaid\b/.test(lower)) continue;
        const named = PAID_PHRASES.filter((p) => lower.includes(p));
        if (named.length) offences.push(`${where}: "${sentence.trim()}" names ${named.join(', ')}`);
      }
    }
    expect(offences).toEqual([]);
  });

  it('describes the free plan without naming anything that is not', () => {
    for (const phrase of PAID_PHRASES) {
      expect(FREE_INCLUSIONS.toLowerCase(), phrase).not.toContain(phrase);
    }
  });

  it('quotes a price that matches the plans', () => {
    expect(lowestPaidPrice()).toBe(TIER_PLANS.silver.price);
    expect(freeAnswer()).toContain(`$${TIER_PLANS.silver.price} a month`);
  });

  it('does not advertise a feature the app will not run', () => {
    // Market replay is sold with Diamond but withheld until it works.
    expect(MARKET_REPLAY_IS_LIVE).toBe(false);
    expect(priceOf('marketReplay')).toBeNull();
    expect(paidFeatureNames()).not.toContain('market replay');
    expect(freeAnswer().toLowerCase()).not.toContain('market replay');
  });

  it('still says the paid features are paid, rather than going quiet about them', () => {
    expect(paidFeatureNames()).toContain('broker sync');
    expect(paidFeatureNames()).toContain('the performance screen');
  });
});


/*
 * Prices belong in one place.
 *
 * "Broker sync from $5/month" survived a repricing in two components because it was typed out
 * rather than read from the plan. This walks the source for a dollar amount that looks like a
 * plan price and is not one, which is the shape that goes stale silently.
 */
describe('no plan price is written down twice', () => {
  const roots = ['src/components', 'src/pages', 'src/data', 'src/seo'];
  const current = new Set(Object.values(TIER_PLANS).map((p) => p.price));

  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return /\.tsx?$/.test(entry.name) && !entry.name.includes('.test.') ? [full] : [];
    });

  it('never states a plan price as a literal in user-facing copy', () => {
    const offenders: string[] = [];

    for (const file of roots.flatMap(sourceFiles)) {
      // tiers.ts is where the prices live, and costs.ts talks about them in comments.
      if (file.includes('config/tiers') || file.includes('config/costs')) continue;
      const text = readFileSync(file, 'utf8');

      for (const match of text.matchAll(/\$(\d+)\s*(?:\/|\s?(?:a|per)\s)\s*month/gi)) {
        if (current.has(Number(match[1]))) offenders.push(`${file}: ${match[0]}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
