import { describe, expect, it } from 'vitest';
import { applyBrandMigration } from './brandMigration';
import { BRAND_VERSION, DEFAULT_SETTINGS, type UserSettings } from '../types/settings';

const stored = (over: Partial<UserSettings>): UserSettings => ({ ...DEFAULT_SETTINGS, ...over });

describe('applyBrandMigration', () => {
  it('moves a pre-rebrand member from the old default onto lime, and stamps the version', () => {
    const before = stored({ themeAccent: 'emerald', brandVersion: undefined });
    const after = applyBrandMigration(before);
    expect(after.themeAccent).toBe('lime');
    expect(after.brandVersion).toBe(BRAND_VERSION);
  });

  it('moves a member who had picked another accent too — everyone sees lime on deploy', () => {
    expect(applyBrandMigration(stored({ themeAccent: 'violet', brandVersion: undefined })).themeAccent).toBe('lime');
    expect(applyBrandMigration(stored({ themeAccent: 'cyan', brandVersion: undefined })).themeAccent).toBe('lime');
  });

  it('runs once: a choice made after the rebrand is kept', () => {
    const chosen = stored({ themeAccent: 'emerald', brandVersion: BRAND_VERSION });
    expect(applyBrandMigration(chosen)).toBe(chosen);
  });

  it('leaves everything else alone', () => {
    const before = stored({ themeAccent: 'emerald', brandVersion: undefined, defaultSymbol: 'SPX', currency: 'EUR' });
    const after = applyBrandMigration(before);
    expect(after.defaultSymbol).toBe('SPX');
    expect(after.currency).toBe('EUR');
  });

  it('is already satisfied by the defaults, so a new member is not re-stamped on every load', () => {
    expect(applyBrandMigration(DEFAULT_SETTINGS)).toBe(DEFAULT_SETTINGS);
  });
});
