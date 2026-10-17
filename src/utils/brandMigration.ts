import { BRAND_VERSION, type UserSettings } from '../types/settings';

/**
 * Moves everyone onto the rebrand's accent, once.
 *
 * Before October 2026 the default accent was emerald and it was stored as such, so "never chose
 * one" and "chose emerald" are the same value in every saved settings document. Jay's call was
 * that every member sees lime on deploy, so the first load after it sets lime for everybody —
 * including the few who had picked cyan or violet — and stamps the settings with the brand
 * version so it never runs again. Picking an accent in Settings afterwards sticks, because the
 * stamp is saved with it.
 *
 * Pure, and applied wherever settings come in (local cache and the cloud document), so the result
 * is the same whichever one answers first.
 */
export function applyBrandMigration(settings: UserSettings): UserSettings {
  if ((settings.brandVersion ?? 0) >= BRAND_VERSION) return settings;
  return { ...settings, themeAccent: 'lime', brandVersion: BRAND_VERSION };
}
