import { LandingFooter, LandingNav } from '../components/landing/LandingFooter';
import { RequestBrokerContent } from '../components/support/RequestBrokerContent';

interface RequestBrokerPageProps {
  onHome: () => void;
  onLaunch: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
  onBrokers?: () => void;
}

export function RequestBrokerPage({
  onHome,
  onLaunch,
  onPrivacy,
  onTerms,
  onBrokers,
}: RequestBrokerPageProps) {
  return (
    <div className="min-h-dvh bg-bg-primary text-text-primary overflow-x-hidden flex flex-col">
      <div className="landing-grid pointer-events-none fixed inset-0" aria-hidden />
      <LandingNav onLaunch={onLaunch} onHome={onHome} onBrokers={onBrokers} />

      <main className="relative z-10 flex-1 w-full">
        <RequestBrokerContent onBack={onHome} backLabel="Back to home" />
      </main>

      <LandingFooter onPrivacy={onPrivacy} onTerms={onTerms} onHome={onHome} onBrokers={onBrokers} />
    </div>
  );
}
