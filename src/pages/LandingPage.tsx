import { useEffect, useState } from 'react';
import {
  BarChart3,
  Calendar,
  Check,
  Cloud,
  Link2,
  Lock,
  Pencil,
  Trophy,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { AnnouncementBar } from '../components/landing/AnnouncementBar';
import { DashboardPreview } from '../components/landing/DashboardPreview';
import { LandingFooter, LandingNav } from '../components/landing/LandingFooter';
import { FadeIn } from '../components/motion/FadeIn';
import { Starfield } from '../components/Starfield';
import { brokerIdFromName, BrokerLogo } from '../components/brokers/BrokerLogo';
import { COMING_SOON_BROKERS, SUPPORTED_BROKERS } from '../data/brokers';
import {
  BROKER_COUNT_PHRASE,
  BROKER_EXAMPLES,
  SHORT_BROKER_EXAMPLES,
} from '../data/brokerCopy';
import { LANDING_FAQ } from '../seo/faq';
import { GUIDE_ARTICLES } from '../seo/guides';
import { fetchBrokersConfig, type BrokerConfig } from '../services/brokersConfig';
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

const FEATURES: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: Calendar,
    title: 'P&L Calendar',
    description:
      'See your month at a glance — green days for profit, red for loss. Click any day to import trades or drill into that session.',
  },
  {
    icon: Link2,
    title: 'Broker Sync',
    description:
      `Connect any of ${BROKER_COUNT_PHRASE} and let round-trip trades sync in automatically — read-only, disconnect anytime.`,
  },
  {
    icon: Pencil,
    title: 'Manual Trade Entry',
    description:
      'Log a trade in seconds — symbol, P/L, side, setup tags, and notes. Tag your setups so the analytics can tell you which ones actually pay.',
  },
  {
    icon: BarChart3,
    title: 'Trading Insights',
    description:
      'Win rate, profit factor, and expectancy — plus streak tracking, your best and worst days, and which symbols are making or costing you money.',
  },
  {
    icon: Cloud,
    title: 'Optional Cloud Sync',
    description:
      'Sign in with Google or email to sync across devices — or stay local-only. One-click backup puts your entire journal in a file you own.',
  },
  {
    icon: Trophy,
    title: 'Leaderboard & Share Cards',
    description:
      'Opt in to a public leaderboard ranked by profit, consistency, or risk management — or keep it private and just export a share card of your month.',
  },
];

const FAQ = LANDING_FAQ.map((item) => ({ q: item.question, a: item.answer }));

const STEPS = [
  { n: '01', title: 'Connect or log', body: `Sync ${BROKER_COUNT_PHRASE} automatically, or enter trades manually — get your data into the journal in seconds.` },
  { n: '02', title: 'Review on calendar', body: 'Daily P&L colors show winning and losing sessions at a glance.' },
  { n: '03', title: 'Analyze your edge', body: 'See which setups pay and which bleed — streaks, expectancy, and your best and worst days.' },
];

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

  return (
    <div className="min-h-dvh bg-bg-primary text-text-primary overflow-x-hidden flex flex-col">
      {/* reactive={false}: the landing page keeps its fixed emerald/blue brand look regardless of
          which Theme accent a signed-in user has picked in Settings — same reasoning as the logo. */}
      <Starfield reactive={false} />
      <div className="landing-grid pointer-events-none fixed inset-0" aria-hidden />
      <AnnouncementBar />
      <LandingNav onLaunch={onLaunch} onHome={onHome} onBrokers={onBrokers} onGuides={onGuides} onNavigate={onNavigate} />

      {/* Hero */}
      <section className="relative z-10 max-w-[1680px] mx-auto px-4 md:px-6 pt-12 md:pt-20 pb-16 md:pb-20">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          <FadeIn>
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs font-medium mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {BROKER_COUNT_PHRASE} now sync automatically
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-[3.25rem] font-bold leading-[1.1] tracking-tight">
              <span className="text-gradient-brand">Trend Chasers</span>
              {' — '}the trading journal built for{' '}
              <span className="text-gradient-brand">how you actually trade</span>
            </h1>
            <p className="mt-5 text-base md:text-lg text-text-secondary leading-relaxed max-w-xl">
              Track daily P&L on a visual calendar. Connect {BROKER_COUNT_PHRASE} — {SHORT_BROKER_EXAMPLES}{' '}
              and more — for automatic sync, or log trades manually. Nothing is forced, and you can
              switch anytime.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <button type="button" onClick={onLaunch} className="btn-primary text-base px-7 py-3.5">
                Start journaling free
              </button>
              <button type="button" onClick={onBrokers} className="btn-secondary text-base px-7 py-3.5">
                See supported brokers
              </button>
            </div>
            <p className="mt-3 text-xs text-text-secondary">
              No signup needed to try it — your journal stays in your browser until you choose to sync.
            </p>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-text-secondary">
              {/* Says what's free and what isn't. "Free — no credit card" sitting next to "broker
                  sync" read as though the sync were free too, which stopped being true the day
                  plans shipped — and a pricing surprise after signup is how you earn a chargeback. */}
              {['Journal free — no credit card', 'Broker sync from $5/month', 'Read-only broker connections'].map((item) => (
                <span key={item} className="flex items-center gap-2">
                  <Check size={14} className="text-emerald-400" />
                  {item}
                </span>
              ))}
            </div>
          </div>
          </FadeIn>
          <FadeIn delay={120}>
          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-to-br from-emerald-500/20 via-transparent to-cyan-500/20 rounded-3xl blur-2xl" />
            <DashboardPreview />
          </div>
          </FadeIn>
        </div>
      </section>

      {/* Security callout */}
      <section id="security" className="relative z-10 border-y border-border/50 bg-emerald-500/5 py-10 md:py-12">
        <FadeIn className="max-w-[1680px] mx-auto px-4 md:px-6">
          <div className="glass-card rounded-2xl p-6 md:p-8 flex flex-col md:flex-row gap-6 md:gap-10 items-start md:items-center">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <Lock size={22} className="text-emerald-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl md:text-2xl font-bold mb-2">Connecting is optional, and never held by us</h2>
              <p className="text-text-secondary leading-relaxed">
                Broker sync is entirely opt-in — plenty of traders just log trades manually and never connect
                anything. If you do connect one of the {BROKER_COUNT_PHRASE} we support, your credentials go
                to your broker or to SnapTrade&apos;s secure connection portal, never to Trend Chasers&apos;
                servers. Connections are read-only by default, and you can disconnect at any time from
                the app.
              </p>
            </div>
          </div>
        </FadeIn>
      </section>

      {/* Broker Sync */}
      <section className="relative z-10 py-16 md:py-24">
        <div className="max-w-[1680px] mx-auto px-4 md:px-6">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <FadeIn>
            <div>
              <p className="text-xs uppercase tracking-widest text-cyan-400 font-medium mb-3">Broker Sync</p>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
                Connect once. Trades sync automatically.
              </h2>
              <p className="text-text-secondary leading-relaxed mb-6">
                Link any of {BROKER_COUNT_PHRASE} — {BROKER_EXAMPLES} and more — through SnapTrade, a
                broker-data connection provider, and your round-trip trades sync straight to your
                calendar. It&apos;s entirely optional — manual entry works just as well if you&apos;d rather
                keep everything separate.
              </p>
              <ul className="space-y-3 text-sm text-text-secondary">
                {[
                  'Read-only by default — nothing can place trades on your behalf',
                  'Your login goes to your broker or SnapTrade, never to Trend Chasers',
                  'Disconnect anytime from Settings — sync stops immediately',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="text-emerald-400 mt-0.5">→</span>
                    {item}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={onConnectBroker ?? onLaunch}
                className="btn-primary text-sm px-6 py-2.5 mt-6"
              >
                Connect a broker
              </button>
            </div>
            </FadeIn>
            <FadeIn delay={100}>
            <div className="glass-card rounded-2xl p-6 md:p-8 glow-border-brand">
              <p className="text-xs uppercase tracking-widest text-text-secondary mb-4">How broker sync works</p>
              <ol className="space-y-4">
                {[
                  { step: '1', text: `Pick your broker from ${BROKER_COUNT_PHRASE} and approve a read-only connection on their site` },
                  { step: '2', text: 'Trend Chasers pulls your recent activity and matches opens to closes' },
                  { step: '3', text: 'Open the journal and it refreshes itself — new trades appear on your calendar, ready to tag' },
                ].map((s) => (
                  <li key={s.step} className="flex gap-4">
                    <span className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center font-bold text-sm shrink-0">
                      {s.step}
                    </span>
                    <p className="text-sm text-text-secondary pt-1">{s.text}</p>
                  </li>
                ))}
              </ol>
            </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* Brokers teaser */}
      <section id="brokers" className="relative z-10 border-t border-border/50 bg-bg-secondary/30 py-16 md:py-24">
        <div className="max-w-[1680px] mx-auto px-4 md:px-6">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
            <FadeIn>
              <div>
                <p className="text-xs uppercase tracking-widest text-emerald-400 font-medium mb-3">Brokers</p>
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
                  Connect your broker, sync in seconds
                </h2>
                <p className="text-text-secondary leading-relaxed mb-6 max-w-md">
                  {BROKER_COUNT_PHRASE} sync automatically today, with thinkorswim covered through your
                  Schwab connection. More are on the way — and manual entry works for any broker in the
                  meantime.
                </p>
                <div className="flex flex-wrap gap-x-6 gap-y-2 mb-8 text-sm">
                  {[
                    { name: 'Thinkorswim journal guide', path: '/brokers/thinkorswim' },
                    { name: 'Schwab journal guide', path: '/brokers/charles-schwab' },
                    { name: 'Robinhood journal guide', path: '/brokers/robinhood' },
                  ].map((link) => (
                    <a key={link.path} href={link.path} className="text-emerald-400 hover:underline">
                      {link.name} →
                    </a>
                  ))}
                </div>
                <button type="button" onClick={onBrokers} className="btn-secondary px-8 py-3">
                  View all supported brokers →
                </button>
              </div>
            </FadeIn>
            <FadeIn delay={100}>
              <div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 md:gap-2.5 mb-6">
                  {brokers.supported.map((b) => (
                    <div
                      key={b.name}
                      className="rounded-lg border border-border/60 bg-bg-primary/60 px-3 py-2.5 flex items-center hover:border-emerald-500/40 transition-colors min-w-0"
                    >
                      <BrokerLogo broker={brokerIdFromName(b.name)} />
                    </div>
                  ))}
                </div>
                {brokers.comingSoon.length > 0 && (
                  <>
                    <p className="text-xs uppercase tracking-widest text-text-secondary mb-3">Coming soon</p>
                    <div className="flex flex-wrap gap-2">
                      {brokers.comingSoon.map((name) => (
                        <span
                          key={name}
                          className="px-3 py-1.5 rounded-full text-xs border border-border/60 text-text-secondary bg-bg-primary/50"
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* Trading assistant */}
      <section id="assistant" className="relative z-10 border-t border-border/50 py-16 md:py-24">
        <div className="max-w-[1680px] mx-auto px-4 md:px-6">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
            <FadeIn>
              <div>
                <p className="text-xs uppercase tracking-widest text-cyan-400 font-medium mb-3">
                  Trading Assistant
                </p>
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
                  Ask your journal what went wrong
                </h2>
                <p className="text-text-secondary leading-relaxed mb-6 max-w-md">
                  Your stats already know which setup is bleeding and which hour of the day costs
                  you money. Now you can ask about them in plain English — and get an answer that
                  cites your own numbers.
                </p>
                <ul className="space-y-3 text-sm text-text-secondary mb-8">
                  {[
                    'Reads the stats your journal already computed — its numbers always match your dashboard',
                    'Reviews what you actually did; it won’t tell you what to trade next',
                    'Says when a sample is too small to mean anything',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <span className="text-emerald-400 mt-0.5">→</span>
                      {item}
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={onLaunch} className="btn-primary text-sm px-6 py-2.5">
                  Open your journal
                </button>
              </div>
            </FadeIn>

            <FadeIn delay={100}>
              <div className="glass-card rounded-2xl p-5 md:p-6 glow-border-brand">
                <p className="text-xs uppercase tracking-widest text-text-secondary mb-4">
                  Questions it asks you first
                </p>
                <div className="flex flex-wrap gap-2 mb-5">
                  {[
                    'Why is FOMO losing?',
                    'What happens when I trade the open?',
                    'Am I exiting winners too early?',
                    'Is my win rate good enough?',
                  ].map((q) => (
                    <span
                      key={q}
                      className="text-xs px-3 py-1.5 rounded-full border border-border/60 text-text-secondary"
                    >
                      {q}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-text-secondary leading-relaxed border-t border-border/50 pt-4">
                  Those aren&apos;t examples — they&apos;re built from whatever is actually in your
                  journal. A trader whose losses cluster at the open gets asked about the open.
                </p>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 py-16 md:py-24">
        <div className="max-w-[1680px] mx-auto px-4 md:px-6">
          <FadeIn className="text-center max-w-2xl mx-auto mb-12 md:mb-16">
            <p className="text-xs uppercase tracking-widest text-emerald-400 font-medium mb-3">Features</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Everything you need to review your edge</h2>
            <p className="mt-4 text-text-secondary">
              Built for active traders who want clarity — not another spreadsheet.
            </p>
          </FadeIn>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
              <FadeIn key={f.title} delay={i * 60}>
              <article
                className="glass-card rounded-xl p-5 md:p-6 hover:border-emerald-500/30 transition-colors group h-full"
              >
                <div className="w-10 h-10 rounded-lg bg-bg-primary/80 border border-border/60 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform text-emerald-400">
                  <Icon size={20} />
                </div>
                <h3 className="text-base font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-text-secondary leading-relaxed">{f.description}</p>
              </article>
              </FadeIn>
              );
            })}
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section className="relative z-10 border-t border-border/50 bg-bg-secondary/20 py-16 md:py-24">
        <div className="max-w-[1680px] mx-auto px-4 md:px-6">
          <FadeIn className="text-center max-w-2xl mx-auto mb-12">
            <p className="text-xs uppercase tracking-widest text-cyan-400 font-medium mb-3">Workflow</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Three steps to clarity</h2>
          </FadeIn>
          <div className="grid md:grid-cols-3 gap-6">
            {STEPS.map((step, i) => (
              <FadeIn key={step.n} delay={i * 80}>
              <div className="glass-card rounded-xl p-6 md:p-7 h-full">
                <span className="text-4xl font-bold text-gradient-brand opacity-80">{step.n}</span>
                <h3 className="text-lg font-semibold mt-3 mb-2">{step.title}</h3>
                <p className="text-sm text-text-secondary leading-relaxed">{step.body}</p>
              </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* Guides */}
      <section id="guides" className="relative z-10 border-t border-border/50 bg-bg-secondary/20 py-16 md:py-24">
        <div className="max-w-[1680px] mx-auto px-4 md:px-6">
          <FadeIn className="text-center max-w-2xl mx-auto mb-10">
            <p className="text-xs uppercase tracking-widest text-cyan-400 font-medium mb-3">Guides</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Free trading journal resources</h2>
            <p className="mt-3 text-text-secondary text-sm md:text-base">
              Learn how to track performance, use a P&L calendar, and get the most out of broker sync.
            </p>
          </FadeIn>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                  className="block glass-card rounded-xl p-5 h-full hover:border-emerald-500/30 transition-colors"
                >
                  <h3 className="font-semibold text-base mb-2">{guide.title}</h3>
                  <p className="text-sm text-text-secondary leading-relaxed">{guide.description}</p>
                </a>
              </FadeIn>
            ))}
          </div>
          {onGuides && (
            <div className="text-center mt-8">
              <button type="button" onClick={onGuides} className="btn-secondary text-sm px-5 py-2.5">
                View all guides
              </button>
            </div>
          )}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="relative z-10 py-16 md:py-24">
        <div className="max-w-3xl mx-auto px-4 md:px-6">
          <FadeIn className="text-center mb-12">
            <p className="text-xs uppercase tracking-widest text-emerald-400 font-medium mb-3">FAQ</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Common questions</h2>
          </FadeIn>
          <div className="space-y-4">
            {FAQ.map((item, i) => (
              <FadeIn key={item.q} delay={i * 50}>
              <details className="glass-card rounded-xl group">
                <summary className="px-5 py-4 cursor-pointer font-medium text-sm md:text-base list-none flex items-center justify-between gap-4">
                  {item.q}
                  <span className="text-text-secondary group-open:rotate-45 transition-transform text-lg">+</span>
                </summary>
                <p className="px-5 pb-4 text-sm text-text-secondary leading-relaxed">{item.a}</p>
              </details>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 border-t border-border/50 py-16 md:py-24">
        <FadeIn className="max-w-3xl mx-auto px-4 md:px-6 text-center">
          <div className="sm:hidden flex justify-center mb-6">
            <BrandLogo size="md" variant="compact" />
          </div>
          <div className="hidden sm:flex justify-center mb-8">
            <BrandLogo size="lg" variant="full" />
          </div>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mt-8">Ready to track your edge?</h2>
          <p className="mt-4 text-text-secondary text-base md:text-lg">
            Open your journal, connect a broker or log this month&apos;s trades yourself, and see your
            performance on the calendar. No credit card. Just your data, your way.
          </p>
          <button type="button" onClick={onLaunch} className="btn-primary text-base px-8 py-3.5 mt-8">
            Open Trend Chasers
          </button>
        </FadeIn>
      </section>

      <LandingFooter onPrivacy={onPrivacy} onTerms={onTerms} onBrokers={onBrokers} onGuides={onGuides} onGuide={onGuide} onNavigate={onNavigate} onLaunch={onLaunch} />
    </div>
  );
}
