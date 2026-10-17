import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DashboardPreview } from './DashboardPreview';
import { AssistantDemo } from './AssistantDemo';
import { BrokerMarquee } from './BrokerMarquee';
import { BrokerGrid } from './BrokerGrid';
import { LandingFaq } from './LandingFaq';
import { LANDING_FAQ } from '../../seo/faq';
import { SUPPORTED_BROKERS } from '../../data/brokers';
import { resolveBroker } from '../../utils/brokerIds';
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

describe('the broker card', () => {
  const html = renderToString(createElement(BrokerGrid, { names: SUPPORTED_BROKERS.map((b) => b.name) }));

  /*
   * Every word a tile can show, in the tile's font — Figtree 600 at 14px — measured with
   * canvas.measureText in Chrome on 2026-10-17. A broker added with a word that is not here fails
   * the last test, which is the prompt to measure it before it can wrap mid-word on the live page.
   */
  const WORD_PX: Record<string, number> = {
    Management: 83.8, TradeStation: 82.2, thinkorswim: 78.5, Robinhood: 69.2, Interactive: 69.1,
    tastytrade: 66.5, Vanguard: 61.6, 'E*TRADE': 59.8, Coinbase: 59.5, Moomoo: 56.6, Schwab: 50.7,
    Edward: 48.4, Brokers: 48.1, Charles: 48, Fidelity: 47.3, Wealth: 44.8, Tradier: 44.4,
    Alpaca: 43.7, Webull: 43.6, Chase: 39.6, Public: 38.9, Jones: 37.8, TIAA: 31.5, PNC: 29.3,
    Citi: 22.6,
  };
  const widest = Math.max(...Object.values(WORD_PX));

  it('is what the landing page shows', () => {
    expect(readFileSync('src/pages/LandingPage.tsx', 'utf8')).toContain('<BrokerGrid');
  });

  it('wraps a name only between words', () => {
    // At 1600px this card printed "thinkors / wim" and "Vanguar / d": min-w-0 let the name shrink
    // below its longest word and break-words then split the word to fit.
    const labels = [...html.matchAll(/<span class="([^"]*)">([^<]+)<\/span>/g)];
    expect(labels.map(([, , name]) => name)).toContain('thinkorswim');
    expect(labels).toHaveLength(8);
    for (const [, classes] of labels) {
      const list = classes.split(' ');
      expect(list).toContain('break-normal');
      for (const splitter of ['min-w-0', 'break-words', 'break-all', 'wrap-anywhere', 'wrap-break-word']) {
        expect(list).not.toContain(splitter);
      }
    }
  });

  it('takes its columns and its tile layout from the card, not the screen', () => {
    // sm:grid-cols-4 was a screen width. From lg the card shares its row and is half as wide, so
    // four columns held on as the tiles shrank to 93px.
    expect(html).not.toMatch(/\b(sm|md|lg|xl|2xl):grid-cols-/);
    expect(html).toMatch(/<div class="@container"><div class="grid /);
    expect(html.match(/class="@container [^"]*px-3[^"]*"/g)).toHaveLength(8);
  });

  it('leaves room for the widest word at every column count and in both tile layouts', () => {
    // A tile's content box is its width less 24px of padding and 2px of border; tiles are 8px apart.
    expect(html).toMatch(/grid-cols-1 [^"]*\bgap-2\b/);
    const steps = [...html.matchAll(/@min-\[([\d.]+)rem\]:grid-cols-(\d+)/g)].map(([, rem, cols]) => ({
      container: Number(rem) * 16,
      cols: Number(cols),
    }));
    expect(steps.map((s) => s.cols)).toEqual([2, 4]);
    for (const { container, cols } of steps) {
      expect((container - (cols - 1) * 8) / cols - 26).toBeGreaterThanOrEqual(widest);
    }
    // Side by side only once the tile holds the 44px badge, the 10px gap and the word.
    const sideBySide = html.match(/@min-\[([\d.]+)rem\]:flex-row/);
    expect(sideBySide).not.toBeNull();
    expect(Number(sideBySide![1]) * 16 - 44 - 10).toBeGreaterThanOrEqual(widest);
  });

  it('has a measurement for every word a supported broker shows', () => {
    const words = SUPPORTED_BROKERS.flatMap((b) => (resolveBroker(b.name)?.name ?? b.name).split(' '));
    expect(words.filter((w) => !(w in WORD_PX))).toEqual([]);
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
