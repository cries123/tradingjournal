import { useEffect, useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { brokerIdFromName, BrokerLogo } from '../brokers/BrokerLogo';
import { fetchBrokersConfig, type BrokerConfig } from '../../services/brokersConfig';

interface BrokersContentProps {
  onBack: () => void;
  backLabel?: string;
  onRequestBroker?: () => void;
}

export function BrokersContent({ onBack, backLabel = 'Back to dashboard', onRequestBroker }: BrokersContentProps) {
  const [supported, setSupported] = useState<BrokerConfig[]>([]);
  const [comingSoon, setComingSoon] = useState<string[]>([]);

  useEffect(() => {
    void fetchBrokersConfig().then((config) => {
      setSupported(config.supported);
      setComingSoon(config.comingSoon);
    });
  }, []);

  return (
    <div className="pb-6">
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-emerald-400 transition-colors mb-8 focus-ring rounded-lg px-1 py-1"
        >
          <ArrowLeft size={16} />
          {backLabel}
        </button>

        <p className="text-xs uppercase tracking-widest text-emerald-400 font-medium mb-3">Brokers</p>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
          Supported brokers & import methods
        </h1>
        <p className="text-text-secondary text-base leading-relaxed max-w-2xl mb-10">
          Trend Chasers never connects to your brokerage. You import data yourself — via AI screenshot
          parsing or CSV upload.
        </p>

        <div className="space-y-4 mb-10">
          {supported.map((b) => (
            <article key={b.name} className="panel-card p-5 md:p-6">
              <span className="inline-flex px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-semibold uppercase tracking-wide mb-3">
                Live now
              </span>
              <BrokerLogo broker={brokerIdFromName(b.name)} />
              <p className="text-sm text-text-secondary mt-2 mb-4">{b.detail}</p>
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

        <div className="panel-card p-5 md:p-6 mb-10">
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

        <div className="panel-card p-6 md:p-8 border-dashed border-2 border-emerald-500/25 text-center">
          <h2 className="text-xl font-semibold mb-2">Your broker not listed?</h2>
          <p className="text-sm text-text-secondary leading-relaxed mb-6 max-w-lg mx-auto">
            Tell us your broker plus how you export trades. We&apos;ll configure import support for your
            workflow.
          </p>
          {onRequestBroker ? (
            <button type="button" onClick={onRequestBroker} className="btn-primary text-sm px-6 py-2.5">
              Request your broker
            </button>
          ) : (
            <a href="/request-broker" className="btn-primary text-sm px-6 py-2.5 inline-block">
              Request your broker
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
