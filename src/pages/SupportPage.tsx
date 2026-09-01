import { LandingFooter, LandingNav } from '../components/landing/LandingFooter';
import { SupportTicketsContent } from '../components/support/SupportTicketsContent';
import type { ExtraNavRoute } from '../hooks/useRoute';

interface SupportPageProps {
  onHome: () => void;
  onLaunch: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
  onBrokers?: () => void;
  onGuides?: () => void;
  onNavigate?: (route: ExtraNavRoute) => void;
}

export function SupportPage({
  onHome,
  onLaunch,
  onPrivacy,
  onTerms,
  onBrokers,
  onGuides,
  onNavigate,
}: SupportPageProps) {
  return (
    <div className="min-h-dvh bg-bg-primary text-text-primary overflow-x-hidden flex flex-col">
      <div className="landing-grid pointer-events-none fixed inset-0" aria-hidden />
      <LandingNav onLaunch={onLaunch} onHome={onHome} onBrokers={onBrokers} onGuides={onGuides} onNavigate={onNavigate} />

      <main className="relative z-10 flex-1 w-full">
        <SupportTicketsContent
          onBack={onHome}
          backLabel="Back to home"
          onSignIn={onLaunch}
          heading="Support"
          intro="Open a ticket and talk to a person. Billing, memberships, broker connections — anything. Replies arrive right here, and the thread stays with your account."
        />
      </main>

      <LandingFooter onPrivacy={onPrivacy} onTerms={onTerms} onHome={onHome} onBrokers={onBrokers} onGuides={onGuides} onNavigate={onNavigate} onLaunch={onLaunch} />
    </div>
  );
}
