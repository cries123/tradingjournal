import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DashboardPreview } from './DashboardPreview';
import { AssistantDemo } from './AssistantDemo';
import { BrokerMarquee } from './BrokerMarquee';
import { LandingFaq } from './LandingFaq';
import { LANDING_FAQ } from '../../seo/faq';
import { demoInsights, demoJournal } from './landingDemo';

/*
 * First paint of the landing page's moving parts. Effects do not run under renderToString, so this
 * is exactly what the prerendered snapshot and a visitor without JavaScript get — which has to be a
 * sensible page on its own, not the first frame of an animation.
 */

const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('the hero preview', () => {
  it('starts from a filled month with the sync still to come, never from an empty calendar', () => {
    const html = renderToString(createElement(DashboardPreview));
    const words = text(html);
    expect(words).toContain('Live preview');
    expect(words).toContain('sample journal');
    // Most of the month is there on first paint …
    expect((html.match(/text-profit-bright|text-loss-bright/g) ?? []).length).toBeGreaterThan(15);
    // … and nothing has popped in yet.
    expect(html).not.toContain('animate-cell-pop');
  });

  it('shows two weeks in the phone version', () => {
    const html = renderToString(createElement(DashboardPreview, { variant: 'compact' }));
    // 7 weekday labels + 14 cells.
    expect((html.match(/h-9 rounded-md/g) ?? []).length).toBe(14);
  });

  it('says it is a sample everywhere it shows figures', () => {
    const preview = text(renderToString(createElement(DashboardPreview)));
    const answer = text(renderToString(createElement(AssistantDemo)));
    expect(preview).toContain('sample journal');
    expect(answer).toContain('sample journal');
  });
});

describe('the assistant example', () => {
  it('gives screen readers the whole answer at once, with the sample figures in it', () => {
    const html = renderToString(createElement(AssistantDemo));
    const d = demoInsights(demoJournal());
    expect(html).toContain('sr-only');
    expect(text(html)).toContain(`${d.heavyDays} days`);
    expect(text(html)).toContain(d.firstFourPnl.toLocaleString('en-US', { minimumFractionDigits: 2 }));
  });
});

describe('the broker strip', () => {
  it('announces the list once though it draws it twice', () => {
    const html = renderToString(createElement(BrokerMarquee, { names: ['Charles Schwab', 'Robinhood'] }));
    expect((html.match(/aria-label="Supported brokers"/g) ?? []).length).toBe(1);
    expect((html.match(/aria-hidden="true"/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(html).toContain('motion-reduce:animate-none');
  });

  it('renders nothing with no brokers', () => {
    expect(renderToString(createElement(BrokerMarquee, { names: [] }))).toBe('');
  });
});

describe('the FAQ', () => {
  const html = renderToString(createElement(LandingFaq));
  const words = text(html).replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');

  it('shows every question and answer once, in the order the FAQPage markup lists them', () => {
    // Split into two columns on a wide screen — a slice that drops or repeats one would put a
    // question in Google's results that the page does not show.
    let from = 0;
    for (const { question, answer } of LANDING_FAQ) {
      expect(words.split(question).length - 1).toBe(1);
      expect(words.split(answer).length - 1).toBe(1);
      const at = words.indexOf(question);
      expect(at).toBeGreaterThan(from);
      from = at;
    }
  });

  it('numbers them in reading order, down the first column and then the second', () => {
    const numbers = [...html.matchAll(/<summary[^>]*><span[^>]*>(\d+)<\/span>/g)].map((m) => m[1]);
    expect(numbers).toEqual(LANDING_FAQ.map((_, i) => String(i + 1).padStart(2, '0')));
  });

  it('opens the first answer and only that one', () => {
    const details = html.match(/<details[^>]*>/g) ?? [];
    expect(details).toHaveLength(LANDING_FAQ.length);
    expect(details.map((d) => /\sopen=""/.test(d))).toEqual(LANDING_FAQ.map((_, i) => i === 0));
  });
});

describe('reduced motion', () => {
  const css = readFileSync('src/index.css', 'utf8');

  it('stops every new CSS animation', () => {
    const block = css.slice(css.indexOf('.site-aurora::before,\n  .site-aurora::after,\n  .animate-cell-pop'));
    for (const name of ['.site-aurora::before', '.animate-cell-pop', '.animate-marquee', '.btn-shine::after']) {
      expect(block).toContain(name);
    }
    expect(css).toMatch(/\.hero-trend-line path \{\s*animation: none;\s*stroke-dashoffset: 0;/);
  });

  it('is asked by the animations driven from script', () => {
    for (const file of ['DashboardPreview.tsx', 'AssistantDemo.tsx']) {
      expect(readFileSync(`src/components/landing/${file}`, 'utf8')).toContain('usePrefersReducedMotion');
    }
    expect(readFileSync('src/hooks/useCountUp.ts', 'utf8')).toContain('usePrefersReducedMotion');
  });
});
