type BrokerId = 'thinkorswim' | 'schwab' | 'robinhood' | 'webull';

interface BrokerLogoProps {
  broker: BrokerId | string;
  className?: string;
}

// Official broker logos (transparent PNGs), used to indicate a supported integration only —
// Trend Chasers is not affiliated with, and not endorsed by, any of these brokers. Each shows as a
// badge thumbnail of the real logo, paired with a plain-text broker name at a consistent size.
// The badge is locked to a consistent HEIGHT (not a fixed square) so wide wordmark logos
// (thinkorswim/robinhood) render at full size and stay fully legible, instead of either shrinking
// tiny inside a square (object-contain) or getting their edges cropped off (object-cover).
const BROKERS: Record<BrokerId, { src: string; name: string }> = {
  thinkorswim: { src: '/broker-logos/thinkorswim.png', name: 'thinkorswim' },
  schwab: { src: '/broker-logos/schwab.png', name: 'Charles Schwab' },
  robinhood: { src: '/broker-logos/robinhood.png', name: 'Robinhood' },
  webull: { src: '/broker-logos/webull.png', name: 'Webull' },
};

export function BrokerLogo({ broker, className = '' }: BrokerLogoProps) {
  const id = broker.toLowerCase().replace(/\s+/g, '');

  const key: BrokerId | null = id.includes('thinkorswim') || id === 'tos'
    ? 'thinkorswim'
    : id.includes('schwab')
      ? 'schwab'
      : id.includes('webull')
        ? 'webull'
        : id.includes('robinhood')
          ? 'robinhood'
          : null;

  if (key) {
    const b = BROKERS[key];
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <span className="h-14 min-w-14 rounded-xl bg-white border border-border/60 flex items-center justify-center shrink-0 px-2.5">
          <img src={b.src} alt="" aria-hidden className="h-full w-auto max-w-[9rem] object-contain" />
        </span>
        <span className="font-semibold text-xl">{b.name}</span>
      </div>
    );
  }

  return <span className={`font-semibold text-lg ${className}`}>{broker}</span>;
}

export function brokerIdFromName(name: string): BrokerId | string {
  const lower = name.toLowerCase();
  if (lower.includes('thinkorswim')) return 'thinkorswim';
  if (lower.includes('schwab')) return 'schwab';
  if (lower.includes('webull')) return 'webull';
  if (lower.includes('robinhood')) return 'robinhood';
  return name;
}
