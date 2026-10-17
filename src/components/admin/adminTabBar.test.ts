import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AdminTabBar } from './AdminTabBar';
import { ADMIN_TABS } from './adminTabs';

/*
 * Seven destinations, all of them visible on a phone, and down a rail on a desk.
 *
 * The phone nav was once one row that scrolled sideways. Four of the seven sat past the right edge
 * of a 390px screen, reachable only by a horizontal swipe nothing on screen suggested — and
 * scrolling the active tab into view papered over the symptom, because you still could not SEE
 * where else you could go, which is the entire job of a nav.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf-8');

const html = (tab = 'overview', variant: 'grid' | 'rail' = 'grid') =>
  renderToString(
    createElement(AdminTabBar, {
      tab,
      onChange: () => undefined,
      openCount: 2,
      userCount: 42,
      ticketsWaiting: 1,
      openErrors: 3,
      variant,
    } as never),
  ).replaceAll('<!-- -->', '');

describe('the admin nav', () => {
  it('renders every section in both layouts, so none has to be found by swiping', () => {
    for (const variant of ['grid', 'rail'] as const) {
      const markup = html('overview', variant);
      for (const t of ADMIN_TABS) expect(markup, `${variant} ${t.id}`).toContain(t.label);
    }
  });

  it('is a four-column grid on a phone, with nothing scrolling sideways', () => {
    const markup = html();
    expect(markup).toContain('grid-cols-4');
    expect(markup).not.toMatch(/overflow-x-auto/);
  });

  it('keeps the counts out of the flow on a phone', () => {
    /*
     * Four columns of 390px is about 88px a cell, and a label with a count beside it was the one
     * tab that spilled out of its own pill. Absolute positioning costs no width, which is what
     * keeps all seven on two rows rather than three.
     */
    expect(html()).toContain('absolute -right-1 -top-1');
  });

  it('marks the active tab with the accent fill, in both layouts', () => {
    for (const variant of ['grid', 'rail'] as const) {
      const markup = html('costs', variant);
      expect(markup, variant).toContain('bg-accent/10');
      expect(markup, variant).toMatch(/aria-current="page"/);
    }
  });

  it('shows the counts that need acting on, and the user total', () => {
    const markup = html('overview', 'rail');
    expect(markup).toContain('>2<'); // open bug reports
    expect(markup).toContain('>1<'); // tickets waiting
    expect(markup).toContain('>3<'); // open errors
    expect(markup).toContain('>42<'); // users
  });

  it('gives every phone tab a thumb-sized target', () => {
    // 44px is the floor; the old row was 40px of padding-driven height with no minimum at all.
    expect(html()).toContain('min-h-[44px]');
  });

  it('is gone from the page that used to hold it', () => {
    // Left behind, the page's copy would go on rendering and this one would never be seen.
    const page = read('src/pages/AdminPage.tsx');
    expect(page).toContain("from '../components/admin/AdminTabBar'");
    expect(page).not.toContain('function AdminTabBar(');
  });

  it('is rendered as a rail for the desk and a grid for the phone', () => {
    const page = read('src/pages/AdminPage.tsx');
    expect(page).toContain('variant="rail"');
    expect(page).toContain('variant="grid"');
  });
});
