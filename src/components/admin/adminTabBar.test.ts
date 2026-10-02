import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AdminTabBar } from './AdminTabBar';
import { ADMIN_TABS } from './adminTabs';

/*
 * Seven destinations, all of them visible on a phone.
 *
 * This was one row that scrolled sideways. Four of the seven sat past the right edge of a 390px
 * screen, reachable only by a horizontal swipe nothing on screen suggested — and scrolling the
 * active tab into view papered over the symptom, because you still could not SEE where else you
 * could go, which is the entire job of a nav.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf-8');

const html = (tab = 'overview') =>
  renderToString(
    createElement(AdminTabBar, {
      tab,
      onChange: () => undefined,
      openCount: 2,
      userCount: 42,
      ticketsWaiting: 1,
      openErrors: 3,
    } as never),
  ).replaceAll('<!-- -->', '');

describe('the admin nav', () => {
  it('renders every section, so none of them has to be found by swiping', () => {
    const markup = html();
    for (const t of ADMIN_TABS) expect(markup, t.id).toContain(t.label);
  });

  it('is a grid on a phone and the underlined row from md up', () => {
    const markup = html();
    expect(markup).toContain('grid-cols-4');
    // The row, and its sideways scroll, survive only behind the breakpoint where seven tabs fit.
    expect(markup).toContain('md:flex');
    expect(markup).toContain('md:overflow-x-auto');
    // Preceded by a quote or a space, i.e. unprefixed — \b would match inside md:overflow-x-auto.
    expect(markup).not.toMatch(/[" ]overflow-x-auto/);
  });

  it('keeps the counts out of the flow on a phone', () => {
    /*
     * Four columns of 390px is about 88px a cell, and "Requests" with a count beside it is wider
     * than that — it was the one tab that spilled out of its own pill. Absolute positioning costs
     * no width, which is what keeps all seven on two rows rather than three.
     */
    expect(html()).toContain('absolute -right-1 -top-1');
    expect(html()).toContain('md:static');
  });

  it('marks the active tab with a fill on the grid, not a stray underline', () => {
    // An underline under one cell of a two-row grid reads as a rule somebody forgot to delete.
    const markup = html('costs');
    expect(markup).toContain('bg-emerald-500/10');
    expect(markup).toMatch(/aria-current="page"/);
    expect(markup).toContain('md:block');
  });

  it('gives every tab a thumb-sized target', () => {
    // 44px is the floor; the old row was 40px of padding-driven height with no minimum at all.
    expect(html()).toContain('min-h-[44px]');
  });

  it('is gone from the page that used to hold it', () => {
    // Left behind, the page's copy would go on rendering and this one would never be seen.
    const page = read('src/pages/AdminPage.tsx');
    expect(page).toContain("from '../components/admin/AdminTabBar'");
    expect(page).not.toContain('function AdminTabBar(');
  });
});
