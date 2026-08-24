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
      subtitle="Product updates, new broker support, and other changes — newest first."
      onHome={onHome}
      onLaunch={onLaunch}
      onPrivacy={onPrivacy}
      onTerms={onTerms}
      onBrokers={onBrokers}
      onGuides={onGuides}
      onNavigate={onNavigate}
    >
      <ol className="space-y-8 not-prose">
        {CHANGELOG.map((entry) => (
          <li key={`${entry.date}-${entry.title}`} className="relative pl-6 border-l-2 border-border/60">
            <span className="absolute -left-[7px] top-1.5 h-3 w-3 rounded-full bg-emerald-400" aria-hidden />
            <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary mb-1">{entry.date}</p>
            <h2 className="text-lg font-semibold text-text-primary mb-1.5">{entry.title}</h2>
            <p className="text-sm text-text-secondary leading-relaxed">{entry.description}</p>
          </li>
        ))}
      </ol>
    </ContentPageLayout>
  );
}
