import type { ReactNode } from 'react';
import { LandingFooter, LandingNav } from '../components/landing/LandingFooter';
import type { ExtraNavRoute } from '../hooks/useRoute';
import { BackLink } from '../components/BackLink';

interface ContentPageLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onHome: () => void;
  onLaunch: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
  onBrokers?: () => void;
  onGuides?: () => void;
  onNavigate?: (route: ExtraNavRoute) => void;
}

export function ContentPageLayout({
  title,
  subtitle,
  children,
  onHome,
  onLaunch,
  onPrivacy,
  onTerms,
  onBrokers,
  onGuides,
  onNavigate,
}: ContentPageLayoutProps) {
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
      <main className="relative z-10 flex-1 max-w-3xl mx-auto px-4 md:px-6 py-12 md:py-16 w-full">
        <BackLink onHome={onHome} className="mb-8" />
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">{title}</h1>
        {subtitle && <p className="text-base text-text-secondary mb-10 leading-relaxed">{subtitle}</p>}
        <div className="prose-legal space-y-8">{children}</div>
      </main>
      <LandingFooter
        onPrivacy={onPrivacy}
        onTerms={onTerms}
        onHome={onHome}
        onBrokers={onBrokers}
        onGuides={onGuides} onNavigate={onNavigate} onLaunch={onLaunch}
      />
    </div>
  );
}
