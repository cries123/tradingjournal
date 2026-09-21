import { BadgeCheck, Ban, Link2, Lock, ShieldCheck } from 'lucide-react';
import { LandingFooter, LandingNav } from '../components/landing/LandingFooter';
import { FadeIn } from '../components/motion/FadeIn';
import { PublishedRecordView } from '../components/trackRecord/PublishedRecordView';
import { MIN_TRADES_TO_PUBLISH, type PublishedRecord } from '../utils/trackRecord';
import { lowestTierWith, TIER_PLANS } from '../config/tiers';
import type { ExtraNavRoute } from '../hooks/useRoute';

/**
 * The marketing page for published track records.
 *
 * The example below is the REAL component, rendered from a sample record — not a screenshot. A
 * screenshot of this page's own product goes stale the first time the layout changes and nobody
 * notices, which for a page whose subject is "what we show you is what is there" would be a
 * quietly self-defeating thing to ship.
 *
 * Every claim here is one the product keeps, and the two it deliberately does not make are the
 * ones src/services/recordClaims.test.ts forbids: nothing is audited, and nothing promises a
 * record cannot be faked. What is true is narrower and is what this page sells.
 */

/**
 * Invented figures, labelled as invented everywhere they appear.
 *
 * A page arguing that these numbers are real, illustrated with numbers that are not, has to say so
 * loudly or it undermines itself on its own front page. Hence the ribbon over the example and the
 * username, which is not a name anybody could mistake for a customer.
 */
const EXAMPLE: PublishedRecord = {
  published: true,
  showAmounts: true,
  username: 'example',
  verifiedTrades: 412,
  excludedTrades: 38,
  brokers: [],
  firstDate: '2026-01-05',
  lastDate: '2026-09-18',
  tradingDays: 171,
  journalsEligible: 1,
  journalsIncluded: 1,
  winRate: 39.9,
  profitFactor: 1.24,
  updatedAt: '2026-09-18T15:04:00.000Z',
  netPnl: 18421.5,
  avgWin: 412.18,
  avgLoss: -286.4,
  maxDrawdown: -4930,
  bestDay: 2140,
  worstDay: -1860,
};

const HOLDS = [
  {
    icon: Lock,
    title: 'You cannot edit the numbers',
    body: 'Your page is built on our servers from the trades your broker sent. There is no way to type a figure onto it, and the database refuses every attempt to write one from a browser.',
  },
  {
    icon: Ban,
    title: 'Hand-entered trades never count',
    body: 'Log a trade manually and it stays out of the record entirely — and the page prints how many were left out. That number is what makes the rest of it worth reading.',
  },
  {
    icon: ShieldCheck,
    title: 'Leaving an account out is visible',
    body: 'You choose which of your connected accounts the record covers. If you leave one out, the page says so. Choosing is fine; choosing quietly is not.',
  },
  {
    icon: Link2,
    title: 'One link, and you can take it down',
    body: 'It lives at trendchasers.net/r/your-username. Taking it down deletes the page and its figures outright, so the link stops working for everyone who kept it.',
  },
];

interface VerifiedRecordPageProps {
  onHome: () => void;
  onLaunch: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
  onBrokers?: () => void;
  onGuides?: () => void;
  onNavigate?: (route: ExtraNavRoute) => void;
}

export function VerifiedRecordPage({
  onHome,
  onLaunch,
  onPrivacy,
  onTerms,
  onBrokers,
  onGuides,
  onNavigate,
}: VerifiedRecordPageProps) {
  // Derived rather than written down, because a price typed into marketing copy is the thing that
  // goes stale silently when the ladder moves.
  const tier = lowestTierWith('trackRecord');
  const plan = tier && tier !== 'free' ? TIER_PLANS[tier] : null;

  return (
    <div className="min-h-dvh bg-bg-primary text-text-primary overflow-x-hidden flex flex-col">
      <div className="landing-grid pointer-events-none fixed inset-0" aria-hidden />
      <LandingNav
        onLaunch={onLaunch}
        onHome={onHome}
        onBrokers={onBrokers}
        onGuides={onGuides}
        onNavigate={onNavigate}
      />

      <main className="relative z-10 flex-1 px-4 md:px-6 py-16 md:py-24">
        <div className="max-w-3xl mx-auto">
          <FadeIn>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
              Broker verified
            </span>

            <h1 className="text-3xl md:text-5xl font-bold tracking-tight mt-5 leading-[1.1]">
              A track record nobody has to take your word for
            </h1>

            <p className="text-base md:text-lg text-text-secondary mt-5 leading-relaxed">
              Anybody can post a screenshot. Publish a Trend Chasers record and you get a page built
              from the trades your broker actually sent us — with the ones you typed in left out,
              and counted, so the person reading it can see what was excluded.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 mt-8">
              <button type="button" onClick={onLaunch} className="btn-primary text-sm px-6 py-3">
                Publish yours
              </button>
              {onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate('pricing')}
                  className="btn-secondary text-sm px-6 py-3"
                >
                  See plans
                </button>
              )}
            </div>
          </FadeIn>

          <FadeIn>
            <section className="mt-16 md:mt-24">
              <h2 className="text-xl md:text-2xl font-bold tracking-tight">
                What one looks like
              </h2>

              {/*
                The real component with invented figures, and the ribbon is not decoration: this
                page's whole argument is that the numbers on a record are real, so showing made-up
                ones without saying so would be the exact trick it is selling protection from.
              */}
              <div className="mt-5 rounded-2xl border border-dashed border-border p-3 md:p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-300/90 px-1 pb-3">
                  Example only — invented figures, not a real trader
                </p>
                <PublishedRecordView record={EXAMPLE} onLaunch={onLaunch} />
              </div>
            </section>
          </FadeIn>

          <FadeIn>
            <section className="mt-16 md:mt-24">
              <h2 className="text-xl md:text-2xl font-bold tracking-tight">
                Why it is worth more than a screenshot
              </h2>

              <div className="grid sm:grid-cols-2 gap-5 mt-6">
                {HOLDS.map(({ icon: Icon, title, body }) => (
                  <div key={title} className="panel-card p-5">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-400">
                      <Icon className="h-4.5 w-4.5" aria-hidden />
                    </span>
                    <h3 className="text-sm font-semibold mt-3">{title}</h3>
                    <p className="text-sm text-text-secondary mt-1.5 leading-relaxed">{body}</p>
                  </div>
                ))}
              </div>
            </section>
          </FadeIn>

          <FadeIn>
            <section className="mt-16 md:mt-24 panel-card p-6 md:p-8">
              <h2 className="text-xl md:text-2xl font-bold tracking-tight">What you need</h2>
              <ul className="mt-5 space-y-3 text-sm text-text-secondary leading-relaxed">
                <li className="flex gap-3">
                  <span className="text-emerald-400 font-semibold tabular-nums shrink-0">1</span>
                  <span>
                    A connected brokerage. Trades arrive through a read-only connection that never
                    sees your balance and cannot place an order.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-emerald-400 font-semibold tabular-nums shrink-0">2</span>
                  <span>
                    At least {MIN_TRADES_TO_PUBLISH} imported trades. Less than that is a fortnight,
                    not a record, and the word &ldquo;verified&rdquo; over it would be doing work it
                    cannot support.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-emerald-400 font-semibold tabular-nums shrink-0">3</span>
                  <span>
                    {plan
                      ? `Any paid plan — from $${plan.price} a month on ${plan.name}.`
                      : 'A paid plan.'}{' '}
                    Every published page links back to us, so it is on the cheapest plan rather than
                    the dearest.
                  </span>
                </li>
              </ul>

              <button
                type="button"
                onClick={onLaunch}
                className="btn-primary text-sm px-6 py-3 mt-7"
              >
                Start your journal
              </button>
            </section>
          </FadeIn>
        </div>
      </main>

      <LandingFooter
        onPrivacy={onPrivacy}
        onTerms={onTerms}
        onHome={onHome}
        onBrokers={onBrokers}
        onGuides={onGuides}
        onNavigate={onNavigate}
        onLaunch={onLaunch}
      />
    </div>
  );
}
