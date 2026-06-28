import { useEffect, useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { brokerIdFromName, BrokerLogo } from '../components/brokers/BrokerLogo';
import { LandingFooter, LandingNav } from '../components/landing/LandingFooter';
import { fetchBrokersConfig, type BrokerConfig } from '../services/brokersConfig';

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
  const [supported, setSupported] = useState<BrokerConfig[]>([]);
  const [comingSoon, setComingSoon] = useState<string[]>([]);

  useEffect(() => {
    void fetchBrokersConfig().then((config) => {
      setSupported(config.supported);
      setComingSoon(config.comingSoon);
    });
  }, []);

  return (
    <div className="min-h-dvh bg-bg-primary text-text-primary overflow-x-hidden flex flex-col">
      <div className="landing-grid pointer-events-none fixed inset-0" aria-hidden />
      <LandingNav onLaunch={onLaunch} onHome={onHome} onBrokers={onBrokers} showBrokersLink={false} />

      <main className="relative z-10 flex-1">
        <div className="max-w-4xl mx-auto px-4 md:px-6 pt-8 md:pt-12 pb-16">
          <button
            type="button"
            onClick={onHome}
            className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-emerald-400 transition-colors mb-8 focus-ring rounded-lg px-1 py-1"
          >
            <ArrowLeft size={16} />
            Back to home
          </button>

          <p className="text-xs uppercase tracking-widest text-emerald-400 font-medium mb-3">Brokers</p>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
            Supported brokers & import methods
          </h1>
          <p className="text-text-secondary text-base md:text-lg leading-relaxed max-w-2xl mb-12">
            Trend Chasers never connects to your brokerage. You import data yourself — via AI screenshot
            parsing or CSV upload. We currently support Thinkorswim, Schwab, and Robinhood, with more
            brokers being added based on user requests.
          </p>

          <div className="space-y-4 mb-12">
            {supported.map((b) => (
              <article key={b.name} className="glass-card rounded-xl p-6 md:p-7">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                  <div>
                    <span className="inline-flex px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-semibold uppercase tracking-wide mb-3">
                      Live now
                    </span>
                    <BrokerLogo broker={brokerIdFromName(b.name)} />
                    <p className="text-sm text-text-secondary mt-2">{b.detail}</p>
                  </div>
                </div>
                <ul className="space-y-2">
                  {b.methods.map((m) => (
                    <li key={m} className="flex items-start gap-2 text-sm text-text-secondary">
                      <Check size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                      {m}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <div className="glass-card rounded-xl p-6 md:p-8 mb-12">
            <h2 className="text-lg font-semibold mb-3">Coming soon</h2>
            <p className="text-sm text-text-secondary mb-4">
              We&apos;re expanding broker support. These platforms are on the roadmap:
            </p>
            <div className="flex flex-wrap gap-2">
              {comingSoon.map((name) => (
                <span
                  key={name}
                  className="px-3 py-1.5 rounded-full text-xs border border-border/60 text-text-secondary bg-bg-primary/50"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>

          <div className="glass-card rounded-2xl p-6 md:p-8 border-dashed border-2 border-emerald-500/25 text-center">
            <h2 className="text-xl font-semibold mb-2">Your broker not listed?</h2>
            <p className="text-sm text-text-secondary leading-relaxed mb-6 max-w-lg mx-auto">
              Reach out and tell us your broker plus how you export trades (CSV, screenshots, etc.).
              We&apos;ll configure import support for your workflow.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {onRequestBroker ? (
                <button type="button" onClick={onRequestBroker} className="btn-primary text-sm px-6 py-2.5">
                  Request your broker
                </button>
              ) : (
                <a href="/request-broker" className="btn-primary text-sm px-6 py-2.5">
                  Request your broker
                </a>
              )}
            </div>
          </div>

          <div className="mt-12 text-center">
            <button type="button" onClick={onLaunch} className="btn-primary text-base px-8 py-3">
              Open Trend Chasers
            </button>
          </div>
        </div>
      </main>

      <LandingFooter onPrivacy={onPrivacy} onTerms={onTerms} onHome={onHome} onBrokers={() => {}} />
    </div>
  );
}
