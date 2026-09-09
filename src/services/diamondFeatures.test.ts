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

describe('broker connections', () => {
  it('is unlimited on every paid plan, because connections are free to us', () => {
    // SnapTrade bills per connected PERSON, not per connection, so a cap bought nothing and cost
    // the product a reason to say yes to somebody with a brokerage account and a Roth.
    for (const tier of PAID_TIERS) {
      expect(brokersUnlimited(limitsFor(tier))).toBe(true);
      expect(brokersLabel(limitsFor(tier))).toBe('Unlimited broker connections');
    }
  });

  it('still gates the free plan out of broker sync entirely', () => {
    expect(limitsFor('free').brokers).toBe(0);
    expect(brokersUnlimited(limitsFor('free'))).toBe(false);
    expect(tierHas('free', 'brokerSync')).toBe(false);
  });

  it('survives the trip through JSON that the entitlement endpoint makes', () => {
    // Infinity would arrive as null and read as a plan with no broker limit at all, locking
    // everybody out of connecting. This is the whole reason the sentinel is a finite number.
    const roundTripped = JSON.parse(JSON.stringify(limitsFor('gold'))) as { brokers: number };
    expect(roundTripped.brokers).toBe(UNLIMITED_BROKERS);
    expect(brokersUnlimited(roundTripped as never)).toBe(true);
  });

  it('advertises it on every paid card', () => {
    for (const tier of PAID_TIERS) {
      expect(featureLines(tier).some((l) => l.text === 'Unlimited broker connections')).toBe(true);
    }
  });
});
