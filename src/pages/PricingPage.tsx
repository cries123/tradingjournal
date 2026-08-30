import { LandingFooter, LandingNav } from '../components/landing/LandingFooter';
import { PricingContent } from '../components/pricing/PricingContent';
import type { ExtraNavRoute } from '../hooks/useRoute';

interface PricingPageProps {
  onHome: () => void;
  onLaunch: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
  onBrokers?: () => void;
  onGuides?: () => void;
  onNavigate?: (route: ExtraNavRoute) => void;
}

export function PricingPage({
  onHome,
  onLaunch,
  onPrivacy,
  onTerms,
  onBrokers,
  onGuides,
  onNavigate,
}: PricingPageProps) {
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
        <PricingContent
          onBack={onHome}
          onLaunch={onLaunch}
          onRefunds={onNavigate ? () => onNavigate('refunds') : undefined}
          onBrokers={onBrokers}
        />
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
