type BrokerId = 'thinkorswim' | 'schwab' | 'robinhood';

interface BrokerLogoProps {
  broker: BrokerId | string;
  className?: string;
}

export function BrokerLogo({ broker, className = '' }: BrokerLogoProps) {
  const id = broker.toLowerCase().replace(/\s+/g, '');

  if (id.includes('thinkorswim') || id === 'tos') {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="w-10 h-10 rounded-xl bg-[#1a1a2e] border border-border/60 flex items-center justify-center shrink-0">
          <svg viewBox="0 0 32 32" className="w-6 h-6" aria-hidden>
            <rect x="4" y="8" width="24" height="16" rx="3" fill="#e87722" />
            <text x="16" y="19" textAnchor="middle" fill="white" fontSize="8" fontWeight="700" fontFamily="system-ui">TOS</text>
          </svg>
        </div>
        <span className="font-semibold text-lg">thinkorswim</span>
      </div>
    );
  }

  if (id.includes('schwab')) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="w-10 h-10 rounded-xl bg-[#004d40] border border-border/60 flex items-center justify-center shrink-0">
          <svg viewBox="0 0 32 32" className="w-6 h-6" aria-hidden>
            <circle cx="16" cy="16" r="10" fill="#00a0df" />
            <text x="16" y="19" textAnchor="middle" fill="white" fontSize="7" fontWeight="700" fontFamily="system-ui">CS</text>
          </svg>
        </div>
        <span className="font-semibold text-lg">Charles Schwab</span>
      </div>
    );
  }

  if (id.includes('robinhood')) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="w-10 h-10 rounded-xl bg-[#00c805] border border-border/60 flex items-center justify-center shrink-0">
          <svg viewBox="0 0 32 32" className="w-5 h-5" aria-hidden>
            <path fill="#fff" d="M8 22 L16 8 L24 22 Z" />
          </svg>
        </div>
        <span className="font-semibold text-lg">Robinhood</span>
      </div>
    );
  }

  return <span className={`font-semibold text-lg ${className}`}>{broker}</span>;
}

export function brokerIdFromName(name: string): BrokerId | string {
  const lower = name.toLowerCase();
  if (lower.includes('thinkorswim')) return 'thinkorswim';
  if (lower.includes('schwab')) return 'schwab';
  if (lower.includes('robinhood')) return 'robinhood';
  return name;
}
