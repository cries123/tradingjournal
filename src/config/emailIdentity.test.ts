import { describe, expect, it } from 'vitest';
import { normalizeEmail, sameMailbox } from './emailIdentity';

/*
 * The two directions are not equally expensive.
 *
 * Letting one determined person through costs about a dollar. Deciding that two real, unrelated
 * customers are the same mailbox refuses one of them their trial with a message accusing them of
 * having already had it — so every rule here errs towards treating addresses as different.
 */

describe('the same mailbox under another name', () => {
  it('ignores case and surrounding space', () => {
    expect(normalizeEmail('  Jay@Example.COM ')).toBe('jay@example.com');
  });

  it('strips plus-addressing, which is the whole technique', () => {
    expect(normalizeEmail('jay+1@example.com')).toBe('jay@example.com');
    expect(normalizeEmail('jay+trial+again@example.com')).toBe('jay@example.com');
    expect(sameMailbox('jay+one@fastmail.com', 'jay+two@fastmail.com')).toBe(true);
  });

  it('ignores dots for Gmail, and only for Gmail', () => {
    expect(sameMailbox('j.a.y@gmail.com', 'jay@gmail.com')).toBe(true);
    expect(sameMailbox('j.ay@googlemail.com', 'jay@gmail.com')).toBe(true);
    // Two different people at the same company. Collapsing these refuses a real customer.
    expect(sameMailbox('john.smith@acme.com', 'johnsmith@acme.com')).toBe(false);
  });

  it('folds only the alias domains the providers themselves publish', () => {
    expect(sameMailbox('jay@hotmail.com', 'jay@outlook.com')).toBe(true);
    expect(sameMailbox('jay@protonmail.com', 'jay@proton.me')).toBe(true);
    expect(sameMailbox('jay@fastmail.com', 'jay@fastmail.fm')).toBe(false);
  });

  it('keeps genuinely different people apart', () => {
    expect(sameMailbox('jay@gmail.com', 'jaye@gmail.com')).toBe(false);
    expect(sameMailbox('jay@gmail.com', 'jay@outlook.com')).toBe(false);
    expect(sameMailbox('jay@sub.example.com', 'jay@example.com')).toBe(false);
  });

  it('refuses to key a record on something that is not an address', () => {
    const bad = ['', '   ', 'jay', 'jay@', '@example.com', 'jay@localhost', 'jay@.com', 'jay@com.'];
    for (const value of bad) expect(normalizeEmail(value)).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail(42 as unknown as string)).toBeNull();
    // "+tag@" reaches no mailbox: stripping the tag would leave an empty local part.
    expect(normalizeEmail('+tag@example.com')).toBeNull();
    expect(sameMailbox(null, null)).toBe(false);
    expect(sameMailbox('nonsense', 'nonsense')).toBe(false);
  });

  it('splits on the last @, so a local part containing one cannot smuggle a domain in', () => {
    expect(normalizeEmail('a@b@example.com')).toBe('a@b@example.com');
  });
});
