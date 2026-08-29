import { Construction } from 'lucide-react';
import { LandingFooter, LandingNav } from '../components/landing/LandingFooter';
import type { ExtraNavRoute } from '../hooks/useRoute';

interface ComingSoonPageProps {
  feature: string;
  description: string;
  /** Overridable so a route that has since shipped doesn't keep announcing itself as upcoming. */
  eyebrow?: string;
  onHome: () => void;
  onLaunch: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
  onBrokers?: () => void;
  onGuides?: () => void;
  onNavigate?: (route: ExtraNavRoute) => void;
}

export function ComingSoonPage({
  feature,
  description,
  eyebrow = 'Coming soon',
  onHome,
  onLaunch,
  onPrivacy,
  onTerms,
  onBrokers,
  onGuides,
  onNavigate,
}: ComingSoonPageProps) {
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

      <main className="relative z-10 flex-1 flex items-center justify-center px-4 md:px-6 py-20">
        <div className="max-w-lg text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-400 mb-6">
            <Construction className="h-7 w-7" aria-hidden />
          </span>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-3">{eyebrow}</p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">{feature}</h1>
          <p className="text-base text-text-secondary leading-relaxed mb-8">{description}</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button type="button" onClick={onLaunch} className="btn-primary text-sm px-6 py-3">
              Open your journal
            </button>
            <button
              type="button"
              onClick={onHome}
              className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors px-6 py-3"
            >
              Back to home
            </button>
          </div>
        </div>
      </main>

      <LandingFooter onPrivacy={onPrivacy} onTerms={onTerms} onHome={onHome} onBrokers={onBrokers} onGuides={onGuides} onNavigate={onNavigate} onLaunch={onLaunch} />
    </div>
  );
}
