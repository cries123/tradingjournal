import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * Every company this app sends data to has to be named in the privacy policy.
 *
 * Three were not. OpenAI receives a summary of the trader's journal every time the assistant, the AI
 * review or the period takeaway runs — and their written notes too, if they switch that on. Creem
 * receives their billing identity. Resend receives their address and the contents of every email.
 * None of the three appeared anywhere on the page, which listed Firebase, SnapTrade and Netlify and
 * stopped.
 *
 * The policy also told people to delete their account "through Firebase/Google account settings",
 * which is not a thing an email-and-password account can do and not how this app works — it has had
 * self-serve deletion in Account settings the whole time.
 *
 * WHAT THIS TEST CAN AND CANNOT DO. Each row below pairs a vendor with a file that proves the app
 * uses it. If that file stops mentioning the vendor, the row is stale and says so; if the policy
 * stops naming a vendor still in use, that fails too. What it cannot do is notice a NEW processor
 * nobody added a row for — so adding one to this table is part of adding one to the app.
 */

const POLICY = 'src/pages/PrivacyPolicyPage.tsx';

const PROCESSORS: { vendor: string; provenBy: string; receives: string }[] = [
  { vendor: 'Firebase', provenBy: 'src/lib/firebase.ts', receives: 'the account and every trade' },
  { vendor: 'SnapTrade', provenBy: 'server/snaptradeClient.ts', receives: 'the brokerage connection' },
  { vendor: 'OpenAI', provenBy: 'server/aiAssistantHandler.ts', receives: 'a summary of the journal' },
  { vendor: 'Creem', provenBy: 'server/creemClient.ts', receives: 'billing identity and card details' },
  { vendor: 'Resend', provenBy: 'server/mailer.ts', receives: 'the email address and message body' },
];

describe('the privacy policy', () => {
  const policy = readFileSync(POLICY, 'utf8');

  /**
   * Just the third-party services list.
   *
   * Scoped rather than searching the whole page, which a mutation run caught: deleting OpenAI from
   * the list still left the word elsewhere in the prose, so a page-wide match passed while the
   * processor had stopped being declared as one. Being named in a sentence is not the same as being
   * listed as a company that receives data.
   */
  const servicesSection = (() => {
    const start = policy.indexOf('<h2>Third-party services</h2>');
    expect(start, 'the third-party services section has been renamed or removed').toBeGreaterThan(-1);
    const end = policy.indexOf('</section>', start);
    return policy.slice(start, end);
  })();

  it.each(PROCESSORS)('names $vendor, which receives $receives', ({ vendor, provenBy }) => {
    const evidence = readFileSync(provenBy, 'utf8');
    // The row is only meaningful while the app still uses the thing.
    expect(evidence.toLowerCase(), `${provenBy} no longer mentions ${vendor}`).toContain(
      vendor.toLowerCase(),
    );

    expect(servicesSection, `${vendor} is not listed as a third-party service`).toContain(vendor);
  });

  it('says the assistant sends journal data, and that notes are opt-in', () => {
    // The part a trader would most want to know and the part the code is most careful about: notes
    // are excluded unless they switch them on, and saying so is worth as much as the disclosure.
    expect(policy).toMatch(/sent to OpenAI/i);
    expect(policy).toMatch(/notes/i);
    expect(policy).toMatch(/off until you turn it on/i);
  });

  it('points at the deletion the app actually has', () => {
    /*
     * It used to send people to "Firebase/Google account settings", which an email-and-password
     * account cannot use and which was never how this worked. The app deletes accounts itself, and
     * purgeAccount is what carries it out.
     */
    expect(policy).toMatch(/Delete account/);
    expect(policy).not.toMatch(/Firebase\/Google account settings/);
  });

  it('mentions the visit counting, which happens before anyone signs up', () => {
    // visitorAnalytics writes an identifier to the browser of every visitor and records which pages
    // they opened. Small, un-advertised, and not previously disclosed anywhere on the page.
    expect(policy).toMatch(/identifier is stored in your browser/i);
  });
});

describe('the broker claims', () => {
  it('does not name a short list the app has outgrown', () => {
    /*
     * The terms promised import "for Schwab (including thinkorswim accounts) and Robinhood" while the
     * registry offers around twenty, every one of them on the marketing pages as a one-tap connect.
     * Both pages now point at the Brokers page, which is the list that is actually maintained — one
     * source rather than three that drift.
     */
    const terms = readFileSync('src/pages/TermsOfServicePage.tsx', 'utf8');
    const policy = readFileSync(POLICY, 'utf8');

    for (const [file, text] of [['terms', terms], ['privacy policy', policy]] as const) {
      expect(text, file).not.toMatch(/Schwab or Robinhood/);
    }
    expect(terms).toMatch(/listed on the Brokers page/);
  });

  it('keeps the registry bigger than the two the terms used to name', () => {
    // The fact that made the old wording wrong. If the registry ever shrinks back to two, the
    // sentence above is worth rewriting rather than leaving vague.
    const registry = readFileSync('src/data/brokerRegistry.ts', 'utf8');
    const entries = registry.match(/key: '[A-Z_]+'/g) ?? [];
    expect(entries.length).toBeGreaterThan(5);
  });
});
