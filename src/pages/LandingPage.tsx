import { useEffect, useState, type ReactNode } from 'react';
import { ChevronRight, Lock } from 'lucide-react';
import { lowestPaidPrice, priceOf } from '../seo/pricingClaims';
import { shot } from '../components/landing/landingShots';
import { AnnouncementBar } from '../components/landing/AnnouncementBar';
import { LandingFooter, LandingNav } from '../components/landing/LandingFooter';
import { FadeIn } from '../components/motion/FadeIn';
import { SiteBackdrop } from '../components/landing/SiteBackdrop';
import { ProofStrip } from '../components/landing/ProofStrip';
import { DiscordIcon, XIcon } from '../components/landing/SocialIcons';
import { SOCIAL_LINKS, X_HANDLE } from '../data/social';
import { LandingFaq } from '../components/landing/LandingFaq';
import { HeroStage } from '../components/landing/HeroStage';
import { BrokerMarquee } from '../components/landing/BrokerMarquee';
import { ChapterNav } from '../components/landing/ChapterNav';
import { FeatureBento } from '../components/landing/FeatureBento';
import { DayStory } from '../components/landing/DayStory';
import { PhoneFan } from '../components/landing/PhoneFan';
import { PricingLadder } from '../components/landing/PricingLadder';
import { trackSpotlight } from '../utils/spotlight';
import { numberWord, STORY_CAP, storyDay } from '../components/landing/landingStory';
import { hasTrial, TRIAL_DAYS } from '../config/trial';
import { lowestTierWith, PAID_TIERS, TIER_PLANS } from '../config/tiers';
import { COMING_SOON_BROKERS, SUPPORTED_BROKERS } from '../data/brokers';
import { BROKER_COUNT_PHRASE } from '../data/brokerCopy';
import { GUIDE_ARTICLES } from '../seo/guides';
import { fetchBrokersConfig, type BrokerConfig } from '../services/brokersConfig';
import { brokerLogoSrc } from '../utils/brokerLogos';
import type { ExtraNavRoute } from '../hooks/useRoute';

interface LandingPageProps {
  onLaunch: () => void;
  /** Opens the journal straight on the broker connect screen. Falls back to onLaunch when the
   *  host doesn't provide it, so the button is never dead. */
  onConnectBroker?: () => void;
  onHome: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
  onBrokers: () => void;
  onGuides?: () => void;
  onGuide?: (slug: string) => void;
  onNavigate?: (route: ExtraNavRoute) => void;
}

/** A chapter's number and name over its headline: these three are a sequence, so they are numbered. */
function Kicker({ n, children }: { n: number; children: ReactNode }) {
  return (
    <p className="mb-[18px] inline-flex items-center gap-2.5 text-sm font-bold text-accent">
      <b className="grid h-7 w-7 place-items-center rounded-full bg-accent text-black">{n}</b>
      {children}
    </p>
  );
}

/**
 * The public home page.
 *
 * Built to the concept Jay approved in October 2026: the product above the fold, then the brokers,
 * then "how it works" as three chapters with a bar that follows the reader — Connect, See, Fix — then
 * proof, the phone, the prices, and the questions. It replaced a page that opened on a headline over
 * grey bars with the product a screen down, and ran its sections in no order a reader could follow.
 *
 * One sample journal (components/landing/landingStory.ts) feeds every figure that is not a fact about
 * the product, so the hero, the day played back and the simulator's line agree to the cent. The one
 * real trader on the page is the founder's own year, said as such.
 *
 * Lime is still spent sparingly — the primary buttons, the chapter numbers, a few figures — see the
 * public-site block in index.css.
 */
export function LandingPage({
  onLaunch,
  onConnectBroker,
  onHome,
  onPrivacy,
  onTerms,
  onBrokers,
  onGuides,
  onGuide,
  onNavigate,
}: LandingPageProps) {
  const [brokers, setBrokers] = useState<{ supported: BrokerConfig[]; comingSoon: string[] }>({
    supported: SUPPORTED_BROKERS.map((b) => ({ ...b, methods: [...b.methods] })),
    comingSoon: [...COMING_SOON_BROKERS],
  });

  useEffect(() => {
    let cancelled = false;
    void fetchBrokersConfig().then((config) => {
      if (!cancelled) setBrokers(config);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const price = lowestPaidPrice();
  const replay = priceOf('marketReplay');
  const openPricing = () => (onNavigate ? onNavigate('pricing') : onLaunch());
  // Said from the plans that carry a trial (config/trial.ts), never typed beside a plan name.
  const everyPaidPlanTrials = PAID_TIERS.every(hasTrial);
  const anyTrial = PAID_TIERS.some(hasTrial);
  const syncTier = lowestTierWith('brokerSync');
  const syncPlan = syncTier ? TIER_PLANS[syncTier].name : 'a paid plan';
  const connect = onConnectBroker ?? onLaunch;
  const schwabLogo = brokerLogoSrc('Charles Schwab');
  const storyTrades = storyDay().trades.length;

  return (
    /*
     * overflow-x CLIP, not hidden. Hidden makes this div a scroll container, and a sticky element
     * sticks to its nearest scroll container — so the header, the chapter bar and the day story's
     * chart all scrolled away with the page. The header had been marked sticky for months and had
     * never once stuck. Clip trims the tilted hero the same way and leaves the window as the scroller.
     */
    <div className="min-h-dvh bg-bg-primary text-text-primary overflow-x-clip flex flex-col" onPointerMove={trackSpotlight}>
      <SiteBackdrop />
      <LandingNav onLaunch={onLaunch} onHome={onHome} onBrokers={onBrokers} onGuides={onGuides} onNavigate={onNavigate} />
      {/* Under the nav, not above it: a pill above the header left a dark band over the whole site
          with one small object floating in it. */}
      <AnnouncementBar onConnectBroker={connect} />
      {/* No floating "Start for free" pill any more: it stood in for the header's button while the
          header scrolled away, and now the header stays. */}

      {/* 1 · The hero: the claim on the left, the product on the right, moving. */}
      <section className="relative z-10 overflow-hidden pb-14 pt-12 md:pb-24 md:pt-20">
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-50" viewBox="0 0 1440 760" preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id="hero-fade" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#7aff45" stopOpacity=".16" />
              <stop offset="1" stopColor="#7aff45" stopOpacity="0" />
            </linearGradient>
            <pattern id="hero-grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M60 0H0V60" fill="none" stroke="rgba(255,255,255,.035)" />
            </pattern>
          </defs>
          <rect width="1440" height="760" fill="url(#hero-grid)" />
          <path d="M0 610 L80 590 L160 600 L240 560 L320 575 L400 520 L480 540 L560 470 L640 500 L720 430 L800 455 L880 380 L960 410 L1040 330 L1120 360 L1200 290 L1280 300 L1360 230 L1440 250 L1440 760 L0 760 Z" fill="url(#hero-fade)" />
          {/* Off on a phone: stretched up a tall narrow hero it cut straight through the buttons. */}
          <g className="draw-line max-sm:hidden">
            <path d="M0 610 L80 590 L160 600 L240 560 L320 575 L400 520 L480 540 L560 470 L640 500 L720 430 L800 455 L880 380 L960 410 L1040 330 L1120 360 L1200 290 L1280 300 L1360 230 L1440 250" fill="none" stroke="#7aff45" strokeOpacity=".5" strokeWidth="2" pathLength={1} />
          </g>
        </svg>
        <div className="pointer-events-none absolute -right-40 -top-32 h-[700px] w-[900px] bg-[radial-gradient(closest-side,rgba(122,255,69,0.16),transparent_70%)]" aria-hidden />

        <div className="relative mx-auto grid max-w-[1360px] items-center gap-10 px-4 md:px-8 lg:grid-cols-[minmax(0,5.3fr)_minmax(0,6.7fr)]">
          <div>
            <h1 className="public-display text-[2.75rem] font-bold sm:text-6xl lg:text-[4.25rem] lg:leading-[1]">
              Know what every trade is really costing you
            </h1>
            <p className="mt-6 max-w-[540px] text-lg leading-relaxed text-[#c8c8c8] md:text-[19px]">
              Import your fills from {BROKER_COUNT_PHRASE}, or log trades by hand. Trend Chasers pairs them into round trips, puts every
              day on a calendar, and shows which trades and habits cost you money.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={onLaunch} className="btn-primary justify-center px-7 py-4 text-base">
                Start journaling for $0
              </button>
              <a href="#fix" className="btn-secondary justify-center px-7 py-4 text-base">
                See one real day
              </a>
            </div>
            {/* Scoped on purpose: the journal is free, the sync is not, and a line that says only
                "free" next to a broker list has earned chargebacks before. */}
            <p className="mt-4 text-[13px] text-text-secondary">
              Journal free, no card needed. Broker sync from ${price} a month
              {everyPaidPlanTrials && (
                <>
                  , and every paid plan starts with a <span className="whitespace-nowrap">{TRIAL_DAYS}-day free trial</span>
                </>
              )}
              .
            </p>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2.5 border-t border-white/[0.07] pt-6 text-sm text-text-secondary" aria-label="At a glance">
              {[`${SUPPORTED_BROKERS.length} brokers`, 'Read-only connections', 'Works on your phone'].map((fact) => (
                <li key={fact} className="inline-flex items-center gap-2">
                  <i className="h-[7px] w-[7px] rounded-full bg-accent shadow-[0_0_10px_rgba(122,255,69,0.9)]" aria-hidden />
                  {fact}
                </li>
              ))}
            </ul>
          </div>
          <HeroStage />
        </div>
      </section>

      {/* 2 · The brokers, as their own logos. */}
      <section id="brokers" className="relative z-10 border-y border-white/[0.07] bg-gradient-to-b from-[#050505] to-black py-9">
        <div className="mx-auto mb-6 flex max-w-[1240px] flex-col gap-2 px-4 sm:flex-row sm:items-baseline sm:justify-between md:px-8">
          <p className="text-[17px] font-semibold">
            Imports from {BROKER_COUNT_PHRASE}, read-only{' '}
            <button type="button" onClick={onBrokers} className="public-link ml-1 text-sm font-medium">
              All {brokers.supported.length} brokers
              {brokers.comingSoon.length > 0 && ` and ${brokers.comingSoon.length} coming`}
              <ChevronRight size={16} aria-hidden />
            </button>
          </p>
          <small className="max-w-[420px] text-xs text-text-secondary/70 sm:text-right">
            Logos show supported connections. Trend Chasers isn&apos;t affiliated with or endorsed by these brokers.
          </small>
        </div>
        <BrokerMarquee names={brokers.supported.map((b) => b.name)} />
      </section>

      {/* 3 · How it works, in three chapters with a bar that follows the reader through them. */}
      <div className="relative z-10">
        <ChapterNav />

        <section id="connect" className="scroll-mt-32 pb-10 pt-20 md:pt-28">
          <div className="mx-auto max-w-[1240px] px-4 md:px-8">
            <Kicker n={1}>Connect</Kicker>
            <h2 className="public-display text-4xl font-bold md:text-[52px]">Your trades, in without typing them</h2>
            <p className="mt-4 max-w-[640px] text-lg leading-relaxed text-text-secondary md:text-[19px]">
              Link a broker once and press Sync, import a CSV, or log a trade by hand. Fills come in paired into round trips, so a buy and
              its sell are one trade with one P&amp;L.
            </p>
            <div className="mt-11 grid gap-[18px] lg:grid-cols-3">
              <FadeIn className="h-full">
                <article id="security" className="flex h-full scroll-mt-32 flex-col rounded-[22px] border border-white/[0.07] bg-[#141414] p-6">
                  <h3 className="text-[21px] font-semibold">Connect your broker</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-text-secondary">
                    Read-only, through SnapTrade. Your login goes to your broker or SnapTrade&apos;s portal, nothing can place a trade for you,
                    and disconnecting stops the sync at once.
                  </p>
                  <div className="mt-auto pt-6">
                    <div className="flex items-center gap-3 rounded-[14px] border border-white/[0.07] bg-[#0a0a0a] p-3.5">
                      <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[10px] bg-white p-1">
                        {schwabLogo ? <img src={schwabLogo} alt="" className="h-full w-full object-contain" /> : <Lock size={16} className="text-black" aria-hidden />}
                      </span>
                      <span className="min-w-0 flex-1 text-sm">
                        Charles Schwab
                        <small className="block text-xs text-text-secondary">
                          <i className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent align-[1px]" aria-hidden />
                          Synced 9 h ago
                        </small>
                      </span>
                      <button type="button" onClick={connect} className="btn-primary px-3.5 py-1.5 text-[13px]">
                        Sync
                      </button>
                    </div>
                  </div>
                </article>
              </FadeIn>
              <FadeIn className="h-full" delay={60}>
                <article className="flex h-full flex-col rounded-[22px] border border-white/[0.07] bg-[#141414] p-6">
                  <h3 className="text-[21px] font-semibold">Fills become trades</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-text-secondary">
                    An open and its close are matched into one round trip, with its size, its P&amp;L and the day it belongs to.
                  </p>
                  <div className="mt-auto grid gap-2 pt-6 text-[13px]">
                    {[
                      { tag: 'Buy', what: 'SPY 572C × 4 @ 1.39', right: '09:41' },
                      { tag: 'Sell', what: 'SPY 572C × 4 @ 1.56', right: '10:02' },
                    ].map((r) => (
                      <div key={r.tag} className="grid grid-cols-[56px_1fr_auto] items-center gap-2.5 rounded-xl border border-white/[0.07] bg-[#0a0a0a] px-3 py-2.5">
                        <span className="rounded-md bg-[#1a1a1a] py-0.5 text-center text-[11px] text-text-secondary">{r.tag}</span>
                        <span>{r.what}</span>
                        <span className="text-text-secondary">{r.right}</span>
                      </div>
                    ))}
                    <div className="grid grid-cols-[56px_1fr_auto] items-center gap-2.5 rounded-xl border border-accent/35 bg-accent/[0.06] px-3 py-2.5">
                      <span className="rounded-md bg-accent/15 py-0.5 text-center text-[11px] text-accent">Trade</span>
                      <span>SPY 572C, 4 contracts</span>
                      <b className="tabular-nums text-profit-bright">+$68.00</b>
                    </div>
                  </div>
                </article>
              </FadeIn>
              <FadeIn className="h-full" delay={120}>
                <article className="flex h-full flex-col rounded-[22px] border border-white/[0.07] bg-[#141414] p-6">
                  <h3 className="text-[21px] font-semibold">Or bring them yourself</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-text-secondary">
                    Every plan can log trades by hand and import a CSV. Broker sync starts on {syncPlan}.
                  </p>
                  <div className="mt-auto grid grid-cols-2 gap-2 pt-6 text-[13.5px]">
                    <div className="rounded-xl border border-white/[0.07] bg-[#0a0a0a] p-3.5">
                      <b className="mb-1 block text-[15px] font-semibold">Log a trade</b>
                      Symbol, side, size, prices, your setup and a note.
                    </div>
                    <div className="rounded-xl border border-white/[0.07] bg-[#0a0a0a] p-3.5">
                      <b className="mb-1 block text-[15px] font-semibold">Import a CSV</b>
                      From any broker&apos;s export, for any range of dates.
                    </div>
                  </div>
                </article>
              </FadeIn>
            </div>
          </div>
        </section>

        <section id="see" className="scroll-mt-32 pb-10 pt-20 md:pt-28">
          <div id="features" className="mx-auto max-w-[1240px] scroll-mt-32 px-4 md:px-8">
            <Kicker n={2}>See</Kicker>
            <h2 className="public-display text-4xl font-bold md:text-[52px]">Where the money went, already worked out</h2>
            <p className="mt-4 max-w-[640px] text-lg leading-relaxed text-text-secondary md:text-[19px]">
              Every number comes from your own trades: symbol, side, size, price, date and fees. A panel stays hidden until there are enough
              trades for it to say something true. The screens below are the app, on a sample journal.
            </p>
            <FeatureBento />
          </div>
        </section>

        <section id="fix" className="scroll-mt-32 pb-10 pt-20 md:pt-28">
          <div className="mx-auto max-w-[1240px] px-4 md:px-8">
            <Kicker n={3}>Fix</Kicker>
            <h2 className="public-display text-4xl font-bold md:text-[52px]">One day, played back trade by trade</h2>
            <p className="mt-4 max-w-[640px] text-lg leading-relaxed text-text-secondary md:text-[19px]">
              The rule was {numberWord(STORY_CAP)} trades a day. {numberWord(storyTrades).replace(/^./, (c) => c.toUpperCase())} were taken. Scroll to watch the day the way the
              journal shows it.
            </p>
            <DayStory />
          </div>
        </section>
      </div>

      {/* 4 · Market replay: after the journal plays a day back, the market itself does. Drawn only
          while it is sold (priceOf is null when MARKET_REPLAY_LIVE is off), so switching replay off
          takes this section with it. */}
      {replay && (
        <section id="replay" className="relative z-10 scroll-mt-24 pb-10 pt-20 md:pt-28">
          <div className="mx-auto max-w-[1240px] px-4 md:px-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-[18px] inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
                  <i className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
                  New on {replay.name}
                </p>
                <h2 className="public-display text-4xl font-bold md:text-[52px]">Then replay the market itself</h2>
                <p className="mt-4 max-w-[640px] text-lg leading-relaxed text-text-secondary md:text-[19px]">
                  Open a day you traded and it plays back one minute at a time, with your trades on the chart. Take the trade again, mark
                  your levels, add indicators, and test a rule on the day.
                </p>
              </div>
              <button type="button" onClick={() => onNavigate?.('market-replay')} className="public-link shrink-0 self-start text-sm lg:self-end">
                How market replay works
                <ChevronRight size={16} aria-hidden />
              </button>
            </div>
            <FadeIn>
              <img
                {...shot('shot-replay.webp')}
                alt="The market replay chart partway through a session, with moving averages, VWAP, the opening range, a trend line, a zone, and practice buy and sell markers."
                className="mt-11 h-auto w-full rounded-[22px] border border-white/[0.07] shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
                loading="lazy"
                decoding="async"
              />
            </FadeIn>
            <div className="mt-[18px] grid gap-[18px] md:grid-cols-3">
              {[
                {
                  title: 'Your trades on the chart',
                  body: 'The contracts you traded and the stock under them. When your broker sends no fill time, the candles your price traded through are shaded as an estimate.',
                },
                {
                  title: 'Take it again',
                  body: 'Buy and sell as it plays. Practice orders fill at the close of the candle on screen and never touch your journal.',
                },
                {
                  title: 'Test a rule on the day',
                  body: 'Run a rule like an opening range breakout over only the candles you have seen, with its net and its worst drawdown.',
                },
              ].map((c) => (
                <article key={c.title} className="rounded-[22px] border border-white/[0.07] bg-[#141414] p-6">
                  <h3 className="text-[19px] font-semibold">{c.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-text-secondary">{c.body}</p>
                </article>
              ))}
            </div>
            <p className="mt-4 text-xs text-text-secondary/70">
              Shown on a sample session. One-minute data from OPRA and the US stock exchanges, available the trading day after.
            </p>
          </div>
        </section>
      )}

      {/* 6 · Proof: the one real trader on the page, and four facts about the product. */}
      <section id="simulator" className="relative z-10 py-24 md:py-32">
        <div className="mx-auto max-w-[1240px] px-4 md:px-8">
          <h2 className="public-display text-4xl font-bold md:text-[52px]">What one trader&apos;s journal showed him</h2>
          <p className="mt-4 max-w-[640px] text-lg leading-relaxed text-text-secondary md:text-[19px]">
            Real figures from the founder&apos;s own year, split by how many trades he took in a day.
          </p>
          <div className="mt-11 grid gap-10 lg:grid-cols-[1.1fr_1fr]">
            <div className="grid grid-cols-2 overflow-hidden rounded-[26px] border border-white/[0.07]">
              <div className="flex flex-col justify-center border-r border-white/[0.07] bg-[linear-gradient(180deg,rgba(248,113,113,0.12),rgba(248,113,113,0.02))] p-6 sm:p-8">
                <small className="text-sm text-text-secondary">Days with 11 or more trades</small>
                <strong className="my-3.5 block text-[46px] font-bold leading-none tracking-[-0.04em] text-loss-bright sm:text-[78px]">-$496</strong>
                <p className="text-[15px] text-[#c8c8c8]">lost per day, on average.</p>
              </div>
              <div className="flex flex-col justify-center bg-[linear-gradient(180deg,rgba(122,255,69,0.12),rgba(122,255,69,0.02))] p-6 sm:p-8">
                <small className="text-sm text-text-secondary">Days with one or two trades</small>
                <strong className="my-3.5 block text-[46px] font-bold leading-none tracking-[-0.04em] text-profit-bright sm:text-[78px]">+$163</strong>
                <p className="text-[15px] text-[#c8c8c8]">made per day, on average.</p>
              </div>
            </div>
            <ProofStrip variant="grid" />
          </div>
        </div>
      </section>

      {/* 8 · The phone app, as three real screens. */}
      <section id="mobile" className="relative z-10 overflow-hidden bg-[radial-gradient(60%_50%_at_50%_70%,rgba(122,255,69,0.1),transparent_70%)] pb-16 pt-20 md:pt-28">
        <div className="mx-auto max-w-[760px] px-4 text-center md:px-8">
          <h2 className="public-display text-4xl font-bold md:text-[52px]">Your journal, in your pocket</h2>
          <p className="mx-auto mt-4 max-w-[640px] text-lg leading-relaxed text-text-secondary md:text-[19px]">
            Open trendchasers.net on your phone and add it to your Home Screen, and it opens like an app. The same journal on your phone and
            your desktop, with nothing to move over.
          </p>
        </div>
        <PhoneFan />
      </section>

      {/* 7 · Prices, from the same plan list the pricing page and checkout use. */}
      <section id="pricing" className="relative z-10 scroll-mt-24 border-t border-white/[0.07] py-24 md:py-28">
        <div className="mx-auto max-w-[1240px] px-4 md:px-8">
          <h2 className="public-display text-4xl font-bold md:text-[52px]">
            {everyPaidPlanTrials ? `Start free. Try any plan free for ${TRIAL_DAYS} days.` : 'Start free. Pay when you want your broker in.'}
          </h2>
          <p className="mt-4 max-w-[640px] text-lg leading-relaxed text-text-secondary md:text-[19px]">
            Every plan keeps a full journal. Paid plans add broker sync and the analysis built on it
            {anyTrial ? ', and checkout takes your card but charges nothing until the trial ends.' : '.'}
          </p>
          <PricingLadder onStart={onLaunch} onPricing={openPricing} />
          <p className="mt-6 text-center">
            <button type="button" onClick={openPricing} className="public-link text-sm">
              Compare the plans in full
              <ChevronRight size={16} aria-hidden />
            </button>
          </p>
        </div>
      </section>

      {/* Guides and the community: kept, smaller, for the reader who wants more before signing up. */}
      <section id="guides" className="relative z-10 scroll-mt-24 border-t border-white/[0.07] py-20">
        <div className="mx-auto grid max-w-[1240px] gap-12 px-4 md:px-8 lg:grid-cols-[1.6fr_1fr]">
          <div>
            <h2 className="public-display text-3xl font-bold md:text-4xl">Learn the journal before you open it</h2>
            <div className="mt-8 grid gap-3.5 sm:grid-cols-2">
              {GUIDE_ARTICLES.slice(0, 4).map((guide) => (
                <a
                  key={guide.slug}
                  href={guide.path}
                  onClick={(e) => {
                    if (onGuide) {
                      e.preventDefault();
                      onGuide(guide.slug);
                    }
                  }}
                  className="public-card spotlight block p-5 transition-colors hover:border-white/20 focus-ring"
                >
                  <h3 className="text-base font-semibold leading-snug">{guide.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-secondary">{guide.description}</p>
                </a>
              ))}
            </div>
            {onGuides && (
              <button type="button" onClick={onGuides} className="public-link mt-6 text-sm">
                All guides
                <ChevronRight size={16} aria-hidden />
              </button>
            )}
          </div>
          <div id="community">
            <h2 className="public-display text-3xl font-bold md:text-4xl">Join the community</h2>
            <div className="mt-8 grid gap-3.5">
              {SOCIAL_LINKS.map((s) => (
                <a
                  key={s.id}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="public-card spotlight flex items-start gap-4 p-5 transition-colors hover:border-white/20 focus-ring"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-black">
                    {s.id === 'x' ? <XIcon size={19} /> : <DiscordIcon size={21} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-base font-semibold leading-snug">{s.id === 'x' ? `${s.name} · ${X_HANDLE}` : s.name}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-text-secondary">{s.blurb}</span>
                  </span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 9 · Questions, then the close. */}
      <section id="faq" className="relative z-10 scroll-mt-24 pb-10 pt-16">
        <LandingFaq />
      </section>

      <section className="relative z-10 overflow-hidden border-t border-white/[0.07] pb-32 pt-28 text-center">
        <svg className="draw-line pointer-events-none absolute inset-x-0 bottom-0 h-[260px] w-full opacity-60" viewBox="0 0 1440 260" preserveAspectRatio="none" aria-hidden>
          <path d="M0 230 L120 220 L240 226 L360 190 L480 200 L600 160 L720 172 L840 120 L960 136 L1080 90 L1200 100 L1320 50 L1440 60" fill="none" stroke="#7aff45" strokeWidth="2.5" pathLength={1} />
        </svg>
        <FadeIn className="relative mx-auto max-w-3xl px-4 md:px-6">
          <h2 className="public-display text-[2.75rem] font-bold sm:text-6xl md:text-[84px] md:leading-[1]">Find out what your trades cost you</h2>
          <p className="mx-auto mt-5 max-w-[560px] text-lg leading-relaxed text-text-secondary md:text-[19px]">
            Start a free journal in a minute. Connect your broker when you&apos;re ready
            {everyPaidPlanTrials ? `, and try it free for ${TRIAL_DAYS} days.` : '.'}
          </p>
          <button type="button" onClick={onLaunch} className="btn-primary mt-9 px-8 py-4 text-base">
            Start journaling for $0
          </button>
        </FadeIn>
      </section>

      <LandingFooter onPrivacy={onPrivacy} onTerms={onTerms} onBrokers={onBrokers} onGuides={onGuides} onGuide={onGuide} onNavigate={onNavigate} onLaunch={onLaunch} />
    </div>
  );
}
