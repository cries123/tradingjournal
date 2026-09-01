import { createHmac, timingSafeEqual } from 'crypto';

/**
 * One-click unsubscribe links that don't need the reader to be signed in.
 *
 * An unsubscribe that asks someone to log in first is an unsubscribe that doesn't work, and a
 * mailing list nobody can leave is how a sending domain gets blacklisted. So the link carries the
 * uid and a signature over it; the endpoint verifies the signature and turns the preference off.
 *
 * Signed rather than random so nothing has to be stored or expired, and compared in constant time
 * so the signature cannot be recovered a byte at a time. Scoped by purpose, so a token minted for
 * the recap can never be replayed against some future list.
 */

const SECRET_ENV = 'EMAIL_TOKEN_SECRET';

function secret(): string | null {
  const value = process.env[SECRET_ENV]?.trim();
  return value && value.length >= 16 ? value : null;
}

export function unsubscribeToken(uid: string, purpose = 'recap'): string | null {
  const key = secret();
  if (!key) return null;
  return createHmac('sha256', key).update(`${purpose}:${uid}`).digest('hex').slice(0, 32);
}

export function verifyUnsubscribeToken(uid: string, token: string, purpose = 'recap'): boolean {
  const expected = unsubscribeToken(uid, purpose);
  if (!expected || !token) return false;

  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  // timingSafeEqual throws on a length mismatch, which would itself leak the length.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function unsubscribeUrl(baseUrl: string, uid: string, purpose = 'recap'): string | null {
  const token = unsubscribeToken(uid, purpose);
  if (!token) return null;
  return `${baseUrl}/api/email-unsubscribe?uid=${encodeURIComponent(uid)}&t=${token}&p=${purpose}`;
}
