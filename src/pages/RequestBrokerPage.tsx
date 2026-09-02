import { LandingFooter, LandingNav } from '../components/landing/LandingFooter';
import { RequestBrokerContent } from '../components/support/RequestBrokerContent';
import type { ExtraNavRoute } from '../hooks/useRoute';
import { useBackDestination } from '../hooks/useBackDestination';

interface RequestBrokerPageProps {
  onHome: () => void;
  onLaunch: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
  onBrokers?: () => void;
  onGuides?: () => void;
  onNavigate?: (route: ExtraNavRoute) => void;
}

export function RequestBrokerPage({
  onHome,
  onLaunch,
  onPrivacy,
  onTerms,
  onBrokers,
  onGuides,
  onNavigate,
}: RequestBrokerPageProps) {
  const back = useBackDestination(onHome);
  return (
    <div className="min-h-dvh bg-bg-primary text-text-primary overflow-x-hidden flex flex-col">
      <div className="landing-grid pointer-events-none fixed inset-0" aria-hidden />
      <LandingNav onLaunch={onLaunch} onHome={onHome} onBrokers={onBrokers} onGuides={onGuides} onNavigate={onNavigate} />

      <main className="relative z-10 flex-1 w-full">
        <RequestBrokerContent onBack={back.goBack} backLabel={back.label} />
      </main>

      <LandingFooter onPrivacy={onPrivacy} onTerms={onTerms} onHome={onHome} onBrokers={onBrokers} onGuides={onGuides} onNavigate={onNavigate} onLaunch={onLaunch} />
    </div>
  );
}
