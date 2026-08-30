import { ContentPageLayout } from './ContentPageLayout';
import { TUTORIAL_ARTICLES } from '../seo/guides';
import type { ExtraNavRoute } from '../hooks/useRoute';

interface GuidesIndexPageProps {
  onHome: () => void;
  onLaunch: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
  onBrokers?: () => void;
  onGuides?: () => void;
  onGuide: (slug: string) => void;
  onNavigate?: (route: ExtraNavRoute) => void;
}

export function GuidesIndexPage({
  onHome,
  onLaunch,
  onPrivacy,
  onTerms,
  onBrokers,
  onGuides,
  onGuide,
  onNavigate,
}: GuidesIndexPageProps) {
  return (
    <ContentPageLayout
      title="Tutorials"
      subtitle="Step-by-step walkthroughs for getting things done in Trend Chasers."
      onHome={onHome}
      onLaunch={onLaunch}
      onPrivacy={onPrivacy}
      onTerms={onTerms}
      onBrokers={onBrokers}
      onGuides={onGuides}
      onNavigate={onNavigate}
    >
      {/* Tutorials only. The marketing landing pages still live under /guides and keep their
          routes, prerendered HTML and sitemap entries — they're just not what someone who clicked
          "Tutorials" is asking for. */}
      <ul className="space-y-4 not-prose list-none pl-0">
        {TUTORIAL_ARTICLES.map((guide) => (
          <li key={guide.slug}>
            <a
              href={guide.path}
              onClick={(e) => {
                e.preventDefault();
                onGuide(guide.slug);
              }}
              className="block rounded-xl border border-border/50 bg-bg-tertiary/30 p-5 hover:border-emerald-500/30 transition-colors"
            >
              <h2 className="text-lg font-semibold text-text-primary">{guide.title}</h2>
              <p className="text-sm text-text-secondary mt-2 leading-relaxed">{guide.description}</p>
            </a>
          </li>
        ))}
      </ul>

      {TUTORIAL_ARTICLES.length === 0 && (
        <p className="text-sm text-text-secondary not-prose">
          No tutorials published yet.
        </p>
      )}
    </ContentPageLayout>
  );
}
