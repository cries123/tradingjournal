import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MobileBottomNav } from './MobileNav';

/*
 * The plus button sits inside the phone's bottom bar, not on top of it.
 *
 * Jay's requirement for the October 2026 redesign, after a mockup drew it riding up over the bar's
 * top edge: a button that overhangs the bar covers whatever the screen has at its bottom and puts
 * part of the target where a thumb misses on a phone with a home indicator. Asserted on the
 * rendered markup, because the ways to break it are all class names: a negative margin, a
 * translate, absolute positioning, or a circle taller than the bar.
 */

const noop = () => undefined;
const html = renderToString(
  createElement(MobileBottomNav, {
    appView: 'dashboard',
    onMore: noop,
    onAddTrade: noop,
    onDashboard: noop,
    onPerformance: noop,
    onAssistant: noop,
    assistantOpen: false,
  }),
);

/** Tailwind's spacing scale is 4px a step; arbitrary values are written h-[60px]. */
function px(token: string): number {
  const arbitrary = token.match(/\[(\d+)px\]/);
  if (arbitrary) return Number(arbitrary[1]);
  return Number(token.split('-').pop()) * 4;
}

describe('the plus button in the phone bar', () => {
  const bar = html.match(/<div class="([^"]*grid-cols-5[^"]*)"/)?.[1] ?? '';
  const button = html.match(/<button[^>]*aria-label="Log a trade"[^>]*>([\s\S]*?)<\/button>/);
  const buttonClass = button?.[0].match(/class="([^"]*)"/)?.[1] ?? '';
  const circleClass = button?.[1].match(/<span class="([^"]*)"/)?.[1] ?? '';

  it('is there, in the middle of five', () => {
    expect(button).not.toBeNull();
    expect(html.match(/<button/g)).toHaveLength(5);
  });

  it('is not lifted out of the bar', () => {
    for (const cls of [buttonClass, circleClass]) {
      expect(cls).not.toMatch(/(^|\s)-(m|mt|my|translate-y)-/);
      expect(cls).not.toMatch(/\b(absolute|fixed)\b/);
      expect(cls).not.toMatch(/\btranslate-y/);
    }
  });

  it('is shorter than the bar it sits in, with room either side', () => {
    const barHeight = px(bar.match(/\bh-(\[\d+px\]|\d+)/)?.[0] ?? '');
    const circle = px(circleClass.match(/\bh-(\[\d+px\]|\d+)/)?.[0] ?? '');
    expect(barHeight).toBeGreaterThan(0);
    expect(circle).toBeGreaterThan(0);
    // At least 4px clear above and below, so the circle never touches the bar's edge.
    expect(barHeight - circle).toBeGreaterThanOrEqual(8);
  });
});
