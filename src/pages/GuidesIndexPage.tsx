import { ArrowRight, BookOpen, Building2, Clock, Compass } from 'lucide-react';
import { LandingFooter, LandingNav } from '../components/landing/LandingFooter';
import { GUIDE_ARTICLES, TUTORIAL_ARTICLES, type GuideArticle } from '../seo/guides';
import { BROKER_GUIDES } from '../seo/brokerGuides';
import { SUPPORTED_BROKER_COUNT } from '../data/brokerCopy';
import type { ExtraNavRoute } from '../hooks/useRoute';
import { SupportLinks } from '../components/support/SupportLinks';
import { BackLink } from '../components/BackLink';

interface GuidesIndexPageProps {
  onHome: () => void;
  onLaunch: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
  onBrokers?: () => void;
  onGuides?: () => void;
  onGuide: (slug: string) => void;
  onBrokerGuide?: (slug: string) => void;
  onHelp?: () => void;
  onReportBug?: () => void;
  onNavigate?: (route: ExtraNavRoute) => void;
}

/** Average adult reading speed, rounded down so the estimate never overpromises. */
const WORDS_PER_MINUTE = 200;

function readMinutes(guide: GuideArticle): number {
  const words = guide.sections.reduce(
    (n, section) => n + section.paragraphs.join(' ').split(/\s+/).length,
    0,
  );
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/**
 * The learning hub.
 *
 * Previously this rendered inside the article layout — a 3xl prose column built for reading one
 * document top to bottom. An index is not a document: with a single card it left a narrow strip of
 * content floating in an empty page above a footer twice its size, which read as broken rather than
 * sparse.
 *
 * It's now a hub with its own layout, and it draws on everything already written rather than only
 * the guides tagged as tutorials. The broker walkthroughs are genuine step-by-step content and
 * belong here; the marketing pages are included too, but in their own clearly-labelled section
 * further down, so they're findable without being presented as tutorials.
 */
export function GuidesIndexPage({
  onHome,
  onLaunch,
  onPrivacy,
  onTerms,
  onBrokers,
  onGuides,
  onGuide,
  onBrokerGuide,
  onHelp,
  onReportBug,
  onNavigate,
}: GuidesIndexPageProps) {
  const background = GUIDE_ARTICLES.filter((g) => g.kind !== 'tutorial');

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

      <main className="relative z-10 flex-1 w-full">
        {/* Hero. The counts are real and computed — a learning page that opens by telling you how
            much there is to read is doing its job before you click anything. */}
        <section className="border-b border-border/40">
          <div className="max-w-[1680px] mx-auto px-4 md:px-8 pt-10 pb-12 md:pt-14 md:pb-16">
        <BackLink onHome={onHome} className="mb-8" />

            <p className="text-[11px] uppercase tracking-[0.2em] text-accent/80 font-semibold mb-3">
              Learn
            </p>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4 max-w-3xl text-balance">
              Everything you need to run your journal
            </h1>
            <p className="text-base md:text-lg text-text-secondary leading-relaxed max-w-2xl">
              Step-by-step walkthroughs for connecting a broker, importing your trades, and getting
              a real read on your performance.
            </p>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-7 text-sm text-text-secondary">
              <span className="flex items-center gap-2">
                <BookOpen size={14} className="text-accent/70" />
                {TUTORIAL_ARTICLES.length + BROKER_GUIDES.length} walkthroughs
              </span>
              <span className="flex items-center gap-2">
                <Building2 size={14} className="text-accent/70" />
                {SUPPORTED_BROKER_COUNT} brokers supported
              </span>
              <span className="flex items-center gap-2">
                <Compass size={14} className="text-accent/70" />
                Free to start
              </span>
            </div>
          </div>
        </section>

        <div className="max-w-[1680px] mx-auto px-4 md:px-8 py-12 md:py-16 space-y-14">
          {TUTORIAL_ARTICLES.length > 0 && (
            <section>
              <SectionHeading
                eyebrow="Start here"
                title="Tutorials"
                blurb="How the app works, end to end."
              />
              {/* A lone card in a two-column grid leaves an obvious hole, which is what made this
                  page read as unfinished. The track count follows the content. */}
              <div
                className={`grid gap-4 ${
                  TUTORIAL_ARTICLES.length === 1
                    ? 'max-w-3xl'
                    : 'sm:grid-cols-2 xl:grid-cols-3'
                }`}
              >
                {TUTORIAL_ARTICLES.map((guide) => (
                  <GuideCard
                    key={guide.slug}
                    title={guide.title}
                    description={guide.description}
                    meta={`${readMinutes(guide)} min read`}
                    href={guide.path}
                    onOpen={() => onGuide(guide.slug)}
                  />
                ))}
              </div>
            </section>
          )}

          {BROKER_GUIDES.length > 0 && (
            <section>
              <SectionHeading
                eyebrow="By broker"
                title="Set up your broker"
                blurb="What syncing looks like for the platform you actually trade on."
              />
              {/* Track count is capped at the number of guides. A four-column grid holding three cards
                  leaves an empty slot on wide screens — the same hole this page was rebuilt to fix. */}
              <div
                className={`grid gap-4 sm:grid-cols-2 ${
                  BROKER_GUIDES.length >= 4 ? 'lg:grid-cols-3 xl:grid-cols-4' : 'lg:grid-cols-3'
                }`}
              >
                {BROKER_GUIDES.map((guide) => (
                  <GuideCard
                    key={guide.slug}
                    title={`${guide.brokerName} journal guide`}
                    description={guide.description}
                    meta="Setup"
                    href={guide.path}
                    onOpen={() => onBrokerGuide?.(guide.slug)}
                  />
                ))}
              </div>
            </section>
          )}

          {background.length > 0 && (
            <section>
              <SectionHeading
                eyebrow="Background"
                title="Worth reading"
                blurb="Why any of this matters, if you're still deciding."
              />
              {/* Deliberately a quieter treatment than the cards above — these explain the product
                  rather than teach you to use it, and shouldn't compete with the walkthroughs. */}
              <ul className="divide-y divide-border/40 border-t border-b border-border/40 max-w-4xl">
                {background.map((guide) => (
                  <li key={guide.slug}>
                    <a
                      href={guide.path}
                      onClick={(e) => {
                        e.preventDefault();
                        onGuide(guide.slug);
                      }}
                      className="group flex items-start justify-between gap-6 py-4 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary group-hover:text-accent transition-colors">
                          {guide.title}
                        </p>
                        <p className="text-xs text-text-secondary mt-1 leading-relaxed max-w-2xl">
                          {guide.description}
                        </p>
                      </div>
                      <span className="flex items-center gap-1.5 shrink-0 text-[11px] text-text-secondary/70 pt-0.5">
                        <Clock size={11} />
                        {readMinutes(guide)} min
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <SupportLinks
            current="tutorials"
            onBrokers={onBrokers}
            onHelp={onHelp}
            onReportBug={onReportBug}
          />

          <section className="rounded-2xl border border-accent/20 bg-gradient-to-br from-accent/[0.07] to-transparent px-6 py-8 md:px-10 md:py-10">
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div className="max-w-lg">
                <h2 className="text-xl md:text-2xl font-bold tracking-tight mb-2">
                  Ready to see your own numbers?
                </h2>
                <p className="text-sm text-text-secondary leading-relaxed">
                  Connect a broker and your trade history fills the calendar in one tap — or log a
                  session by hand and start from today.
                </p>
              </div>
              <button type="button" onClick={onLaunch} className="btn-primary px-6 py-3 shrink-0">
                Start journaling free
              </button>
            </div>
          </section>
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

function SectionHeading({
  eyebrow,
  title,
  blurb,
}: {
  eyebrow: string;
  title: string;
  blurb: string;
}) {
  return (
    <div className="mb-5">
      <p className="text-[10px] uppercase tracking-[0.18em] text-accent/70 font-semibold mb-1.5">
        {eyebrow}
      </p>
      <h2 className="text-xl md:text-2xl font-bold tracking-tight">{title}</h2>
      <p className="text-sm text-text-secondary mt-1.5">{blurb}</p>
    </div>
  );
}

function GuideCard({
  title,
  description,
  meta,
  href,
  onOpen,
}: {
  title: string;
  description: string;
  meta: string;
  href: string;
  onOpen: () => void;
}) {
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        onOpen();
      }}
      className="group relative flex flex-col rounded-xl border border-border/50 bg-bg-secondary/50 p-5 transition-colors hover:border-accent/40 hover:bg-bg-secondary focus-ring"
    >
      <span className="text-[10px] uppercase tracking-wider text-text-secondary/70 font-semibold mb-2.5">
        {meta}
      </span>
      <h3 className="text-base font-semibold text-text-primary leading-snug mb-2 group-hover:text-accent transition-colors">
        {title}
      </h3>
      <p className="text-[13px] text-text-secondary leading-relaxed flex-1">{description}</p>
      <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-accent">
        Read
        <ArrowRight
          size={13}
          className="transition-transform group-hover:translate-x-0.5"
        />
      </span>
    </a>
  );
}
