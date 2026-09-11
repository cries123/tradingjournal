import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * The account dropdown has to paint above the dashboard, and nothing about that is automatic.
 *
 * It shipped broken once and looked like this: the open menu appeared as a ghost behind the Net
 * P&L card and the calendar, readable but see-through, because two things line up badly.
 *
 * The header that hosts the menu carries `backdrop-blur`, and backdrop-filter creates a STACKING
 * CONTEXT — which traps the panel's own `z-50` inside the header instead of letting it compete
 * with the page. And `.hero-card`, the Net P&L card, is `position: relative`, so it sits in the
 * positioned-elements layer with z-index auto. A positioned card at auto beats a header at auto
 * by DOM order, and <main> comes after the header.
 *
 * So the header itself is what must out-rank main. The panel cannot do it from the inside. These
 * assertions are on the source rather than a render because the failure is in the cascade, not in
 * the markup: every element is present and correct in the DOM either way.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf-8');

describe('account dropdown stacking', () => {
  it('gives the mobile header a stacking context above the dashboard', () => {
    const source = read('src/components/MobileNav.tsx');
    const header = source.slice(source.indexOf('<header'), source.indexOf('</header>'));

    expect(header).toContain('relative');
    expect(header).toMatch(/\bz-40\b/);
  });

  it('gives the desktop top bar one too', () => {
    const source = read('src/pages/JournalApp.tsx');
    expect(source).toMatch(/sticky top-0 z-40[^"]*"[^>]*>\{accountMenu\}/);
  });

  it('still relies on the header, because the panel is inside a backdrop-filter', () => {
    // If the blur ever comes off the header, the panel's own z-50 would be enough and this whole
    // arrangement could be simplified — but while it is there, the z-index above is load-bearing
    // and deleting it silently reintroduces the ghost.
    const header = read('src/components/MobileNav.tsx');
    expect(header).toMatch(/backdrop-blur/);
  });

  it('keeps the hero card positioned, which is the other half of the collision', () => {
    // Named so that somebody reading .hero-card knows its `position: relative` is load-bearing
    // for something outside its own file.
    const css = read('src/index.css');
    const hero = css.slice(css.indexOf('.hero-card {'), css.indexOf('.hero-card::before'));
    expect(hero).toContain('position: relative');
  });
});
