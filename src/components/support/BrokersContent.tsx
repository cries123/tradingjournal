import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Building2, Check, Search, ShieldCheck } from 'lucide-react';
import { PageFrame } from '../layout/PageFrame';
import { useInApp } from '../layout/inApp';
import { BrokerLogo } from '../brokers/BrokerLogo';
import { brokerIdFromName } from '../../utils/brokerIds';
import { fetchBrokersConfig, type BrokerConfig } from '../../services/brokersConfig';
import { BROKER_GUIDES } from '../../seo/brokerGuides';
import { SupportLinks } from './SupportLinks';

function brokerGuidePath(brokerName: string): string | null {
  const normalized = brokerName.trim().toLowerCase();
  if (!normalized) return null;
  const guide = BROKER_GUIDES.find((g) => {
    const guideName = g.brokerName.toLowerCase();
    return (
      guideName === normalized
      || guideName.includes(normalized)
      || normalized.includes(guideName)
      || g.slug === normalized.replace(/\s+/g, '-')
    );
  });
  return guide?.path ?? null;
}

/**
 * What is true of every connection, said once.
 *
 * Each broker used to carry its own three-bullet list, and two of those three bullets were
 * identical on all twenty cards — forty repetitions of "Round-trip trade matching" and "Manual
 * entry always available". Repeating a universal fact per item doesn't reinforce it, it just
 * makes the page long enough that nobody reaches the bottom.
 */
const UNIVERSAL_FACTS = [
  'Read-only — never sees your balance and can never place a trade',
  'Round-trip trades matched automatically',
  'Manual entry always available, with or without a connection',
  'Disconnect at any time',
];

interface BrokersContentProps {
  onBack: () => void;
  backLabel?: string;
  /** Wider grid for the public page. Inside the app it is always wide — see PageFrame. */
  wide?: boolean;
  onGuides?: () => void;
  onHelp?: () => void;
}

/**
 * The "is my broker supported?" page.
 *
 * That is the only question anyone arrives with, and the previous layout answered it with twenty
 * full-width stacked cards — roughly six thousand pixels of scrolling to find out whether one name
 * was in the list. It is now a searchable grid: type three letters and you have your answer.
 * Coming-soon platforms sit in the same grid, dimmed, so a search that finds nothing is a real
 * "no" rather than a "keep scrolling".
 */
export function BrokersContent({
  onBack,
  backLabel = 'Back to dashboard',
  wide = false,
  onGuides,
  onHelp,
}: BrokersContentProps) {
  const [supported, setSupported] = useState<BrokerConfig[]>([]);
  const [comingSoon, setComingSoon] = useState<string[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    void fetchBrokersConfig().then((config) => {
      setSupported(config.supported);
      setComingSoon(config.comingSoon);
    });
  }, []);

  const term = query.trim().toLowerCase();
  const liveMatches = useMemo(
    () => (term ? supported.filter((b) => b.name.toLowerCase().includes(term)) : supported),
    [supported, term],
  );
  const soonMatches = useMemo(
    () => (term ? comingSoon.filter((n) => n.toLowerCase().includes(term)) : comingSoon),
    [comingSoon, term],
  );
  const nothingFound = term.length > 0 && liveMatches.length === 0 && soonMatches.length === 0;

  const inApp = useInApp();
  const isWide = wide || inApp;
  const container = isWide ? 'max-w-[1680px] px-4 md:px-8' : 'max-w-4xl px-4 md:px-6';
  const grid = isWide
    ? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
    : 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3';
  const intro = (
    <>
      Connect any of the {supported.length || 20} brokers below for read-only trade import — or skip
      connecting entirely and log trades yourself. Either way, you&apos;re in control.
    </>
  );

  const body = (
    <>

      {/* Said once, up front, instead of on every card. */}
      <div className="rounded-xl border border-border/50 bg-bg-secondary/40 p-4 md:p-5 mb-8">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck size={15} className="text-accent shrink-0" />
          <p className="text-sm font-semibold text-text-primary">True of every connection</p>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {UNIVERSAL_FACTS.map((fact) => (
            <li key={fact} className="flex items-start gap-2 text-[13px] text-text-secondary">
              <Check size={13} className="text-accent mt-0.5 shrink-0" />
              {fact}
            </li>
          ))}
        </ul>
      </div>

      <div className="relative mb-5 max-w-md">
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for your broker…"
          aria-label="Search brokers"
          className="input-field w-full py-2.5 pl-9"
        />
      </div>

      {liveMatches.length > 0 && (
        <>
          <div className="flex items-baseline gap-2 mb-3">
            <h2 className="text-sm font-semibold text-text-primary">Available now</h2>
            <span className="text-xs text-text-secondary tabular-nums">{liveMatches.length}</span>
          </div>
          <div className={`${grid} mb-8`}>
            {liveMatches.map((b) => {
              const guide = brokerGuidePath(b.name);
              return (
                <article
                  key={b.name}
                  className="group flex flex-col rounded-xl border border-border/50 bg-bg-secondary/40 p-4 transition-colors hover:border-accent/30"
                >
                  <BrokerLogo broker={brokerIdFromName(b.name)} />
                  <p className="text-xs text-text-secondary mt-3 flex-1">{b.detail}</p>
                  {guide && (
                    <a
                      href={guide}
                      className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent/80 transition-colors"
                    >
                      Setup guide
                      <ArrowRight size={12} />
                    </a>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}

      {soonMatches.length > 0 && (
        <>
          <div className="flex items-baseline gap-2 mb-3">
            <h2 className="text-sm font-semibold text-text-primary">On the roadmap</h2>
            <span className="text-xs text-text-secondary tabular-nums">{soonMatches.length}</span>
          </div>
          <p className="text-xs text-text-secondary mb-3">
            Not connectable yet — manual entry and CSV import work for these today.
          </p>
          <div className="flex flex-wrap gap-2 mb-10">
            {soonMatches.map((name) => (
              <span
                key={name}
                className="px-3 py-1.5 rounded-full text-xs border border-border/50 text-text-secondary/80 bg-bg-primary/40"
              >
                {name}
              </span>
            ))}
          </div>
        </>
      )}

      {nothingFound && (
        <div className="rounded-xl border border-dashed border-accent/25 p-8 text-center mb-10">
          <h2 className="text-lg font-semibold mb-2">No match for “{query.trim()}”</h2>
          <p className="text-sm text-text-secondary leading-relaxed max-w-md mx-auto">
            It isn&apos;t supported yet — but manual entry works with any broker, today.
          </p>
        </div>
      )}

      {(onGuides || onHelp) && (
        <div className="mb-10">
          <SupportLinks current="brokers" onGuides={onGuides} onHelp={onHelp} />
        </div>
      )}

    </>
  );

  if (inApp) {
    return (
      <PageFrame
        eyebrow="Brokers"
        title="Supported brokers & import methods"
        icon={Building2}
        onBack={onBack}
        backLabel={backLabel}
        subtitle={intro}
      >
        <div>{body}</div>
      </PageFrame>
    );
  }

  return (
    <div className="pb-6">
      <div className={`${container} mx-auto py-4 md:py-6`}>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-accent transition-colors mb-8 focus-ring rounded-lg px-1 py-1"
        >
          <ArrowLeft size={16} />
          {backLabel}
        </button>

        <p className="text-xs uppercase tracking-widest text-accent font-medium mb-3">Brokers</p>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
          Supported brokers &amp; import methods
        </h1>
        <p className="text-text-secondary text-base leading-relaxed max-w-2xl mb-8">{intro}</p>

        {body}
      </div>
    </div>
  );
}
