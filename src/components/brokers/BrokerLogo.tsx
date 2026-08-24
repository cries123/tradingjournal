type BrokerId = 'thinkorswim' | 'schwab' | 'robinhood' | 'webull';

interface BrokerLogoProps {
  broker: BrokerId | string;
  className?: string;
}

// Official broker logos (transparent PNGs), used to indicate a supported integration only —
// Trend Chasers is not affiliated with, and not endorsed by, any of these brokers. Each shows as a
// badge thumbnail of the real logo, paired with a plain-text broker name at a consistent size.
// Every badge is the SAME fixed size (not just the same height) so the row reads as a uniform
// grid. Source PNGs are pre-cropped tight to their actual logo content, so object-contain zooms
// each one to fill as much of that fixed box as its aspect ratio allows, with nothing cropped off.
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
        <span className="h-16 w-16 rounded-xl bg-white border border-border/60 flex items-center justify-center shrink-0 p-2">
          <img src={b.src} alt="" aria-hidden className="h-full w-full object-contain" />
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
