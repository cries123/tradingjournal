import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FREE_INCLUSIONS, freeAnswer } from './pricingClaims';

/*
 * Claims the product has outgrown.
 *
 * pricingClaims.test.ts checks that no PAID feature is described as free, which is blind by
 * construction to the opposite mistake: a FREE feature that has since been deleted and is still being
 * advertised. Both kinds are here.
 */

describe('features the free answer must stop naming', () => {
  /*
   * Two were gone. Trade screenshots — the Trade type has no field for one — and the read-only coach
   * share link, which whatsNew records as removed in as many words: "if you shared a coach link, it
   * no longer opens". The only coaching left is the $39 Diamond seat, so that one was advertising a
   * paid feature inside the answer to "is it free?".
   *
   * FREE_INCLUSIONS is emitted as FAQPage JSON-LD, so it is what a search engine caches and shows.
   */
  const REMOVED = [
    { phrase: 'coach share', why: 'the read-only coach link was removed; coaching is a Diamond seat' },
    { phrase: 'screenshot', why: 'the Trade type has no screenshot field' },
  ];

  it.each(REMOVED)('does not promise "$phrase" — $why', ({ phrase }) => {
    expect(FREE_INCLUSIONS.toLowerCase()).not.toContain(phrase);
    expect(freeAnswer().toLowerCase()).not.toContain(phrase);
  });

  it('still describes something worth having', () => {
    // The guard on the guard: emptying the string would satisfy every assertion above.
    expect(FREE_INCLUSIONS.length).toBeGreaterThan(60);
    expect(FREE_INCLUSIONS).toContain('P&L calendar');
  });
});

describe('what the guides say about automatic syncing', () => {
  const guides = readFileSync('src/seo/guides.ts', 'utf8');

  it('does not claim there is no background job while one is scheduled', () => {
    /*
     * The broker-sync guide said "Trend Chasers never reaches out to your broker on its own. There is
     * no background job and no schedule — your trades come in when you open Connect broker and press
     * Sync, and at no other time."
     *
     * Meanwhile auto-sync.ts is schedule('0 11 * * 2-6', ...) and pulls for every connected Diamond
     * account, with autoSyncEnabled defaulting to TRUE — so a subscriber who never opens the Diamond
     * settings has a background job reaching their broker, having read a public page saying there is
     * none.
     */
    expect(guides).not.toContain('There is no background job');
    expect(guides).not.toContain('never reaches out to your broker on its own.');
  });

  it('says which plan it belongs to and that it can be switched off', () => {
    expect(guides).toMatch(/Diamond adds an automatic import/);
    expect(guides).toMatch(/switch for it in Settings/);
  });

  it('is only saying that while the job actually exists', () => {
    // If the morning import is ever withdrawn, this copy becomes the other kind of wrong.
    const job = readFileSync('netlify/functions/auto-sync.ts', 'utf8');
    expect(job).toMatch(/schedule\('0 11 \* \* 2-6'/);
  });
});
