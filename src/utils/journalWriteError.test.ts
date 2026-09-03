import { describe, expect, it } from 'vitest';
import { describeJournalWriteError, needsReload } from './journalWriteError';

const firebaseError = (code: string, message = 'x') => Object.assign(new Error(message), { code });

describe('describeJournalWriteError', () => {
  /*
   * The reported case. A Silver customer's sync pulled fine and then failed to save, twice in two
   * days, on an iPhone. "Missing or insufficient permissions" is what the server said; it is not
   * what the trader needs to read about their own journal.
   */
  it('does not tell an owner they lack permission on their own trades', () => {
    const said = describeJournalWriteError(
      firebaseError('permission-denied', 'Missing or insufficient permissions.'),
    );
    expect(said.toLowerCase()).not.toContain('permission');
    expect(said).toContain('Reload');
    expect(said).toContain('sign-in expired');
  });

  it('says the data is safe when the problem is the network', () => {
    const said = describeJournalWriteError(firebaseError('unavailable'));
    expect(said).toContain('saved on this device');
    expect(said).not.toContain('Reload');
  });

  it('recognises the latched async queue, which never recovers on its own', () => {
    const said = describeJournalWriteError(
      new Error('FIRESTORE (11.0.0) INTERNAL ASSERTION FAILED: Unexpected state (ID: b815)'),
    );
    expect(said).toContain('Reload');
    expect(said).toContain('nothing has been lost');
  });

  it('always tells the trader their data survived', () => {
    for (const err of [new Error('boom'), firebaseError('weird'), undefined, 'a string']) {
      const said = describeJournalWriteError(err);
      expect(said.length, String(err)).toBeGreaterThan(20);
      expect(said, String(err)).toMatch(/nothing has been lost|saved on this device|will save/i);
    }
  });
});

describe('needsReload', () => {
  it('is true for the failures a retry cannot fix', () => {
    expect(needsReload(new Error('INTERNAL ASSERTION FAILED: Unexpected state'))).toBe(true);
    expect(needsReload(firebaseError('permission-denied'))).toBe(true);
    expect(needsReload(firebaseError('unauthenticated'))).toBe(true);
  });

  it('is false for a network blip, which fixes itself', () => {
    expect(needsReload(firebaseError('unavailable'))).toBe(false);
    expect(needsReload(new Error('boom'))).toBe(false);
  });
});
