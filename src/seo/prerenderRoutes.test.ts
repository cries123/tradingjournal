import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PRERENDER_ROUTES } from './pageMeta';

/*
 * The prerendered route list exists twice.
 *
 * PRERENDER_ROUTES in pageMeta.ts is exported and imported by nothing; the list that actually runs
 * is a plain array inside scripts/prerender.mjs, because the script is .mjs and cannot import a
 * TypeScript module without a build step. So the documented list and the real one are free to
 * drift, and adding a page to the wrong one fails in the quietest possible way: the route works,
 * the page looks fine, and Google is handed an empty SPA shell forever.
 *
 * That is exactly what happened adding /verified-track-record. This test is the cheap fix —
 * keeping both lists honest without restructuring the build.
 */

function scriptRoutes(): string[] {
  const source = readFileSync(new URL('../../scripts/prerender.mjs', import.meta.url), 'utf8');
  const block = source.match(/const ROUTES = \[([\s\S]*?)\n\];/);
  if (!block) throw new Error('ROUTES array not found in scripts/prerender.mjs');

  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe('prerendered routes', () => {
  it('finds the list the build actually uses', () => {
    // If this breaks, the parser above stopped matching and every assertion below is vacuous.
    expect(scriptRoutes().length).toBeGreaterThan(10);
  });

  it('prerenders every route pageMeta says it does', () => {
    const missing = PRERENDER_ROUTES.filter((r) => !scriptRoutes().includes(r));
    expect(missing, `in PRERENDER_ROUTES but not in scripts/prerender.mjs: ${missing.join(', ')}`).toEqual([]);
  });

  it('does not prerender routes pageMeta does not list', () => {
    // The other direction matters too: a route the script renders but pageMeta forgot is a page
    // shipping with whatever <title> the shell happens to carry.
    const extra = scriptRoutes().filter((r) => !(PRERENDER_ROUTES as readonly string[]).includes(r));
    expect(extra, `in scripts/prerender.mjs but not in PRERENDER_ROUTES: ${extra.join(', ')}`).toEqual([]);
  });
});
