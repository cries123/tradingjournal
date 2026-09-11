import { ChevronRight } from 'lucide-react';
import { ContentPageLayout } from './ContentPageLayout';
import { CHANGELOG } from '../data/whatsNew';
import type { ExtraNavRoute } from '../hooks/useRoute';

interface WhatsNewPageProps {
  onHome: () => void;
  onLaunch: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
  onBrokers?: () => void;
  onGuides?: () => void;
  onNavigate?: (route: ExtraNavRoute) => void;
}

/** "2.3" → "v2-3", so a release can be linked to directly: /whats-new#v2-3 */
function anchorFor(version: string): string {
  return `v${version.replace(/\./g, '-')}`;
}

/**
 * Every release, collapsed to one line each.
 *
 * The page used to print all fourteen entries in full, and several of them run to five paragraphs
 * — so the whole changelog arrived as one undifferentiated wall and read as noise rather than as
 * news. Worse, the paragraph breaks were not being rendered at all: `description` separates
 * paragraphs with a blank line and the old markup dropped the lot into a single <p>, where
 * whitespace collapses. The longest and most important entries were the ones hurt most by that.
 *
 * `<details>` rather than React state, for two reasons. The collapsed text stays in the document,
 * which is what the prerender and every search engine read — a changelog whose content only
 * appears after a click is a changelog nobody finds. And the keyboard and screen-reader behaviour
 * is the browser's rather than something to reimplement with aria-expanded.
 */
export function WhatsNewPage({
  onHome,
  onLaunch,
  onPrivacy,
  onTerms,
  onBrokers,
  onGuides,
  onNavigate,
}: WhatsNewPageProps) {
  return (
    <ContentPageLayout
      title="What's new"
      subtitle="Every release, newest first. Pick one to read what changed."
      onHome={onHome}
      onLaunch={onLaunch}
      onPrivacy={onPrivacy}
      onTerms={onTerms}
      onBrokers={onBrokers}
      onGuides={onGuides}
      onNavigate={onNavigate}
    >
      <ol className="not-prose space-y-2.5">
        {CHANGELOG.map((entry, index) => {
          /* The newest one open on arrival. Somebody who came here to find out what changed has
             their answer without a click, and the shape of the rest is still visible below it. */
          const latest = index === 0;

          return (
            <li key={`${entry.version}-${entry.title}`} id={anchorFor(entry.version)}>
              <details
                open={latest}
                className="group rounded-xl border border-border/70 bg-bg-card/40 open:bg-bg-card/70 open:border-border transition-colors scroll-mt-24"
              >
                <summary className="flex cursor-pointer list-none items-start gap-3 p-4 focus-ring rounded-xl [&::-webkit-details-marker]:hidden">
                  <ChevronRight
                    className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary transition-transform duration-200 group-open:rotate-90"
                    aria-hidden
                  />

                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span className="rounded-md bg-bg-tertiary px-1.5 py-0.5 font-mono text-xs font-semibold text-accent">
                        {`v${entry.version}`}
                      </span>
                      <span className="text-xs uppercase tracking-wider text-text-secondary">
                        {entry.date}
                      </span>
                      {latest && (
                        <span className="rounded-md bg-emerald-400/10 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-400">
                          Latest
                        </span>
                      )}
                    </div>

                    {/* h2 inside the summary: the release titles are still this page's outline, and
                        collapsing one must not take its heading out of the document. */}
                    <h2 className="text-base font-semibold leading-snug text-text-primary">
                      {entry.title}
                    </h2>
                  </div>
                </summary>

                <div className="space-y-3 border-t border-border/50 px-4 pb-4 pt-3.5 pl-11">
                  {entry.description.split('\n\n').map((paragraph) => (
                    <p key={paragraph.slice(0, 40)} className="text-sm leading-relaxed text-text-secondary">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </details>
            </li>
          );
        })}
      </ol>
    </ContentPageLayout>
  );
}
