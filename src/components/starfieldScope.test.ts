import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { globSync } from 'node:fs';

/*
 * Paths normalised to forward slashes before anything compares them.
 *
 * globSync returns native separators, so on Windows every path came back as src\pages\LandingPage.tsx
 * while the assertions below are written with forward slashes. Both tests in this file failed on
 * every Windows checkout — and worse than failing, the second one failed open: its skip-the-landing-
 * page guard never matched, so it asserted that LandingPage must not use drift, which is the exact
 * opposite of the rule. Two permanently red tests nobody could act on.
 */
const files = globSync('src/**/*.tsx', { cwd: process.cwd() }).map((f) => ({
  path: f.split(/[\\/]/).join('/'),
  source: readFileSync(join(process.cwd(), f), 'utf-8'),
}));

/** The one component allowed to drift: the backdrop every public page shares. */
const BACKDROP = 'src/components/landing/SiteBackdrop.tsx';

describe('starfield drift stays on the public site', () => {
  it('is switched on in exactly one place', () => {
    const withDrift = files
      .filter(({ source }) => /<Starfield[^>]*\bdrift\b/s.test(source))
      .map(({ path }) => path);

    expect(withDrift).toEqual([BACKDROP]);
  });

  it('never reaches the signed-in app', () => {
    // The backdrop is for marketing pages. The journal, the admin panel and every in-app component
    // stay still — see the next test for why.
    const app = files.filter(
      ({ path }) =>
        path === 'src/pages/JournalApp.tsx' ||
        path === 'src/pages/AdminPage.tsx' ||
        (path.startsWith('src/components/') && !path.startsWith('src/components/landing/')),
    );
    const offenders = app.filter(({ source }) => /<SiteBackdrop\b/.test(source)).map(({ path }) => path);
    expect(offenders).toEqual([]);
    expect(readFileSync(join(process.cwd(), 'src/pages/LandingPage.tsx'), 'utf-8')).toContain('<SiteBackdrop');
  });

  it('leaves every other surface still', () => {
    // The journal, the auth modals and the coach view all render a Starfield. Drift behind a
    // screen someone is reading numbers off pulls attention away from the numbers.
    const users = files.filter(({ source }) => /<Starfield\b/.test(source)).map(({ path }) => path);
    expect(users.length).toBeGreaterThan(1);

    for (const { path, source } of files) {
      if (path === BACKDROP) continue;
      expect(/<Starfield[^>]*\bdrift\b/s.test(source), path).toBe(false);
    }
  });

  it('defaults to off, so a new surface cannot pick it up by accident', () => {
    const component = readFileSync(join(process.cwd(), 'src/components/Starfield.tsx'), 'utf-8');
    expect(component).toContain('drift = false');
  });
});
