import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Two card treatments, and which side of the app each belongs to.
 *
 * .glass-card is the marketing one: it blurs what is behind it and lifts 2px on hover. .panel-card is
 * the in-app one: a flat gradient with an inset highlight and a border that warms on hover.
 *
 * The admin panel was built entirely on the marketing card — forty uses of .glass-card and none of
 * .panel-card — so it read as a different product from the app it belongs to, every static data panel
 * invited a click it did not accept, and forty elements carried a backdrop-filter.
 *
 * That last one is not cosmetic. backdrop-filter makes an element the containing block for any
 * `position: fixed` descendant, which is exactly what put a confirmation dialog above the visible
 * area on a phone and made the impersonation banner fill the screen. Both bugs were in this panel.
 */

const APP_DIRS = ['src/components/admin', 'src/components/account', 'src/components/analytics'];
const APP_FILES = ['src/pages/AdminPage.tsx', 'src/pages/JournalApp.tsx', 'src/components/SettingsPage.tsx'];

function filesUnder(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) filesUnder(path, found);
    else if (/\.tsx$/.test(path)) found.push(path);
  }
  return found;
}

const appSurfaces = (): string[] => [
  ...APP_DIRS.flatMap((d) => filesUnder(d)),
  ...APP_FILES,
];

describe('the card treatments', () => {
  it('keep the blur and the hover lift on the marketing one', () => {
    // The guard on the guard: if glass-card ever stops blurring, the rule below stops mattering and
    // ConfirmDialog's portal stops being load-bearing — both comments say so and should be revisited.
    const css = readFileSync('src/index.css', 'utf8');
    const block = css.slice(css.indexOf('.glass-card {'), css.indexOf('.glass-card:hover'));

    expect(block).toContain('backdrop-filter: blur(12px)');
  });

  it('keeps the in-app one overridable by a utility class', () => {
    /*
     * .panel-card sets the `border` shorthand and a box-shadow. Unlayered, both beat any utility on
     * the same element — so border-red-500/25, hover:border-accent/40 and ring-1 ring-amber-500/40
     * all rendered as the default grey. Six cards outside admin were already written that way; the
     * stale support ticket, which is the whole "answer this one first" signal, is the seventh.
     *
     * The test is the layer rather than the specific call sites, because the call sites are the
     * thing that keeps getting added.
     */
    const css = readFileSync('src/index.css', 'utf8');
    const layerStart = css.lastIndexOf('@layer components {', css.indexOf('.panel-card {'));

    expect(layerStart).toBeGreaterThan(-1);
    // And the layer has to still be open at that point — a closed one above would also match. One
    // more `{` than `}` between the two is exactly "the layer opened and nothing has closed it".
    const between = css.slice(layerStart, css.indexOf('.panel-card {'));
    const braces = (ch: string) => between.split(ch).length - 1;
    expect(braces('{')).toBe(braces('}') + 1);
  });

  it('keeps the in-app one free of backdrop-filter', () => {
    const css = readFileSync('src/index.css', 'utf8');
    const block = css.slice(css.indexOf('.panel-card {'), css.indexOf('.panel-card:hover'));

    expect(block).not.toContain('backdrop-filter');
  });

  it('is not used by any signed-in surface', () => {
    /*
     * The admin panel is the one that was wrong, but the rule is for all of them: a card inside the
     * app is a panel-card. Marketing pages (LandingPage, HelpCenterPage, AiAssistantPage and the
     * landing components) are deliberately not in this list and keep the glass treatment.
     */
    const offenders = appSurfaces().filter((file) =>
      readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
        .includes('glass-card'),
    );

    expect(offenders.map((f) => f.split(/[\\/]/).join('/'))).toEqual([]);
  });

  it('finds the surfaces it is checking', () => {
    // Without this, a bad path or a renamed folder makes the rule above pass by inspecting nothing.
    const surfaces = appSurfaces();
    expect(surfaces.length).toBeGreaterThan(20);
    expect(surfaces.some((f) => f.includes('AdminPage'))).toBe(true);
  });

  it('has the admin panel actually using the app card', () => {
    // The positive half: swapping the class out for nothing at all would satisfy the rule above.
    const admin = readFileSync('src/pages/AdminPage.tsx', 'utf8');
    expect(admin).toContain('panel-card');
  });
});
