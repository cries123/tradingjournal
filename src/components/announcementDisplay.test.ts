import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { normalizeAnnouncement, type Announcement } from '../services/announcement';
import { SiteAnnouncement } from './SiteAnnouncement';
import { AnnouncementBar } from './landing/AnnouncementBar';
import { ProofStrip } from './landing/ProofStrip';
import { SUPPORTED_BROKER_COUNT } from '../data/brokerCopy';
import { lowestPaidPrice } from '../seo/pricingClaims';

const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const announcement = (over: Partial<Announcement> = {}): Announcement => ({
  enabled: true,
  title: 'Annual plans are here',
  body: 'Two months free when you pay for the year.',
  bodyShort: '',
  tone: 'success',
  display: 'banner',
  cta: 'pricing',
  ctaLabel: 'See the plans',
  ctaUrl: '',
  revision: 3,
  updatedAt: '',
  ...over,
});

describe('how an announcement is shown', () => {
  it('reads a document saved before pop-ups existed as a banner', () => {
    // Every announcement published so far has no `display` field. It must keep showing as the
    // banner it was written as, not turn into a pop-up on deploy.
    expect(normalizeAnnouncement({ title: 'Old' }).display).toBe('banner');
    expect(normalizeAnnouncement({ title: 'x', display: 'sideways' as never }).display).toBe('banner');
    expect(normalizeAnnouncement({ title: 'x', display: 'modal' }).display).toBe('modal');
  });

  it('draws a banner as the dashboard slab and the site pill', () => {
    const slab = renderToString(createElement(SiteAnnouncement, { preview: announcement() }));
    const pill = renderToString(createElement(AnnouncementBar, { preview: announcement() }));
    expect(slab).toContain('panel-card');
    expect(pill).toContain('rounded-full');
    expect(text(slab)).toContain('See the plans');
  });

  it('draws a pop-up as the card on both surfaces, with a way out that is not the offer', () => {
    for (const html of [
      renderToString(createElement(SiteAnnouncement, { preview: announcement({ display: 'modal' }) })),
      renderToString(createElement(AnnouncementBar, { preview: announcement({ display: 'modal' }) })),
    ]) {
      expect(html).not.toContain('panel-card');
      expect(html).toContain('rounded-[2rem]');
      expect(text(html)).toContain('Annual plans are here');
      expect(text(html)).toContain('See the plans');
      expect(text(html)).toContain('Not now');
    }
  });

  it('gives a pop-up with no button a single way to close it', () => {
    const html = renderToString(
      createElement(SiteAnnouncement, { preview: announcement({ display: 'modal', cta: 'none', ctaLabel: '' }) }),
    );
    expect(text(html)).toContain('Got it');
    expect(text(html)).not.toContain('Not now');
  });
});

describe('the proof strip', () => {
  it('shows fixed facts on first paint and never a counted figure nobody has counted', () => {
    // First paint is the prerendered snapshot: the live counts have not arrived, so their places
    // are taken by facts that are always true — never zeros, never a guess.
    const words = text(renderToString(createElement(ProofStrip)));
    expect(words).toContain(`${SUPPORTED_BROKER_COUNT} brokers you can import from`);
    expect(words).toContain('to start a journal');
    expect(words).toContain(`$${lowestPaidPrice()} a month for one-tap broker sync`);
    expect(words).toContain('every connection is read-only');
    expect(words).not.toContain('trades journaled');
    expect(words).not.toContain('traders keeping a journal');
  });

  it('says the same four things as cards in the proof section', () => {
    const strip = text(renderToString(createElement(ProofStrip)));
    const grid = text(renderToString(createElement(ProofStrip, { variant: 'grid' })));
    expect(grid.trim()).toBe(strip.trim());
  });
});
