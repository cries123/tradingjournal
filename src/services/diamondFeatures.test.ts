import { describe, expect, it } from 'vitest';
import {
  brokersLabel,
  brokersUnlimited,
  featureLines,
  limitsFor,
  lowestTierWith,
  PAID_TIERS,
  TIER_ORDER,
  tierHas,
  syncsLabel,
  UNLIMITED_BROKERS,
  type Feature,
} from '../config/tiers';
import { reviewToHtml, ruleAlertEmail, aiRecapEmail } from '../../server/emailTemplates';

const DIAMOND_ONLY: Feature[] = ['autoSync', 'coachSeat', 'ruleAlerts', 'aiReview'];

describe('the four capabilities that make Diamond a different product', () => {
  it('belongs to the top tier and no other', () => {
    for (const feature of DIAMOND_ONLY) {
      expect(lowestTierWith(feature)).toBe('diamond');
      for (const tier of TIER_ORDER) {
        expect(tierHas(tier, feature)).toBe(tier === 'diamond');
      }
    }
  });

  it('is advertised on the Diamond card and nowhere below it', () => {
    const diamond = featureLines('diamond').map((l) => l.text.toLowerCase());
    expect(diamond.some((t) => t.includes('import themselves'))).toBe(true);
    expect(diamond.some((t) => t.includes('coach'))).toBe(true);
    expect(diamond.some((t) => t.includes('risk-rule alerts'))).toBe(true);
    expect(diamond.some((t) => t.includes('weekly review'))).toBe(true);

    for (const tier of ['free', 'silver', 'gold'] as const) {
      const lines = featureLines(tier).map((l) => l.text.toLowerCase());
      expect(lines.some((t) => t.includes('import themselves'))).toBe(false);
      expect(lines.some((t) => t.includes('risk-rule alerts'))).toBe(false);
      expect(lines.some((t) => t.includes('weekly review'))).toBe(false);
    }
  });

  it('does not claim market replay works, because it does not', () => {
    // Selling "coming soon" on a top tier is the likeliest cause of a refund request there is, so
    // the flag stays honest even while the plan grants it.
    expect(tierHas('diamond', 'marketReplay')).toBe(false);
    expect(featureLines('diamond').find((l) => l.text === 'Market replay')?.soon).toBe(true);
  });
});

describe('reviewToHtml', () => {
  it('escapes the model output before adding any markup back', () => {
    // The assistant is quoting a journal it did not write. A ticker or a note containing markup
    // must not become markup in somebody's inbox.
    const html = reviewToHtml('You traded <script>alert(1)</script> badly');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('turns blank lines into paragraphs and ** into bold', () => {
    const html = reviewToHtml('First para.\n\nSecond **para**.');
    expect(html.match(/<p /g)).toHaveLength(2);
    expect(html).toContain('<strong>para</strong>');
  });

  it('does not let the model close a tag of its own', () => {
    // The bold pass runs on already-escaped text, so a literal </p> in the answer stays literal.
    expect(reviewToHtml('done</p><img src=x onerror=1>')).not.toContain('<img');
  });
});

describe('the emails', () => {
  const recap = {
    net: -1200,
    greenDays: 2,
    redDays: 3,
    tradeCount: 18,
    bestDay: null,
    worstDay: null,
    topSetup: null,
    prevNet: -400,
  };

  it('names the rules that were broken and what the day cost', () => {
    const mail = ruleAlertEmail({
      date: '2026-08-10',
      breaches: [{ message: 'Daily loss -900 exceeded limit' }],
      dayPnl: -900,
      tradeCount: 7,
      siteUrl: 'https://trendchasers.net',
    });

    expect(mail.subject).toContain('broke a rule');
    expect(mail.html).toContain('Daily loss -900 exceeded limit');
    expect(mail.text).toContain('7 trades');
  });

  it('pluralises the subject when more than one went', () => {
    const mail = ruleAlertEmail({
      date: '2026-08-10',
      breaches: [{ message: 'a' }, { message: 'b' }],
      dayPnl: -10,
      tradeCount: 2,
      siteUrl: 'https://trendchasers.net',
    });
    expect(mail.subject).toContain('broke 2 rules');
  });

  it('keeps the figures under the written review', () => {
    // A paragraph of assertions with no numbers behind it is not a review, it is a horoscope.
    const mail = aiRecapEmail({
      recap,
      review: 'You lost money on Tuesday.',
      siteUrl: 'https://trendchasers.net',
    });

    expect(mail.html).toContain('You lost money on Tuesday.');
    expect(mail.html).toContain('Net P&amp;L');
    expect(mail.text).toContain('Trades: 18');
    expect(mail.text).toContain('vs last week');
  });
});

describe('connections and syncs', () => {
  it('gives the top tier no ceiling on connections, because there is no cost to cap', () => {
    expect(brokersUnlimited(limitsFor('diamond'))).toBe(true);
    expect(brokersLabel(limitsFor('diamond'))).toBe('Unlimited broker connections');
  });

  it('keeps a real sync ceiling on every plan, the top one included', () => {
    // Syncs cost nothing, but unlimited would leave nothing between a scripted client and
    // SnapTrade's API. 24 a day is an hourly sync around the clock — a rate limit no person
    // trading a US session reaches, which is what a rate limit should be.
    for (const tier of PAID_TIERS) {
      const limits = limitsFor(tier);
      expect(Number.isSafeInteger(limits.syncsPerDay)).toBe(true);
      expect(limits.syncsPerDay).toBeGreaterThan(0);
      expect(limits.syncsPerDay).toBeLessThanOrEqual(24);
    }
    expect(limitsFor('diamond').syncsPerDay).toBe(24);
    expect(syncsLabel(limitsFor('diamond'))).toBe('24 trade syncs a day');
  });

  it('gives the paid tiers a ladder that goes up', () => {
    const ladder = PAID_TIERS.map((t) => limitsFor(t));
    for (let i = 1; i < ladder.length; i++) {
      expect(ladder[i].brokers).toBeGreaterThan(ladder[i - 1].brokers);
      expect(ladder[i].syncsPerDay).toBeGreaterThan(ladder[i - 1].syncsPerDay);
    }
    expect(limitsFor('silver').brokers).toBe(5);
    expect(limitsFor('silver').syncsPerDay).toBe(5);
    expect(limitsFor('gold').brokers).toBe(10);
    expect(limitsFor('gold').syncsPerDay).toBe(10);
  });

  it('still gates the free plan out of broker sync entirely', () => {
    expect(limitsFor('free').brokers).toBe(0);
    expect(limitsFor('free').syncsPerDay).toBe(0);
    expect(brokersUnlimited(limitsFor('free'))).toBe(false);
    expect(tierHas('free', 'brokerSync')).toBe(false);
  });

  it('survives the trip through JSON that the entitlement endpoint makes', () => {
    // Infinity would arrive as null and read as a plan with no broker limit at all, locking
    // everybody out of connecting. This is the whole reason the sentinel is a finite number.
    const limits = JSON.parse(JSON.stringify(limitsFor('diamond'))) as never;
    expect(brokersUnlimited(limits)).toBe(true);
    expect((limits as { brokers: number }).brokers).toBe(UNLIMITED_BROKERS);
    // The sync ceiling is an ordinary number and must survive the trip as one.
    expect((limits as { syncsPerDay: number }).syncsPerDay).toBe(24);
  });

  it('gives the performance screen to every paid plan, including the cheapest', () => {
    for (const tier of PAID_TIERS) {
      expect(tierHas(tier, 'performanceAnalytics')).toBe(true);
    }
    expect(tierHas('free', 'performanceAnalytics')).toBe(false);
  });

  it('advertises both on every paid card, in that plan\'s own words', () => {
    for (const tier of PAID_TIERS) {
      const lines = featureLines(tier).map((l) => l.text);
      expect(lines).toContain(brokersLabel(limitsFor(tier)));
      expect(lines).toContain(syncsLabel(limitsFor(tier)));
    }
    expect(featureLines('diamond').map((l) => l.text)).toContain('24 trade syncs a day');
    expect(featureLines('diamond').map((l) => l.text)).toContain('Unlimited broker connections');
  });
});
