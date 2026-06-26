import type { ReactNode } from 'react';
import { LandingFooter, LandingNav } from '../components/landing/LandingFooter';

interface LegalPageLayoutProps {
  title: string;
  children: ReactNode;
  onHome: () => void;
  onLaunch: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
}

export function LegalPageLayout({
  title,
  children,
  onHome,
  onLaunch,
  onPrivacy,
  onTerms,
}: LegalPageLayoutProps) {
  return (
    <div className="min-h-dvh bg-bg-primary text-text-primary overflow-x-hidden">
      <div className="landing-grid pointer-events-none fixed inset-0" aria-hidden />
      <LandingNav onLaunch={onLaunch} onHome={onHome} />
      <main className="relative z-10 max-w-3xl mx-auto px-4 md:px-6 py-12 md:py-16">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">{title}</h1>
        <p className="text-sm text-text-secondary mb-10">
          Last updated:{' '}
          {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
        <div className="prose-legal">{children}</div>
      </main>
      <LandingFooter onPrivacy={onPrivacy} onTerms={onTerms} onHome={onHome} />
    </div>
  );
}
