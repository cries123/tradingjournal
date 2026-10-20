import { ChartCandlestick, CheckCircle2, Clock, FlaskConical, Info, MousePointerClick } from 'lucide-react';
import { LandingFooter, LandingNav } from '../components/landing/LandingFooter';
import { FadeIn } from '../components/motion/FadeIn';
import { SiteBackdrop } from '../components/landing/SiteBackdrop';
import { shot } from '../components/landing/landingShots';
import { lowestTierWith, TIER_PLANS } from '../config/tiers';
import { hasTrial, TRIAL_DAYS } from '../config/trial';
import { STRATEGY_NAMES } from '../utils/replayStrategies';
import { STUDY_NAMES } from '../utils/replayStudies';
import type { ExtraNavRoute } from '../hooks/useRoute';

/**
 * Market replay's own page, where the "Market Simulator — coming soon" placeholder used to be.
 *
 * Every claim here is something the replay screen does today. The study and strategy names are read
 * from the modules the chart uses, the plan and price from the tier table, and the limits section is
 * the replay's real constraints in plain words: next-day data (the license), SPX drawn as SPY, and
 * estimated fill times for brokers that send none. A feature page that leaves those out gets found
 * out on the first day somebody uses it.
 */

const CHART = [
  'The contracts you traded that day, plus any strike you pick',
  'The stock or ETF under them on its own chart',
  '1, 5 and 15-minute candles, or Heikin Ashi',
  'Zoom, fit the whole session, and full screen',
  'Play at 1× to 10×, step one candle at a time, or click a candle to start there',
];

/** A menu label as it reads mid-sentence: "Opening range" becomes "opening range", "VWAP cross" stays. */
function inSentence(label: string): string {
  const first = label.split(' ')[0];
  return first === first.toUpperCase() || label === 'Bollinger Bands' ? label : label[0].toLowerCase() + label.slice(1);
}

function listOf(items: string[], joiner: 'and' | 'or'): string {
  return items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} ${joiner} ${items[items.length - 1]}`;
}

interface MarketReplayPageProps {
  onHome: () => void;
  onLaunch: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
  onBrokers?: () => void;
  onGuides?: () => void;
  onNavigate?: (route: ExtraNavRoute) => void;
}

export function MarketReplayPage({ onHome, onLaunch, onPrivacy, onTerms, onBrokers, onGuides, onNavigate }: MarketReplayPageProps) {
  const tier = lowestTierWith('marketReplay') ?? 'diamond';
  const plan = TIER_PLANS[tier];
  const trial = hasTrial(tier);
  const image = shot('shot-replay.webp');
  // Two EMAs are one name on this page; the chart offers two because people run a fast and a slow one.
  const studies = listOf([...new Set(Object.values(STUDY_NAMES))].map(inSentence), 'and');
  const strategies = listOf(Object.values(STRATEGY_NAMES).map(inSentence), 'or');

  return (
    <div className="min-h-dvh bg-bg-primary text-text-primary overflow-x-hidden flex flex-col">
      <SiteBackdrop />
      <LandingNav onLaunch={onLaunch} onHome={onHome} onBrokers={onBrokers} onGuides={onGuides} onNavigate={onNavigate} />

      <main className="relative z-10 flex-1">
        {/* Hero */}
        <section className="max-w-[1100px] mx-auto px-4 md:px-6 pt-12 md:pt-20 pb-10 md:pb-14">
          <FadeIn>
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-accent/30 bg-accent/10 text-accent text-xs font-medium mb-6">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse motion-reduce:animate-none" />
                New on {plan.name}
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-[3.25rem] font-bold leading-[1.1] tracking-tight">
                Replay the days you traded, one candle at a time
              </h1>
              <p className="mt-5 text-base md:text-lg text-text-secondary leading-relaxed max-w-2xl">
                Open any day in your journal and the market plays back minute by minute, with your own trades on the chart. Pause where
                you got in, see what happened next, and take the trade again with practice orders. The candles you haven&apos;t
                reached stay hidden until the replay gets there.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <button type="button" onClick={onLaunch} className="btn-primary text-base px-7 py-3.5">
                  Open your journal
                </button>
                <button type="button" onClick={() => onNavigate?.('pricing')} className="btn-secondary text-base px-7 py-3.5">
                  See plans
                </button>
              </div>
            </div>
          </FadeIn>
        </section>

        {/* The screen itself */}
        <section className="max-w-[1100px] mx-auto px-4 md:px-6 pb-12 md:pb-16">
          <FadeIn>
            <figure>
              <img
                src={image.src}
                width={image.width}
                height={image.height}
                alt="The market replay chart partway through a session: candles up to 11:14, two moving averages, VWAP and the opening range, a hand-drawn trend line and zone, and practice buy and sell markers."
                className="w-full h-auto rounded-2xl border border-white/[0.08] shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
                loading="eager"
                decoding="async"
              />
              <figcaption className="mt-3 text-xs text-text-secondary/80">
                A sample session, partway through. Everything right of the last candle hasn&apos;t been played yet.
              </figcaption>
            </figure>
          </FadeIn>
        </section>

        {/* What is on the chart */}
        <section className="max-w-[1100px] mx-auto px-4 md:px-6 py-12 md:py-16 border-t border-border/40">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-start">
            <FadeIn>
              <div>
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">A real chart, not a slideshow</h2>
                <p className="text-text-secondary leading-relaxed mb-6">
                  Minute bars for the exact contracts you traded, drawn on the open-source charting library from TradingView, with the
                  tools you&apos;d reach for on a live chart.
                </p>
                <ul className="space-y-3">
                  {CHART.map((item) => (
                    <li key={item} className="flex gap-3 text-sm text-text-secondary leading-relaxed">
                      <CheckCircle2 className="h-4 w-4 text-accent shrink-0 mt-0.5" aria-hidden />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </FadeIn>

            <FadeIn delay={100}>
              <div className="grid gap-4">
                <div className="glass-card rounded-xl p-5 md:p-6">
                  <h3 className="text-lg font-semibold mb-2">Indicators</h3>
                  <p className="text-sm text-text-secondary leading-relaxed">
                    {studies.replace(/^./, (c) => c.toUpperCase())}. Standard settings to start, yours to change, and each value
                    in the legend as the crosshair moves.
                  </p>
                </div>
                <div className="glass-card rounded-xl p-5 md:p-6">
                  <h3 className="text-lg font-semibold mb-2">Drawing tools</h3>
                  <p className="text-sm text-text-secondary leading-relaxed">
                    Trend lines, horizontal levels and zones, with undo. They stay on that contract&apos;s chart for that day, so the
                    levels you marked are there when you come back.
                  </p>
                </div>
              </div>
            </FadeIn>
          </div>
        </section>

        {/* Practice and test */}
        <section className="max-w-[1100px] mx-auto px-4 md:px-6 py-12 md:py-16 border-t border-border/40">
          <div className="grid md:grid-cols-2 gap-5">
            <FadeIn>
              <div className="glass-card rounded-2xl p-6 md:p-8 h-full">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 border border-accent/30 mb-5">
                  <MousePointerClick className="h-5 w-5 text-accent" aria-hidden />
                </span>
                <h2 className="text-2xl font-bold tracking-tight mb-3">Take the trade again</h2>
                <p className="text-text-secondary leading-relaxed">
                  Buy, sell and close as the session plays, with open and closed P&amp;L as you go. Practice orders fill at the close of
                  the candle on screen, carry no commission, and never touch your journal.
                </p>
              </div>
            </FadeIn>
            <FadeIn delay={80}>
              <div className="glass-card rounded-2xl p-6 md:p-8 h-full">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 border border-accent/30 mb-5">
                  <FlaskConical className="h-5 w-5 text-accent" aria-hidden />
                </span>
                <h2 className="text-2xl font-bold tracking-tight mb-3">Test a rule on the day</h2>
                <p className="text-text-secondary leading-relaxed">
                  Run an {strategies} over the session, long only or both ways, and see the net, win rate and largest drawdown with
                  every entry marked on the chart. It only sees the candles the replay has shown. It tests a rule on one past day; it
                  never tells you what to trade next.
                </p>
              </div>
            </FadeIn>
          </div>
        </section>

        {/* The limits, said plainly */}
        <section className="max-w-[1100px] mx-auto px-4 md:px-6 py-12 md:py-16 border-t border-border/40">
          <FadeIn>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-8">Where the data comes from</h2>
          </FadeIn>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              {
                icon: Clock,
                title: 'The trading day after',
                body: 'One-minute bars from OPRA, the options tape, and the US stock exchanges. A session opens for replay the trading day after it closes. That is the license that keeps it affordable: same-day options data carries the exchanges’ real-time fees.',
              },
              {
                icon: ChartCandlestick,
                title: 'Indexes drawn as their ETFs',
                body: 'Index values carry their own license, so SPX is drawn as SPY, NDX as QQQ and RUT as IWM. Only the chart underneath changes: the SPX options you traded keep their real prices.',
              },
              {
                icon: Info,
                title: 'Fill times, when your broker has none',
                body: 'Schwab sends the day of a trade but not the minute. For those trades the chart shades the candles your fill price traded through, labeled as an estimate, rather than inventing a time.',
              },
            ].map(({ icon: Icon, title, body }, i) => (
              <FadeIn key={title} delay={i * 60}>
                <div className="h-full rounded-xl border border-border/60 p-5 md:p-6">
                  <Icon className="h-5 w-5 text-text-secondary mb-4" aria-hidden />
                  <h3 className="text-base font-semibold mb-2">{title}</h3>
                  <p className="text-sm text-text-secondary leading-relaxed">{body}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </section>

        {/* Plan + CTA */}
        <section className="max-w-[1100px] mx-auto px-4 md:px-6 py-12 md:py-20 border-t border-border/40">
          <FadeIn>
            <div className="text-center max-w-2xl mx-auto">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent mb-5">
                <ChartCandlestick className="h-6 w-6" aria-hidden />
              </span>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Included on {plan.name}</h2>
              <p className="text-text-secondary leading-relaxed mb-8">
                ${plan.price} a month
                {trial ? `, and the first ${TRIAL_DAYS} days are free.` : '.'}
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <button type="button" onClick={onLaunch} className="btn-primary text-base px-7 py-3.5">
                  Open your journal
                </button>
                <button type="button" onClick={() => onNavigate?.('pricing')} className="btn-secondary text-base px-7 py-3.5">
                  Compare plans
                </button>
              </div>
            </div>
          </FadeIn>
        </section>
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
