import type { ReactNode } from 'react';
import { LandingFooter, LandingNav } from '../components/landing/LandingFooter';

interface LegalPageLayoutProps {
  title: string;
  /** The date this page's copy last actually changed, e.g. "June 28, 2026". */
  lastUpdated: string;
  children: ReactNode;
  onHome: () => void;
  onLaunch: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
  onBrokers?: () => void;
}

export function LegalPageLayout({
  title,
  lastUpdated,
  children,
  onHome,
  onLaunch,
  onPrivacy,
  onTerms,
  onBrokers,
}: LegalPageLayoutProps) {
  return (
    <div className="min-h-dvh bg-bg-primary text-text-primary overflow-x-hidden flex flex-col">
      <div className="landing-grid pointer-events-none fixed inset-0" aria-hidden />
      <LandingNav onLaunch={onLaunch} onHome={onHome} onBrokers={onBrokers} />
      <main className="relative z-10 flex-1 max-w-3xl mx-auto px-4 md:px-6 py-12 md:py-16 w-full">
        <button
          type="button"
          onClick={onHome}
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-emerald-400 transition-colors mb-8"
        >
          <span aria-hidden>←</span> Back to home
        </button>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">{title}</h1>
        <p className="text-sm text-text-secondary mb-10">Last updated: {lastUpdated}</p>
        <div className="prose-legal">{children}</div>
      </main>
      <LandingFooter onPrivacy={onPrivacy} onTerms={onTerms} onHome={onHome} onBrokers={onBrokers} />
    </div>
  );
}
