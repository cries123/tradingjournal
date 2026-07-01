import { ContentPageLayout } from './ContentPageLayout';
import { getGuideBySlug } from '../seo/guides';

interface GuidePageProps {
  slug: string;
  onHome: () => void;
  onLaunch: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
  onBrokers?: () => void;
  onGuides?: () => void;
}

export function GuidePage({
  slug,
  onHome,
  onLaunch,
  onPrivacy,
  onTerms,
  onBrokers,
  onGuides,
}: GuidePageProps) {
  const guide = getGuideBySlug(slug);

  if (!guide) {
    return (
      <ContentPageLayout
        title="Guide not found"
        onHome={onHome}
        onLaunch={onLaunch}
        onPrivacy={onPrivacy}
        onTerms={onTerms}
        onBrokers={onBrokers}
        onGuides={onGuides}
      >
        <p>This guide does not exist. Return to the guides index to browse available articles.</p>
        {onGuides && (
          <button type="button" onClick={onGuides} className="btn-secondary mt-4">
            All guides
          </button>
        )}
      </ContentPageLayout>
    );
  }

  return (
    <ContentPageLayout
      title={guide.title}
      subtitle={guide.description}
      onHome={onHome}
      onLaunch={onLaunch}
      onPrivacy={onPrivacy}
      onTerms={onTerms}
      onBrokers={onBrokers}
      onGuides={onGuides}
    >
      {guide.sections.map((section) => (
        <section key={section.heading}>
          <h2 className="text-xl font-semibold mb-3">{section.heading}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph.slice(0, 40)} className="text-text-secondary leading-relaxed mb-4">
              {paragraph}
            </p>
          ))}
        </section>
      ))}
      <div className="pt-4 not-prose">
        <button type="button" onClick={onLaunch} className="btn-primary">
          Start journaling free
        </button>
      </div>
    </ContentPageLayout>
  );
}
