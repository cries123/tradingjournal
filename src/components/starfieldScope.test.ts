import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { globSync } from 'node:fs';

const files = globSync('src/**/*.tsx', { cwd: process.cwd() })
  .map((f) => ({ path: f, source: readFileSync(join(process.cwd(), f), 'utf-8') }));

describe('starfield drift stays on the landing page', () => {
  it('is switched on in exactly one place', () => {
    const withDrift = files
      .filter(({ source }) => /<Starfield[^>]*\bdrift\b/s.test(source))
      .map(({ path }) => path);

    expect(withDrift).toEqual(['src/pages/LandingPage.tsx']);
  });

  it('leaves every other surface still', () => {
    // The journal, the auth modals and the coach view all render a Starfield. Drift behind a
    // screen someone is reading numbers off pulls attention away from the numbers.
    const users = files.filter(({ source }) => /<Starfield\b/.test(source)).map(({ path }) => path);
    expect(users.length).toBeGreaterThan(1);

    for (const { path, source } of files) {
      if (path === 'src/pages/LandingPage.tsx') continue;
      expect(/<Starfield[^>]*\bdrift\b/s.test(source), path).toBe(false);
    }
  });

  it('defaults to off, so a new surface cannot pick it up by accident', () => {
    const component = readFileSync(join(process.cwd(), 'src/components/Starfield.tsx'), 'utf-8');
    expect(component).toContain('drift = false');
  });
});
