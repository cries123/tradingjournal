import {
  Ban,
  Calculator,
  CheckCircle2,
  Clock,
  GitCompareArrows,
  Lock,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import { LandingFooter, LandingNav } from '../components/landing/LandingFooter';
import { FadeIn } from '../components/motion/FadeIn';
import { TIER_PLANS } from '../config/tiers';
import type { ExtraNavRoute } from '../hooks/useRoute';

/**
 * The Trading Assistant's own page.
 *
 * It used to be the generic ComingSoonPage with the eyebrow overridden to "Now live" — a
 * construction-barrier icon and one paragraph, for a feature people pay for. Everything on this
 * page is a claim the product actually keeps: the questions are the ones the assistant offers as
 * buttons (src/utils/journalFacts.ts), the limits come from the tier table rather than being
 * written down twice, and the "won't" list is its system prompt restated rather than reassurance.
 */

/** Taken from suggestedQuestions — these are literally the prompts the panel offers. */
const QUESTIONS = [
  'Why do I hold losers longer?',
  'Are my trade grades wrong?',
  'Does my checklist actually help?',
  'Why is my ORB setup losing?',
  'What happens when I trade the open?',
  'Am I exiting winners too early?',
  'Is my win rate good enough?',
  'Review my whole period',
];

/** Every block of JournalFacts, in the words a trader would use for it. */
const SEES = [
  'Every setup and symbol, ranked by what it made and lost',
  'Time of day, and which session gives back what the others make',
  'Weekday, direction, and how long you hold winners versus losers',
  'How much of each winner’s peak you actually banked, and the heat you took to get it',
  'Your own A–F grades, against what those trades were really worth',
  'Whether the trades that met your checklist did better than the ones that didn’t',
  'Days you broke limits you set for yourself',
  'Commissions and fees, next to the net they came out of',
];

const WONT = [
  'Recommend a trade, an entry, an exit, a size, or a security',
  'Predict where the market is going',
  'Call three trades a pattern — it says the sample is thin instead',
  'Quote a number that isn’t already in your journal',
];

interface AiAssistantPageProps {
  onHome: () => void;
  onLaunch: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
  onBrokers?: () => void;
  onGuides?: () => void;
  onNavigate?: (route: ExtraNavRoute) => void;
}

export function AiAssistantPage({
  onHome,
  onLaunch,
  onPrivacy,
  onTerms,
  onBrokers,
  onGuides,
  onNavigate,
}: AiAssistantPageProps) {
  const gold = TIER_PLANS.gold;
  const diamond = TIER_PLANS.diamond;

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

      <main className="relative z-10 flex-1">
        {/* Hero */}
        <section className="max-w-[1100px] mx-auto px-4 md:px-6 pt-12 md:pt-20 pb-12 md:pb-16">
          <FadeIn>
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs font-medium mb-6">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse motion-reduce:animate-none" />
                Now live on {gold.name} and {diamond.name}
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-[3.25rem] font-bold leading-[1.1] tracking-tight">
                Ask your journal{' '}
                <span className="text-gradient-brand">why</span>
              </h1>
              <p className="mt-5 text-base md:text-lg text-text-secondary leading-relaxed max-w-2xl">
                Your dashboard tells you what happened. The assistant tells you what it means — reading
                the same numbers your journal already computed, so what it says can never contradict
                what you are looking at. It reviews the trades you actually took. It will not tell you
                what to trade next.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <button type="button" onClick={onLaunch} className="btn-primary text-base px-7 py-3.5">
                  Open your journal
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate?.('pricing')}
                  className="btn-secondary text-base px-7 py-3.5"
                >
                  See plans
                </button>
              </div>
            </div>
          </FadeIn>
        </section>

        {/* The real questions */}
        <section className="max-w-[1100px] mx-auto px-4 md:px-6 py-12 md:py-16 border-t border-border/40">
          <FadeIn>
            <p className="text-xs uppercase tracking-widest text-emerald-400 font-medium mb-3">Ask it anything</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
              The questions you’d ask a coach who read every trade
            </h2>
            <p className="text-text-secondary leading-relaxed max-w-2xl mb-8">
              These aren’t examples we made up for this page — they’re the prompts the assistant offers
              you, generated from what your own journal shows. Or type your own.
            </p>
          </FadeIn>
          <FadeIn delay={80}>
            <div className="flex flex-wrap gap-2.5">
              {QUESTIONS.map((q) => (
                <span
                  key={q}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-bg-tertiary/40 px-4 py-2 text-sm text-text-primary"
                >
                  <MessageSquare className="h-3.5 w-3.5 text-emerald-400 shrink-0" aria-hidden />
                  {q}
                </span>
              ))}
            </div>
          </FadeIn>
        </section>

        {/* Why the numbers agree */}
        <section className="max-w-[1100px] mx-auto px-4 md:px-6 py-12 md:py-16 border-t border-border/40">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-start">
            <FadeIn>
              <div>
                <p className="text-xs uppercase tracking-widest text-emerald-400 font-medium mb-3">How it works</p>
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
                  It explains your numbers. It never does the arithmetic.
                </h2>
                <p className="text-text-secondary leading-relaxed mb-6">
                  A journal that reports one P&amp;L and an assistant that reports another is worse than
                  no assistant at all. So the split is strict: your journal computes every figure — the
                  same code that draws your calendar — and the model’s only job is to decide which of
                  them matters and say what to do about it.
                </p>
                <div className="glass-card rounded-xl p-5 md:p-6 flex gap-4">
                  <span className="w-10 h-10 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
                    <Calculator className="h-5 w-5 text-emerald-400" aria-hidden />
                  </span>
                  <p className="text-sm text-text-secondary leading-relaxed">
                    If it quotes you a figure, that figure came from your journal. It cannot invent one,
                    and it cannot quietly round your losing month into a better one.
                  </p>
                </div>
              </div>
            </FadeIn>

            <FadeIn delay={100}>
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-widest text-text-secondary mb-4">
                  What it can see
                </h3>
                <ul className="space-y-3">
                  {SEES.map((item) => (
                    <li key={item} className="flex gap-3 text-sm text-text-secondary leading-relaxed">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden />
                      {item}
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-xs text-text-secondary/80 leading-relaxed">
                  Anything you haven’t recorded, it says it doesn’t have — rather than guessing at it.
                </p>
              </div>
            </FadeIn>
          </div>
        </section>

        {/* Compare periods */}
        <section className="max-w-[1100px] mx-auto px-4 md:px-6 py-12 md:py-16 border-t border-border/40">
          <FadeIn>
            <div className="glass-card rounded-2xl p-6 md:p-8 flex flex-col md:flex-row gap-6 items-start">
              <span className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                <GitCompareArrows className="h-6 w-6 text-emerald-400" aria-hidden />
              </span>
              <div>
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">
                  “What changed since last month?”
                </h2>
                <p className="text-text-secondary leading-relaxed">
                  Point it at two periods and it answers the harder question — not how you did, but what
                  is different. Which setup stopped working. Whether you started holding losers longer.
                  Whether the win rate moved or just the size of the losses.
                </p>
              </div>
            </div>
          </FadeIn>
        </section>

        {/* Guardrails */}
        <section className="max-w-[1100px] mx-auto px-4 md:px-6 py-12 md:py-16 border-t border-border/40">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-14">
            <FadeIn>
              <div>
                <p className="text-xs uppercase tracking-widest text-emerald-400 font-medium mb-3">Where the line is</p>
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
                  It reviews. It doesn’t advise.
                </h2>
                <p className="text-text-secondary leading-relaxed mb-6">
                  This is a journal, not a signal service, and the difference is deliberate. Four things
                  it will not do, no matter how you ask:
                </p>
                <ul className="space-y-3">
                  {WONT.map((item) => (
                    <li key={item} className="flex gap-3 text-sm text-text-secondary leading-relaxed">
                      <Ban className="h-4 w-4 text-text-secondary/60 shrink-0 mt-0.5" aria-hidden />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </FadeIn>

            <FadeIn delay={100}>
              <div className="glass-card rounded-xl p-5 md:p-6">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/15 border border-emerald-500/30 mb-4">
                  <Lock className="h-5 w-5 text-emerald-400" aria-hidden />
                </span>
                <h3 className="text-lg font-semibold mb-3">Your notes stay yours</h3>
                <p className="text-sm text-text-secondary leading-relaxed">
                  Your written notes are the one thing that is never sent unless you switch it on, and
                  the switch is in the assistant itself, off by default. Everything else it reads is a
                  number your journal already computed. What you wrote about a trade is yours until you
                  decide otherwise.
                </p>
              </div>
            </FadeIn>
          </div>
        </section>

        {/* Plans + CTA */}
        <section className="max-w-[1100px] mx-auto px-4 md:px-6 py-12 md:py-20 border-t border-border/40">
          <FadeIn>
            <div className="text-center max-w-2xl mx-auto">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-400 mb-5">
                <Sparkles className="h-6 w-6" aria-hidden />
              </span>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
                Included on {gold.name} and {diamond.name}
              </h2>
              <p className="text-text-secondary leading-relaxed mb-2">
                {gold.name} includes {gold.limits.aiMessagesPerDay} questions a day.{' '}
                {diamond.name} includes {diamond.limits.aiMessagesPerDay}.
              </p>
              <p className="text-sm text-text-secondary/80 leading-relaxed mb-8 inline-flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Allowances reset every day.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <button type="button" onClick={onLaunch} className="btn-primary text-base px-7 py-3.5">
                  Open your journal
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate?.('pricing')}
                  className="btn-secondary text-base px-7 py-3.5"
                >
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
