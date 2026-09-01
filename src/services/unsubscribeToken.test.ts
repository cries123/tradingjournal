import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  unsubscribeToken,
  unsubscribeUrl,
  verifyUnsubscribeToken,
} from '../../server/unsubscribeToken';

const SECRET = 'a-secret-long-enough-to-be-real';

describe('unsubscribe tokens', () => {
  const original = process.env.EMAIL_TOKEN_SECRET;

  beforeEach(() => {
    process.env.EMAIL_TOKEN_SECRET = SECRET;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.EMAIL_TOKEN_SECRET;
    else process.env.EMAIL_TOKEN_SECRET = original;
  });

  it('accepts the token it minted', () => {
    const token = unsubscribeToken('user-1')!;
    expect(verifyUnsubscribeToken('user-1', token)).toBe(true);
  });

  it('rejects another user’s token — the whole point of signing it', () => {
    const token = unsubscribeToken('user-1')!;
    expect(verifyUnsubscribeToken('user-2', token)).toBe(false);
  });

  it('rejects a token minted for a different list', () => {
    const token = unsubscribeToken('user-1', 'recap')!;
    expect(verifyUnsubscribeToken('user-1', token, 'newsletter')).toBe(false);
  });

  it('rejects a tampered or truncated token without throwing', () => {
    const token = unsubscribeToken('user-1')!;
    expect(verifyUnsubscribeToken('user-1', token.slice(0, 20))).toBe(false);
    expect(verifyUnsubscribeToken('user-1', `${token.slice(0, -1)}0`)).toBe(false);
    expect(verifyUnsubscribeToken('user-1', '')).toBe(false);
  });

  it('changes when the secret changes, so rotating it invalidates old links', () => {
    const before = unsubscribeToken('user-1');
    process.env.EMAIL_TOKEN_SECRET = 'a-completely-different-secret-value';
    expect(unsubscribeToken('user-1')).not.toBe(before);
  });

  it('builds a link carrying the uid, the token and the list', () => {
    const url = unsubscribeUrl('https://trendchasers.net', 'user-1')!;
    expect(url).toContain('/api/email-unsubscribe?uid=user-1');
    expect(url).toContain('&p=recap');
    expect(url).toContain(unsubscribeToken('user-1')!);
  });
});

describe('with no secret configured', () => {
  const original = process.env.EMAIL_TOKEN_SECRET;

  beforeEach(() => {
    delete process.env.EMAIL_TOKEN_SECRET;
  });

  afterEach(() => {
    if (original !== undefined) process.env.EMAIL_TOKEN_SECRET = original;
  });

  it('mints nothing rather than signing with an empty key', () => {
    expect(unsubscribeToken('user-1')).toBeNull();
    expect(unsubscribeUrl('https://trendchasers.net', 'user-1')).toBeNull();
  });

  it('verifies nothing, so an unsigned deployment cannot be unsubscribed through', () => {
    expect(verifyUnsubscribeToken('user-1', 'anything')).toBe(false);
  });

  it('refuses a secret too short to be worth having', () => {
    process.env.EMAIL_TOKEN_SECRET = 'short';
    expect(unsubscribeToken('user-1')).toBeNull();
  });
});
