import { describe, expect, it } from 'vitest';
import {
  compIsLive,
  DAY_MS,
  extensionEndsAt,
  extensionStartsFrom,
  higherTier,
  MAX_EXTENSION_DAYS,
  tierWithComp,
  validCalendarDate,
  validExtensionDays,
  type AccessRecord,
} from '../config/accessExtension';
import { accessSource, complimentaryUntil, effectiveTier, readComp, type Entitlement } from '../../server/entitlements';

const NOW = Date.parse('2026-09-03T18:00:00.000Z');
const iso = (offsetDays: number) => new Date(NOW + offsetDays * DAY_MS).toISOString();

const comp = (tier: 'silver' | 'gold' | 'diamond', untilDays: number) => ({
  tier,
  until: iso(untilDays),
  grantedBy: 'admin',
  grantedAt: iso(0),
});

describe('where an extension counts from', () => {
  it('starts now for someone who has never paid', () => {
    expect(extensionStartsFrom(null, NOW)).toBe(NOW);
  });

  it('starts at the end of a paid period that is still running — time on top, never overlapping', () => {
    const active: AccessRecord = { status: 'active', source: 'purchase', currentPeriodEnd: iso(25) };
    expect(extensionStartsFrom(active, NOW)).toBe(NOW + 25 * DAY_MS);

    const cancelled: AccessRecord = { status: 'canceled', source: 'purchase', currentPeriodEnd: iso(9) };
    expect(extensionStartsFrom(cancelled, NOW)).toBe(NOW + 9 * DAY_MS);
  });

  it('ignores a paid period that has already ended', () => {
    const lapsed: AccessRecord = { status: 'canceled', source: 'purchase', currentPeriodEnd: iso(-3) };
    expect(extensionStartsFrom(lapsed, NOW)).toBe(NOW);
    const pastDue: AccessRecord = { status: 'past_due', source: 'purchase', currentPeriodEnd: iso(20) };
    expect(extensionStartsFrom(pastDue, NOW)).toBe(NOW);
  });

  it('starts at the end of an extension already in place, so another 30 days means another', () => {
    const record: AccessRecord = { status: 'active', source: 'purchase', comp: comp('gold', 10) };
    expect(extensionEndsAt(record, NOW, 30)).toBe(iso(40));
  });

  it('takes the later of the paid period and the existing extension', () => {
    const record: AccessRecord = { status: 'active', source: 'purchase', currentPeriodEnd: iso(15), comp: comp('gold', 10) };
    expect(extensionStartsFrom(record, NOW)).toBe(NOW + 15 * DAY_MS);
  });

  it('does not count a permanent grant as a period — there is no end to add to', () => {
    const granted: AccessRecord = { status: 'active', source: 'admin', currentPeriodEnd: iso(15) };
    expect(extensionStartsFrom(granted, NOW)).toBe(NOW);
  });
});

describe('what the panel is allowed to ask for', () => {
  it('accepts whole days from 1 to the maximum', () => {
    expect(validExtensionDays(1)).toBe(1);
    expect(validExtensionDays(MAX_EXTENSION_DAYS)).toBe(MAX_EXTENSION_DAYS);
    expect(validExtensionDays(0)).toBeNull();
    expect(validExtensionDays(MAX_EXTENSION_DAYS + 1)).toBeNull();
    expect(validExtensionDays(2.5)).toBeNull();
    expect(validExtensionDays('30')).toBeNull();
  });

  it('accepts only real calendar dates', () => {
    expect(validCalendarDate('2026-10-12')).toBe('2026-10-12');
    expect(validCalendarDate('2026-02-30')).toBeNull();
    expect(validCalendarDate('10/12/2026')).toBeNull();
    expect(validCalendarDate(20261012)).toBeNull();
  });
});

describe('the tier a record confers with complimentary access on top', () => {
  it('adds a live comp to whatever billing gives, and never subtracts', () => {
    expect(tierWithComp('free', { status: 'active', source: 'purchase', comp: comp('gold', 5) }, NOW)).toBe('gold');
    expect(tierWithComp('diamond', { status: 'active', source: 'purchase', comp: comp('gold', 5) }, NOW)).toBe('diamond');
  });

  it('ignores a comp that has run out', () => {
    expect(tierWithComp('free', { status: 'active', source: 'purchase', comp: comp('gold', -1) }, NOW)).toBe('free');
    expect(compIsLive(comp('gold', -1), NOW)).toBe(false);
  });

  it('orders tiers the way the plans do', () => {
    expect(higherTier('silver', 'gold')).toBe('gold');
    expect(higherTier('diamond', 'free')).toBe('diamond');
  });
});

describe('effectiveTier on the server, end to end', () => {
  const base = { updatedAt: iso(0) };

  it('gives a lapsed subscriber their complimentary tier', () => {
    const e: Entitlement = { ...base, tier: 'gold', source: 'purchase', status: 'expired', comp: comp('silver', 7) };
    expect(effectiveTier(e, NOW)).toBe('silver');
    expect(accessSource(e, NOW)).toBe('comp');
    expect(complimentaryUntil(e, NOW)).toBe(iso(7));
  });

  it('keeps calling a paying customer a purchase while the comp is only standing by', () => {
    const e: Entitlement = { ...base, tier: 'gold', source: 'purchase', status: 'active', comp: comp('gold', 40) };
    expect(effectiveTier(e, NOW)).toBe('gold');
    expect(accessSource(e, NOW)).toBe('purchase');
  });

  it('gives a free account a trial, and says so', () => {
    const e: Entitlement = { ...base, tier: 'free', source: 'purchase', status: 'active', comp: comp('diamond', 14) };
    expect(effectiveTier(e, NOW)).toBe('diamond');
    expect(accessSource(e, NOW)).toBe('comp');
  });

  it('falls back to billing the moment the comp runs out', () => {
    const e: Entitlement = { ...base, tier: 'free', source: 'purchase', status: 'active', comp: comp('diamond', 14) };
    expect(effectiveTier(e, NOW + 15 * DAY_MS)).toBe('free');
    expect(accessSource(e, NOW + 15 * DAY_MS)).toBe('purchase');
    expect(complimentaryUntil(e, NOW + 15 * DAY_MS)).toBeNull();
  });

  it('reads a half-written comp as no comp at all', () => {
    expect(readComp({ tier: 'gold' })).toBeNull();
    expect(readComp({ tier: 'platinum', until: iso(3) })).toBeNull();
    expect(readComp({ tier: 'gold', until: 'soon' })).toBeNull();
    expect(readComp(null)).toBeNull();
    expect(readComp({ tier: 'gold', until: iso(3), grantedBy: 'a', grantedAt: iso(0), reason: 'bug' })).toEqual({
      tier: 'gold', until: iso(3), grantedBy: 'a', grantedAt: iso(0), reason: 'bug',
    });
  });
});
