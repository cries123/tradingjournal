import { describe, expect, it } from 'vitest';
import { isProtectedGrant } from '../../server/entitlements';

/**
 * Which accounts the billing system must not touch.
 *
 * Getting this wrong in the permissive direction lets a webhook strip a grandfathered account.
 * Getting it wrong in the strict direction — which is what shipped — blocks ordinary users from
 * buying anything at all, and blocks a payment from applying if they somehow got through. The
 * second is the expensive one, and it is silent.
 */
const base = { updatedAt: '2026-09-01T00:00:00.000Z' };

describe('isProtectedGrant', () => {
  it('protects a hand-granted paid tier', () => {
    expect(
      isProtectedGrant({ ...base, tier: 'diamond', source: 'admin', status: 'active' }),
    ).toBe(true);
  });

  it('does NOT protect a free account, however it was written', () => {
    // The bug: this returned true, so checkout answered "you already have Free access" and
    // refused to sell. Free is not access that competes with a purchase.
    expect(isProtectedGrant({ ...base, tier: 'free', source: 'admin', status: 'active' })).toBe(
      false,
    );
  });

  it('does not protect a real subscription — billing owns those', () => {
    expect(
      isProtectedGrant({ ...base, tier: 'gold', source: 'purchase', status: 'active' }),
    ).toBe(false);
  });

  it('does not protect a grant that is no longer active', () => {
    expect(
      isProtectedGrant({ ...base, tier: 'gold', source: 'admin', status: 'expired' }),
    ).toBe(false);
    expect(
      isProtectedGrant({ ...base, tier: 'gold', source: 'admin', status: 'canceled' }),
    ).toBe(false);
  });

  it('protects nothing when there is no record', () => {
    expect(isProtectedGrant(null)).toBe(false);
  });
});
