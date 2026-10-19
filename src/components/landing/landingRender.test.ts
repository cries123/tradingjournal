import { existsSync, readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HeroStage } from './HeroStage';
import { DayStory } from './DayStory';
import { PricingLadder } from './PricingLadder';
import { FeatureBento } from './FeatureBento';
import { PhoneFan } from './PhoneFan';
import { BrokerMarquee } from './BrokerMarquee';
import { LandingFaq } from './LandingFaq';
import { chapterProgress, currentChapter } from './chapters';
import { numberWord, ordinal, signedMoney, STORY_CAP, STORY_DAY, storyDay, storyMonth } from './landingStory';
import { LANDING_FAQ } from '../../seo/faq';
import { ANNUAL_MONTHS_CHARGED, featureLines, MARKET_REPLAY_LIVE, PAID_TIERS, TIER_ORDER, TIER_PLANS } from '../../config/tiers';
import { hasTrial, TRIAL_DAYS } from '../../config/trial';

/*
 * First paint of the landing page's moving parts. Effects do not run under renderToString, so this
 * is exactly what a visitor without JavaScript gets — which has to be a sensible page on its own, not
 * the first frame of an animation.
 */

const text = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
const noop = () => undefined;
const june = storyMonth();
const day = storyDay();

describe('the hero', () => {
  const html = renderToString(createElement(HeroStage));
  const words = text(html);

  it('shows the sample month and what the cap would have made of it, and says it is a sample', () => {
    expect(words).toContain('Sample journal · June 2026');
    expect(words).toContain(signedMoney(june.net));
    expect(words).toContain(signedMoney(june.cappedNet));
    expect(words).toContain(`Stopped at ${STORY_CAP} a day`);
  });

  it('puts a dot on every day past the cap, and taps exactly the day the phone opens', () => {
    expect(html.match(/class="hero-dot /g)).toHaveLength(june.capDays);
    expect(html.match(/hero-tap/g)).toHaveLength(1);
    expect(STORY_DAY).toBe(day.date);
  });

  it('opens the phone on that day, with the rule it broke said the way the app says it', () => {
    expect(words).toContain(`Max ${STORY_CAP} trades a day. Took ${day.trades.length}. Past it from the ${ordinal(STORY_CAP + 1)} trade.`);
    expect(words).toContain(signedMoney(day.total));
    expect(words).toContain(signedMoney(day.atCap));
  });

  it('is a picture with words for a screen reader, not a pile of numbers', () => {
    expect(html).toMatch(/role="img" aria-label="The Overview of a sample journal for June 2026/);
  });

  it('is a real phone: island, status icons and the home bar', () => {
    expect(html).toContain('iphone-island');
    expect(html).toContain('iphone-battery');
    expect(html).toContain('iphone-screen');
  });
});

describe('the day played back', () => {
  const html = renderToString(createElement(DayStory));
  const words = text(html);

  it('starts as the finished day: every trade drawn, the verdict shown, every paragraph readable', () => {
    expect(html.match(/story-seg is-shown/g)).toHaveLength(day.trades.length);
    expect(html.match(/story-pt is-shown/g)).toHaveLength(day.trades.length);
    expect(html.match(/story-beat [^"]*is-on/g)).toHaveLength(4);
    expect(words).toContain(`If you had stopped at ${numberWord(STORY_CAP)} ${signedMoney(day.atCap)}`);
  });

  it('says in words what the chart shows, from the same trades', () => {
    expect(words).toContain(`After the ${ordinal(STORY_CAP)} trade the day stands at ${signedMoney(day.atCap)}`);
    expect(words).toContain(`The day ends at ${signedMoney(day.total)}`);
    expect(words).toContain(`Stopping at ${numberWord(STORY_CAP)} kept ${signedMoney(day.atCap)}`);
    expect(words).toContain('Three more, and the day is gone');
    expect(words).toContain('None of them wins back what the last two lost');
    expect(words).toContain(`June ended at ${signedMoney(june.net)}`);
    expect(words).toContain(`would have made ${signedMoney(june.cappedNet)}`);
  });

  it('asks before it moves', () => {
    expect(readFileSync('src/components/landing/DayStory.tsx', 'utf8')).toContain('usePrefersReducedMotion');
  });
});

describe('the prices', () => {
  const html = renderToString(createElement(PricingLadder, { onStart: noop, onPricing: noop }));
  const words = text(html);

  it('lists every plan at its real price, with the lines the pricing page prints', () => {
    for (const tier of TIER_ORDER) {
      expect(words).toContain(`${TIER_PLANS[tier].name} `);
      expect(words).toContain(`$${TIER_PLANS[tier].price}`);
      for (const line of featureLines(tier)) expect(words).toContain(line.text);
    }
  });

  it('badges exactly the plans that have a trial, with the trial’s real length', () => {
    // The badge on each card, not the sentence above them that also says it.
    const badges = html.match(new RegExp(`<span class="absolute -top-3[^"]*">${TRIAL_DAYS}(<!-- -->)?-day free trial</span>`, 'g')) ?? [];
    expect(badges).toHaveLength(TIER_ORDER.filter(hasTrial).length);
    expect(hasTrial('free')).toBe(false);
  });

  it('says the trial is one per person, and that yearly is two months free, from the plans', () => {
    expect(words).toContain(`Every paid plan starts with a ${TRIAL_DAYS}-day free trial, one per person`);
    expect(words).toContain(`Yearly saves ${12 - ANNUAL_MONTHS_CHARGED} months`);
    // Skipping the trial is not promised before the server says every plan can be bought without it.
    expect(words).not.toContain('skip it');
  });

  it('does not sell market replay before it works', () => {
    if (!MARKET_REPLAY_LIVE) expect(words).not.toContain('Market replay');
  });
});

describe('the trial, as the page advertises it', () => {
  const page = readFileSync('src/pages/LandingPage.tsx', 'utf8');

  it('reads which plans have one from the config, never from a plan typed into a sentence', () => {
    expect(page).toContain('PAID_TIERS.every(hasTrial)');
    expect(page).not.toMatch(/(Silver|Gold|Diamond)[^\n]*free trial/);
  });

  it('is on every paid plan, as Jay set them up', () => {
    expect(PAID_TIERS.every(hasTrial)).toBe(true);
  });
});

describe('the screens', () => {
  const html = renderToString(createElement(FeatureBento));

  it('loads every screenshot lazily and at a known size, so nothing jumps as it arrives', () => {
    const imgs = html.match(/<img [^>]*>/g) ?? [];
    expect(imgs.length).toBeGreaterThanOrEqual(6);
    for (const img of imgs) {
      expect(img).toContain('loading="lazy"');
      expect(img).toMatch(/width="\d+"/);
      expect(img).toMatch(/height="\d+"/);
      expect(img).toMatch(/alt="[^"]+"/);
    }
  });

  it('ships every image it names', () => {
    const files = [...html.matchAll(/(?:src|srcSet)="\/landing\/([^"]+)"/g)].map((m) => m[1]);
    const fan = [...renderToString(createElement(PhoneFan)).matchAll(/src="\/landing\/([^"]+)"/g)].map((m) => m[1]);
    for (const f of new Set([...files, ...fan])) expect(existsSync(`public/landing/${f}`), f).toBe(true);
  });

  it('gives a phone the phone’s own screenshot', () => {
    expect(html.match(/<source media="\(max-width: 1023px\)"/g)?.length).toBeGreaterThanOrEqual(4);
  });
});

describe('the phones', () => {
  it('shows three real screens in three phones', () => {
    const html = renderToString(createElement(PhoneFan));
    expect(html.match(/class="iphone /g)).toHaveLength(3);
    expect(html.match(/iphone-island/g)).toHaveLength(3);
  });
});

describe('the chapter bar', () => {
  it('fills from a quarter screen before the first chapter to the end of the last', () => {
    // Chapters from 1,000px to 5,000px down a 1,000px-tall screen.
    expect(chapterProgress(0, 1000, 1000, 5000)).toBe(0);
    expect(chapterProgress(750, 1000, 1000, 5000)).toBe(0);
    expect(chapterProgress(4000, 1000, 1000, 5000)).toBe(1);
    expect(chapterProgress(2375, 1000, 1000, 5000)).toBeCloseTo(0.5, 5);
  });

  it('names the last chapter whose top has passed the upper part of the screen', () => {
    expect(currentChapter([600, 2000, 4000], 1000)).toBe(0);
    expect(currentChapter([-900, 300, 2000], 1000)).toBe(1);
    expect(currentChapter([-5000, -3000, 100], 1000)).toBe(2);
  });
});

describe('the sticky parts', () => {
  it('are not trapped by a scroll container around the page', () => {
    // overflow-x: hidden on the page's root made it the scroll container every sticky element sticks
    // to, so the header, the chapter bar and the story's chart all scrolled away. Clip does not.
    const page = readFileSync('src/pages/LandingPage.tsx', 'utf8');
    expect(page).toContain('overflow-x-clip');
    expect(page).not.toMatch(/className="[^"]*overflow-(x-)?(hidden|auto|scroll)[^"]*flex flex-col"/);
  });
});

describe('the page keeps the anchors other pages link to', () => {
  const page = readFileSync('src/pages/LandingPage.tsx', 'utf8');
  it.each(['features', 'faq', 'security'])('#%s', (id) => {
    expect(page).toContain(`id="${id}"`);
  });
});

describe('the broker strip', () => {
  it('announces the list once though it draws it twice', () => {
    const html = renderToString(createElement(BrokerMarquee, { names: ['Charles Schwab', 'Robinhood'] }));
    expect((html.match(/aria-label="Supported brokers"/g) ?? []).length).toBe(1);
    expect((html.match(/aria-hidden="true"/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(html).toContain('motion-reduce:animate-none');
  });

  it('splits a long list into two rows that run opposite ways', () => {
    const names = ['Charles Schwab', 'Robinhood', 'Fidelity', 'Webull', 'E*TRADE', 'Vanguard', 'tastytrade', 'Public'];
    const html = renderToString(createElement(BrokerMarquee, { names }));
    expect(html).toMatch(/animate-marquee(?!-)/);
    expect(html).toContain('animate-marquee-reverse');
  });

  it('never wraps a broker name inside its tile', () => {
    const html = renderToString(createElement(BrokerMarquee, { names: ['Interactive Brokers'] }));
    expect(html).toContain('whitespace-nowrap');
  });

  it('renders nothing with no brokers', () => {
    expect(renderToString(createElement(BrokerMarquee, { names: [] }))).toBe('');
  });
});

describe('the FAQ', () => {
  const html = renderToString(createElement(LandingFaq));
  const words = text(html).replace(/&quot;/g, '"');

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

  it('stops every CSS animation the landing page runs', () => {
    const block = css.slice(css.indexOf('.site-aurora::before,\n  .site-aurora::after,\n  .animate-cell-pop'));
    for (const name of ['.site-aurora::before', '.animate-cell-pop', '.animate-marquee', '.animate-marquee-reverse', '.btn-shine::after']) {
      expect(block).toContain(name);
    }
    expect(css).toMatch(/\.hero-trend-line path \{\s*animation: none;\s*stroke-dashoffset: 0;/);

    const shots = css.slice(css.indexOf("The landing page's product shots"));
    const reduced = shots.slice(shots.indexOf('@media (prefers-reduced-motion: reduce)'));
    for (const name of ['.hero-day', '.hero-dot', '.hero-tap', '.hero-phone', '.phone-float-a', '.phone-float-b', '.phone-float-c', '.story-seg', '.story-pt', '.bento-card']) {
      expect(reduced, name).toContain(name);
    }
    expect(reduced).toMatch(/\.draw-line path \{\s*animation: none;\s*stroke-dashoffset: 0;/);
  });

  it('is asked by the animations driven from script', () => {
    expect(readFileSync('src/components/landing/DayStory.tsx', 'utf8')).toContain('usePrefersReducedMotion');
    expect(readFileSync('src/hooks/useCountUp.ts', 'utf8')).toContain('usePrefersReducedMotion');
  });
});
