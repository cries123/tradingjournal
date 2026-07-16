import { ContentPageLayout } from './ContentPageLayout';
import { BROKER_GUIDES, getBrokerGuideBySlug } from '../seo/brokerGuides';

interface BrokerGuidePageProps {
  slug: string;
  onHome: () => void;
  onLaunch: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
  onBrokers?: () => void;
  onGuides?: () => void;
}

export function BrokerGuidePage({
  slug,
  onHome,
  onLaunch,
  onPrivacy,
  onTerms,
  onBrokers,
  onGuides,
}: BrokerGuidePageProps) {
  const guide = getBrokerGuideBySlug(slug);

  if (!guide) {
    return (
      <ContentPageLayout
        title="Broker guide not found"
        onHome={onHome}
        onLaunch={onLaunch}
        onPrivacy={onPrivacy}
        onTerms={onTerms}
        onBrokers={onBrokers}
        onGuides={onGuides}
      >
        <p>This broker guide does not exist. Browse supported brokers instead.</p>
        {onBrokers && (
          <button type="button" onClick={onBrokers} className="btn-secondary mt-4">
            Supported brokers
          </button>
        )}
      </ContentPageLayout>
    );
  }

  const otherGuides = BROKER_GUIDES.filter((g) => g.slug !== guide.slug);

  return (
    <ContentPageLayout
      title={`${guide.brokerName} Trading Journal`}
      subtitle={guide.intro}
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

      <section>
        <h2 className="text-xl font-semibold mb-4">Frequently asked questions</h2>
        <div className="space-y-4">
          {guide.faq.map((item) => (
            <div key={item.question}>
              <h3 className="text-base font-semibold mb-1">{item.question}</h3>
              <p className="text-text-secondary leading-relaxed">{item.answer}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="pt-4 not-prose">
        <button type="button" onClick={onLaunch} className="btn-primary">
          Start journaling free
        </button>
      </div>

      {otherGuides.length > 0 && (
        <section className="not-prose pt-6 border-t border-border/40">
          <p className="text-xs uppercase tracking-widest text-text-secondary mb-3">
            Other broker guides
          </p>
          <ul className="space-y-2">
            {otherGuides.map((g) => (
              <li key={g.slug}>
                <a href={g.path} className="text-emerald-400 hover:underline text-sm">
                  {g.brokerName} trading journal →
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </ContentPageLayout>
  );
}
