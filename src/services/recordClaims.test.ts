import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/*
 * What a published record is allowed to claim.
 *
 * The page exists to be believed by somebody who has no reason to believe it, so every word on it
 * has to survive being checked. Two claims are off limits, and both are exactly what gets added
 * later by somebody making the page sound stronger:
 *
 * - "audited", because nobody audits these trades, and an audited track record is a specific,
 *   regulated claim in performance advertising.
 * - any promise that a record cannot be faked. firestore.rules lets a signed-in user write their
 *   own trade documents — broker sync runs in the browser, so it has to — which means a determined
 *   forgery is possible even though nothing typed into the journal can reach these figures. The
 *   second half is true and is what the page says instead. See isBrokerVerified for the two ways
 *   to close that gap properly.
 *
 * A test rather than a comment because the failure is silent: nobody reviewing a copy change would
 * know the careful sentence was load-bearing.
 */

/** The public page and the link-preview card. */
const PUBLIC_SURFACES = ['src/pages/TrackRecordPage.tsx', 'server/recordPreviewMeta.ts'];

/** Everything above, plus the in-app screen the trader publishes from. */
const ALL_SURFACES = [...PUBLIC_SURFACES, 'src/components/trackRecord/TrackRecordContent.tsx'];

/** Only the prose. A comment explaining why a claim is banned must not trip the ban itself. */
function visibleText(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
}

const CANNOT_BE_FAKED = [
  /cannot be (faked|fabricated|forged|manipulated|falsified)/i,
  /can(not|'t| not) be made up/i,
  /impossible to (fake|fabricate|forge|falsify)/i,
  /tamper[- ]proof/i,
  /fraud[- ]proof/i,
];

/** Asserting an audit, as opposed to denying one — "looks audited and is not" is fine. */
const CLAIMS_AN_AUDIT = [
  /\b(is|are|was|were|been|fully|independently|third[- ]party) audited\b/i,
  /\baudited by\b/i,
  /\baudited (track )?record\b/i,
  /\bwe audit\b/i,
];

describe('claims on a published record', () => {
  for (const path of ALL_SURFACES) {
    const text = visibleText(path);

    it(`${path} never promises a record cannot be faked`, () => {
      for (const banned of CANNOT_BE_FAKED) {
        expect(text, `${path} matched ${banned}`).not.toMatch(banned);
      }
    });

    it(`${path} never asserts an audit`, () => {
      for (const banned of CLAIMS_AN_AUDIT) {
        expect(text, `${path} matched ${banned}`).not.toMatch(banned);
      }
    });
  }

  for (const path of PUBLIC_SURFACES) {
    it(`${path} does not use the word audit at all`, () => {
      // Stricter than the shared rule: on a page a stranger reads, there is no sentence worth
      // writing that needs the word, and every use of it is one edit away from being a claim.
      expect(visibleText(path).toLowerCase()).not.toMatch(/\baudit/);
    });
  }

  it('still makes the claim that is true, so the ban cannot quietly empty the page', () => {
    // Every rule above only forbids. Without this, deleting the honest sentence would pass them all.
    const page = readFileSync(new URL('../../src/pages/TrackRecordPage.tsx', import.meta.url), 'utf8');
    expect(page).toContain('can never reach these figures');
  });
});
