import { lazy, useEffect, useRef, useState } from 'react';
import { lowestPaidPrice } from '../seo/pricingClaims';
import {
  Bot,
  Calendar,
  ChevronRight,
  Cloud,
  Download,
  FileText,
  Gauge,
  Link2,
  Lock,
  Pencil,
  Share2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AnnouncementBar } from '../components/landing/AnnouncementBar';
import { DashboardPreview } from '../components/landing/DashboardPreview';
import { LandingFooter, LandingNav } from '../components/landing/LandingFooter';
import { FadeIn } from '../components/motion/FadeIn';
import { SiteBackdrop } from '../components/landing/SiteBackdrop';
import { HeroBars } from '../components/landing/HeroBars';
import { StickyCta } from '../components/landing/StickyCta';
import { ProofStrip } from '../components/landing/ProofStrip';
import { PhoneShowcase } from '../components/landing/PhoneShowcase';
import { DiscordIcon, XIcon } from '../components/landing/SocialIcons';
import { SOCIAL_LINKS, X_HANDLE } from '../data/social';
import { AssistantDemo } from '../components/landing/AssistantDemo';
import { LazyOnView } from '../components/landing/LazyOnView';
import { LandingFaq } from '../components/landing/LandingFaq';
import { trackSpotlight } from '../utils/spotlight';
import { lowestTierWith, TIER_PLANS, type Feature } from '../config/tiers';
import { BrokerLogo } from '../components/brokers/BrokerLogo';
import { brokerIdFromName } from '../utils/brokerIds';
import { COMING_SOON_BROKERS, SUPPORTED_BROKERS } from '../data/brokers';
import { BROKER_COUNT_PHRASE, SHORT_BROKER_EXAMPLES } from '../data/brokerCopy';
import { GUIDE_ARTICLES } from '../seo/guides';
import { fetchBrokersConfig, type BrokerConfig } from '../services/brokersConfig';
import type { ExtraNavRoute } from '../hooks/useRoute';

/* Their own downloads, fetched only as the visitor scrolls near them — see LazyOnView. */
const ProductShowcase = lazy(() => import('../components/landing/ProductShowcase'));
const RuleSimulatorDemo = lazy(() => import('../components/landing/RuleSimulatorDemo'));

/** "Silver and up" — read from the plans, so the page cannot advertise a feature on the wrong tier. */
function fromPlan(feature: Feature): string | null {
  const tier = lowestTierWith(feature);
  return tier ? `On ${TIER_PLANS[tier].name} and up` : null;
}

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

/** The hero's chip row: what the journal does, in six phrases a trader scans in a second. */
const HERO_CHIPS: { icon: LucideIcon; label: string }[] = [
  { icon: Link2, label: `Imports from ${BROKER_COUNT_PHRASE}` },
  { icon: Calendar, label: 'P&L calendar' },
  { icon: Gauge, label: 'Rule simulator' },
  { icon: Bot, label: 'AI trade review' },
  { icon: Lock, label: 'Read-only connections' },
  { icon: FileText, label: 'Monthly PDF report' },
];

/*
 * The everyday features, in one row of plain cards. Everything with something to show — the
 * calendar, the Performance panels, the simulator, the assistant — has its own section above;
 * these four are the ones whose whole description fits in a sentence.
 */
const EVERYDAY: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Pencil,
    title: 'Log a trade in seconds',
    body: 'Symbol, P/L, side, setup tags and notes. Tag your setups and the analytics tell you which ones pay.',
  },
  {
    icon: Cloud,
    title: 'Every device, one journal',
    body: 'Sign in and your journal follows you from desk to phone. Or stay local-only — your call.',
  },
  {
    icon: Share2,
    title: 'Share the month, not your login',
    body: 'Export a session, month or year as an image built for a story slot. You get a file; nothing is posted for you.',
  },
  {
    // The phone card that was here has a whole section of its own now (PhoneShowcase).
    icon: Download,
    title: 'Your data, in a file you own',
    body: 'One-click backup puts your entire journal in a file you keep. Export trades to CSV whenever you like.',
  },
];

/* How many broker logos fit in the bento card before it starts to look like a directory. */
const BROKERS_SHOWN = 8;

/**
 * The public home page.
 *
 * One column, centred, black. Every section opens with a headline set the same way and shows one
 * thing: the hero shows the calendar, the figure section shows one number, the showcase shows the
 * real Performance panels, the statement shows three phrases. Lime is spent on the primary button
 * and on a few words — see the public-site block in index.css for the palette and the reasoning.
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
  const heroRef = useRef<HTMLElement>(null);

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

  return (
    <div
      className="min-h-dvh bg-bg-primary text-text-primary overflow-x-hidden flex flex-col"
      onPointerMove={trackSpotlight}
    >
      <SiteBackdrop />
      <LandingNav onLaunch={onLaunch} onHome={onHome} onBrokers={onBrokers} onGuides={onGuides} onNavigate={onNavigate} />
      {/* Under the nav, not above it: a pill above the header left a dark band over the whole site
          with one small object floating in it. Here it sits at the top of the hero, where a pinned
          notice belongs, and the header stays the first thing on the page. */}
      <AnnouncementBar onConnectBroker={onConnectBroker ?? onLaunch} />
      <StickyCta watch={heroRef} label="Start for free" onClick={onLaunch} />

      {/* Hero: the headline over a skyline of bars, the product itself underneath. */}
      <section ref={heroRef} className="relative z-10 pt-20 md:pt-28 pb-6 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[560px] md:h-[680px]">
          <HeroBars />
        </div>
        <div className="relative max-w-[960px] mx-auto px-4 md:px-6 text-center">
          <h1 className="public-display text-[2.75rem] sm:text-6xl lg:text-[4.5rem]">
            Know what every trade is really costing you
          </h1>
          <p className="mt-6 text-lg md:text-xl text-text-secondary leading-relaxed max-w-2xl mx-auto">
            Trend Chasers is a trading journal. Import your fills from {BROKER_COUNT_PHRASE} —{' '}
            {SHORT_BROKER_EXAMPLES} and more — or log trades by hand, and see where the month went.
          </p>
          <div className="mt-9 flex flex-col items-center gap-4">
            <button type="button" onClick={onLaunch} className="btn-primary text-base px-8 py-4">
              Start journaling for $0
            </button>
            <a href="#month" className="public-link text-sm">
              See how it works
              <ChevronRight size={16} aria-hidden />
            </a>
          </div>
          {/* Scoped on purpose: the journal is free, the sync is not, and a line that says only
              "free" next to a broker list has earned chargebacks before. */}
          <p className="mt-5 text-xs text-text-secondary">
            Journal free, no card needed. Broker sync from ${price} a month.
          </p>
        </div>

        <ul className="relative mt-12 flex flex-wrap justify-center gap-2.5 max-w-[900px] mx-auto px-4" aria-label="What the journal does">
          {HERO_CHIPS.map(({ icon: Icon, label }) => (
            <li key={label} className="public-chip">
              <Icon size={15} className="text-accent" aria-hidden />
              {label}
            </li>
          ))}
        </ul>

        {/* The calendar, live, as the first thing under the fold — the product rather than a
            description of it. Compact on a phone, where the full month is too wide to read. */}
        <div id="month" className="relative mt-14 md:mt-20 max-w-[1120px] mx-auto px-4 md:px-6 scroll-mt-24">
          <FadeIn>
            <div className="device-frame">
              <div className="md:hidden">
                <DashboardPreview variant="compact" />
              </div>
              <div className="hidden md:block">
                <DashboardPreview />
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      <ProofStrip />

      {/*
       * One number. The founder's own Schwab journal, replayed by the rule simulator: the days he
       * placed eleven or more trades lost $496 on average, the days he placed one or two made $163.
       * It is the pitch for the whole product in a figure, so it gets the whole screen.
       */}
      <section id="simulator" className="relative z-10 py-24 md:py-36 text-center overflow-hidden scroll-mt-24">
        <div className="giant-glow" aria-hidden />
        <div className="relative max-w-[1000px] mx-auto px-4 md:px-6">
          <FadeIn>
            <p className="giant-figure" aria-hidden>
              $496
            </p>
            <h2 className="public-display mt-8 text-3xl sm:text-4xl md:text-5xl">
              Lost per day on the days one trader placed eleven or more trades. On his one‑ and
              two‑trade days, he made $163.
            </h2>
            <p className="mt-6 text-lg text-text-secondary leading-relaxed max-w-2xl mx-auto">
              Real figures from the founder&apos;s own journal. The rule simulator replays your trades
              against a cap you did not keep and finds the number that would have changed your month.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-x-8 gap-y-3">
              <a href="#rules" className="public-link">
                Try the simulator
                <ChevronRight size={16} aria-hidden />
              </a>
              <button type="button" onClick={onLaunch} className="public-link">
                Run it on your trades
                <ChevronRight size={16} aria-hidden />
              </button>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* The Performance screen's real panels, on sample data. */}
      <section id="performance" className="relative z-10 py-20 md:py-28 scroll-mt-24">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6">
          <FadeIn className="text-center max-w-3xl mx-auto mb-12 md:mb-16">
            <h2 className="public-display text-4xl md:text-5xl lg:text-[3.5rem]">See exactly where your P&amp;L goes</h2>
            <p className="mt-5 text-lg text-text-secondary leading-relaxed">
              Worked out from your broker&apos;s fills alone — no tagging, no typing. These are the
              journal&apos;s own panels, drawn from a sample journal; yours fill in from your trades.
            </p>
            {fromPlan('performanceAnalytics') && (
              <p className="mt-3 text-sm text-text-secondary">{fromPlan('performanceAnalytics')}</p>
            )}
          </FadeIn>
          <LazyOnView minHeight="420px">
            <ProductShowcase />
          </LazyOnView>
        </div>
      </section>

      {/* The statement. Three phrases, three lime words, nothing else on the screen. */}
      <section className="relative z-10 py-24 md:py-40">
        <FadeIn className="max-w-[1180px] mx-auto px-4 md:px-6 text-center">
          <p className="public-display text-[2.6rem] sm:text-6xl md:text-7xl lg:text-[5.75rem] leading-[0.98]">
            Find the setup that <span className="text-accent">bleeds</span>, the hour that{' '}
            <span className="text-accent">costs you</span>, and the habit worth{' '}
            <span className="text-accent">keeping</span>.
          </p>
        </FadeIn>
      </section>

      {/* Bento: the simulator, the assistant and the brokers, each in its own slab. */}
      <section id="features" className="relative z-10 pb-20 md:pb-28 scroll-mt-24">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 grid gap-4 md:gap-5 lg:grid-cols-6">
          <FadeIn className="lg:col-span-6">
            <article id="rules" className="public-card p-6 md:p-10 scroll-mt-24">
              <div className="max-w-2xl mb-8">
                <h3 className="public-display text-3xl md:text-4xl">What would a trade cap have saved you?</h3>
                <p className="mt-4 text-text-secondary leading-relaxed">
                  Your own trades, replayed against a limit you did not keep. Drag the cap and watch
                  the month change.
                  {fromPlan('ruleSimulator') && <span className="block mt-2 text-sm">{fromPlan('ruleSimulator')}</span>}
                </p>
              </div>
              <LazyOnView minHeight="380px">
                <RuleSimulatorDemo onTry={onLaunch} />
              </LazyOnView>
            </article>
          </FadeIn>

          <FadeIn className="lg:col-span-3" delay={60}>
            <article id="assistant" className="public-card p-6 md:p-10 h-full flex flex-col scroll-mt-24">
              <h3 className="public-display text-3xl md:text-4xl">Ask your journal what went wrong</h3>
              <p className="mt-4 text-text-secondary leading-relaxed max-w-xl">
                Your stats already know which setup is bleeding and which hour costs you money. Ask
                about them in plain English and get an answer that cites your own numbers — it
                reviews what you did, and never tells you what to trade next.
              </p>
              <div className="mt-8 flex-1">
                <AssistantDemo />
              </div>
            </article>
          </FadeIn>

          <FadeIn className="lg:col-span-3" delay={120}>
            <article id="brokers" className="public-card p-6 md:p-10 h-full flex flex-col scroll-mt-24">
              <h3 className="public-display text-3xl md:text-4xl">Connect once. Import whenever you want.</h3>
              <p className="mt-4 text-text-secondary leading-relaxed max-w-xl">
                Link {BROKER_COUNT_PHRASE} through SnapTrade, then press Sync and your round-trip
                trades land on the calendar. Your broker is only contacted when you ask.
              </p>
              <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {brokers.supported.slice(0, BROKERS_SHOWN).map((b) => (
                  <div
                    key={b.name}
                    className="rounded-2xl bg-black/60 border border-white/5 px-3 py-2.5 flex items-center min-w-0"
                  >
                    <BrokerLogo broker={brokerIdFromName(b.name)} compact />
                  </div>
                ))}
              </div>
              {/* #security stays on the page: the footer's Security link and the in-page scroll
                  handler both target it. */}
              <div id="security" className="mt-6 flex gap-3 text-sm text-text-secondary leading-relaxed scroll-mt-24">
                <Lock size={16} className="shrink-0 mt-0.5 text-accent" aria-hidden />
                <p>
                  Read-only, and never held by us. Your login goes to your broker or to SnapTrade&apos;s
                  portal, nothing can place a trade for you, and disconnecting stops the sync at once.
                </p>
              </div>
              <div className="mt-auto pt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
                <button type="button" onClick={onConnectBroker ?? onLaunch} className="btn-primary text-sm px-6 py-3">
                  Connect a broker
                </button>
                <button type="button" onClick={onBrokers} className="public-link text-sm">
                  All {brokers.supported.length} brokers
                  {brokers.comingSoon.length > 0 && ` and ${brokers.comingSoon.length} coming`}
                  <ChevronRight size={16} aria-hidden />
                </button>
              </div>
            </article>
          </FadeIn>
        </div>
      </section>

      {/* The journal on a phone. It is already an installable app; the page now shows it as one. */}
      <section id="mobile" className="relative z-10 py-20 md:py-28 overflow-hidden scroll-mt-24">
        <div className="max-w-[1200px] mx-auto px-4 md:px-6 grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
          <FadeIn className="text-center lg:text-left">
            <h2 className="public-display text-4xl md:text-5xl lg:text-[3.5rem]">Your journal, in your pocket</h2>
            <p className="mt-5 text-lg text-text-secondary leading-relaxed max-w-xl mx-auto lg:mx-0">
              Add Trend Chasers to your home screen and it opens like an app — full screen, its own
              icon, the same journal you keep at your desk. Sign in once and every trade follows you.
            </p>
            {/* Numbered because it is a sequence: three taps, in this order. */}
            <ol className="mt-8 space-y-3 text-left max-w-md mx-auto lg:mx-0">
              {[
                'Open trendchasers.net on your phone.',
                'iPhone: tap Share, then Add to Home Screen. Android: tap the menu, then Install app.',
                'Open it from your home screen and sign in — your journal is already there.',
              ].map((step, i) => (
                <li key={step} className="flex gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-black">
                    {i + 1}
                  </span>
                  <span className="pt-0.5 text-text-secondary leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
            <button type="button" onClick={onLaunch} className="btn-primary text-base px-8 py-4 mt-10">
              Open your journal
            </button>
          </FadeIn>
          <FadeIn delay={120}>
            <PhoneShowcase />
          </FadeIn>
        </div>
      </section>

      {/* The everyday features — four plain cards. */}
      <section className="relative z-10 pb-20 md:pb-28">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6">
          <FadeIn className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
            <h2 className="public-display text-4xl md:text-5xl">On your way to a disciplined month</h2>
          </FadeIn>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
            {EVERYDAY.map(({ icon: Icon, title, body }, i) => (
              <FadeIn key={title} delay={i * 60}>
                <article className="public-card spotlight p-6 md:p-7 h-full">
                  <Icon size={22} className="text-accent" aria-hidden />
                  <h3 className="mt-5 text-xl font-semibold leading-snug">{title}</h3>
                  <p className="mt-3 text-sm text-text-secondary leading-relaxed">{body}</p>
                </article>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* Guides */}
      <section id="guides" className="relative z-10 pb-20 md:pb-28 scroll-mt-24">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6">
          <FadeIn className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
            <h2 className="public-display text-4xl md:text-5xl">Learn the journal before you open it</h2>
            <p className="mt-4 text-text-secondary text-lg">
              How to track performance, read a P&amp;L calendar, and get the most out of broker sync.
            </p>
          </FadeIn>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
            {GUIDE_ARTICLES.map((guide, i) => (
              <FadeIn key={guide.slug} delay={i * 60}>
                <a
                  href={guide.path}
                  onClick={(e) => {
                    if (onGuide) {
                      e.preventDefault();
                      onGuide(guide.slug);
                    }
                  }}
                  className="public-card spotlight block p-6 h-full hover:border-white/20 transition-colors focus-ring"
                >
                  <h3 className="text-lg font-semibold leading-snug">{guide.title}</h3>
                  <p className="mt-3 text-sm text-text-secondary leading-relaxed">{guide.description}</p>
                  <span className="public-link mt-5 text-sm">
                    Read
                    <ChevronRight size={16} aria-hidden />
                  </span>
                </a>
              </FadeIn>
            ))}
          </div>
          {onGuides && (
            <div className="text-center mt-10">
              <button type="button" onClick={onGuides} className="btn-secondary text-sm px-6 py-3">
                All guides
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Where the people are. Two doors, one line each, nothing else. */}
      <section id="community" className="relative z-10 pb-20 md:pb-28 scroll-mt-24">
        <div className="max-w-[1000px] mx-auto px-4 md:px-6">
          <FadeIn className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
            <h2 className="public-display text-4xl md:text-5xl">Join the community</h2>
            <p className="mt-4 text-text-secondary text-lg">
              Other traders keeping a journal, and the person who builds this one.
            </p>
          </FadeIn>
          <div className="grid gap-4 md:gap-5 sm:grid-cols-2">
            {SOCIAL_LINKS.map((s, i) => (
              <FadeIn key={s.id} delay={i * 60}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="public-card spotlight group flex h-full items-start gap-4 p-6 md:p-7 hover:border-white/20 transition-colors focus-ring"
                >
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-black">
                    {s.id === 'x' ? <XIcon size={20} /> : <DiscordIcon size={22} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xl font-semibold leading-snug">
                      {s.id === 'x' ? `${s.name} · ${X_HANDLE}` : s.name}
                    </span>
                    <span className="mt-2 block text-sm leading-relaxed text-text-secondary">{s.blurb}</span>
                    <span className="public-link mt-4 text-sm">
                      Open {s.name}
                      <ChevronRight size={16} aria-hidden />
                    </span>
                  </span>
                </a>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="relative z-10 pb-20 md:pb-28 scroll-mt-24">
        <LandingFaq />
      </section>

      {/* The close. */}
      <section className="relative z-10 py-24 md:py-36 overflow-hidden">
        <div className="giant-glow opacity-60" aria-hidden />
        <FadeIn className="relative max-w-3xl mx-auto px-4 md:px-6 text-center">
          {/* Sized to the headline under it: at 40px the mark was a speck over 60px type. */}
          <div className="flex justify-center mb-8 md:mb-10">
            <img
              src="/logo-mark.svg"
              alt=""
              aria-hidden
              className="h-24 w-24 md:h-32 md:w-32 object-contain drop-shadow-[0_12px_40px_rgba(var(--color-accent-rgb),0.35)]"
            />
          </div>
          <h2 className="public-display text-4xl sm:text-5xl md:text-6xl">Start journaling confidently</h2>
          <p className="mt-6 text-lg text-text-secondary leading-relaxed">
            Open your journal and log this month&apos;s trades yourself, free and with no card, or
            connect a broker and let them import themselves.
          </p>
          <button type="button" onClick={onLaunch} className="btn-primary text-base px-8 py-4 mt-10">
            Open Trend Chasers
          </button>
        </FadeIn>
      </section>

      <LandingFooter onPrivacy={onPrivacy} onTerms={onTerms} onBrokers={onBrokers} onGuides={onGuides} onGuide={onGuide} onNavigate={onNavigate} onLaunch={onLaunch} />
    </div>
  );
}
