import { LandingFooter, LandingNav } from '../components/landing/LandingFooter';
import { BrokersContent } from '../components/support/BrokersContent';

interface BrokersPageProps {
  onHome: () => void;
  onLaunch: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
  onBrokers: () => void;
  onRequestBroker?: () => void;
}

export function BrokersPage({
  onHome,
  onLaunch,
  onPrivacy,
  onTerms,
  onBrokers,
  onRequestBroker,
}: BrokersPageProps) {
  return (
    <div className="min-h-dvh bg-bg-primary text-text-primary overflow-x-hidden flex flex-col">
      <div className="landing-grid pointer-events-none fixed inset-0" aria-hidden />
      <LandingNav onLaunch={onLaunch} onHome={onHome} onBrokers={onBrokers} showBrokersLink={false} />

      <main className="relative z-10 flex-1">
        <BrokersContent
          onBack={onHome}
          backLabel="Back to home"
          onRequestBroker={onRequestBroker}
        />
        <div className="max-w-4xl mx-auto px-4 md:px-6 pb-16 text-center">
          <button type="button" onClick={onLaunch} className="btn-primary text-base px-8 py-3">
            Open Trend Chasers
          </button>
        </div>
      </main>

      <LandingFooter onPrivacy={onPrivacy} onTerms={onTerms} onHome={onHome} onBrokers={onBrokers} />
    </div>
  );
}
