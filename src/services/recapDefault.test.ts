import { describe, expect, it } from 'vitest';
import { recapIsOn, type EmailPrefs } from './emailPrefs';

/*
 * Who the weekly recap goes to, now that it defaults on for the plans that are sold it.
 *
 * The Diamond card promises "a weekly review written by the assistant, emailed to you" and the
 * flag behind it defaulted to false — so the job's recipient query, `emailPrefs where recap ==
 * true`, did not contain the people paying for it unless they had found a toggle in Settings.
 * Most never did, and had no way to learn the feature existed.
 *
 * The rule lives here so the checkbox and the send read it from the same place. A Settings toggle
 * that says off while a Sunday email goes out is worse than the original bug.
 */

const prefs = (recap: boolean | null): EmailPrefs => ({ recap });

describe('recapIsOn', () => {
  it('sends to a plan that includes it when nothing has been said', () => {
    expect(recapIsOn(prefs(null), true)).toBe(true);
  });

  it('does not send to a plan that does not, when nothing has been said', () => {
    // Free and Silver were never promised this. Defaulting an email on is only defensible when the
    // email is the thing they bought.
    expect(recapIsOn(prefs(null), false)).toBe(false);
  });

  it('respects an explicit no, even on a plan that includes it', () => {
    // This is what the unsubscribe link in every footer writes. It has to win.
    expect(recapIsOn(prefs(false), true)).toBe(false);
  });

  it('respects an explicit yes on a plan that does not include it', () => {
    // A Silver user who ticked the box still gets the templated recap; only the AI-written version
    // is tier-gated, and that gate is in the job.
    expect(recapIsOn(prefs(true), false)).toBe(true);
  });

  it('treats a missing record as never said, not as no', () => {
    // fetchEmailPrefs returns this when offline or when the document does not exist. Reading it as
    // "no" would show a Diamond account an unticked box while the job kept emailing them.
    expect(recapIsOn(null, true)).toBe(true);
    expect(recapIsOn(null, false)).toBe(false);
  });
});
