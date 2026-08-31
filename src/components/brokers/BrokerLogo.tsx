import { Landmark } from 'lucide-react';
import { findBrokerEntryByName, normalizeBrokerName } from '../../data/brokerRegistry';

interface BrokerLogoProps {
  broker: string;
  className?: string;
  /** Smaller badge and name, for dense grids where a 64px badge leaves no room for the label. */
  compact?: boolean;
}

// Official broker logos (transparent PNGs), used to indicate a supported integration only —
// Trend Chasers is not affiliated with, and not endorsed by, any of these brokers. Each shows as a
// badge thumbnail of the real logo, paired with a plain-text broker name at a consistent size.
// Every badge is the SAME fixed size (not just the same height) so the row reads as a uniform
// grid. Source PNGs are pre-cropped tight to their actual logo content, so object-contain zooms
// each one to fill as much of that fixed box as its aspect ratio allows, with nothing cropped off.
//
// Brokers without an entry here (see BROKER_REGISTRY's hasLogo: false in ../../data/brokerRegistry)
// don't have an official logo file on hand yet, so they show a generic name badge instead — add a
// file to public/broker-logos/ and register it here once one is available.
const LOGOS: Record<string, { src: string; name: string }> = {
  thinkorswim: { src: '/broker-logos/thinkorswim.png', name: 'thinkorswim' },
  schwab: { src: '/broker-logos/schwab.png', name: 'Charles Schwab' },
  robinhood: { src: '/broker-logos/robinhood.png', name: 'Robinhood' },
  webull: { src: '/broker-logos/webull.png', name: 'Webull' },
  fidelity: { src: '/broker-logos/fidelity.png', name: 'Fidelity' },
  etrade: { src: '/broker-logos/etrade.png', name: 'E*TRADE' },
  'interactive-brokers': { src: '/broker-logos/interactive-brokers.png', name: 'Interactive Brokers' },
  vanguard: { src: '/broker-logos/vanguard.png', name: 'Vanguard' },
  tastytrade: { src: '/broker-logos/tastytrade.png', name: 'tastytrade' },
  tradestation: { src: '/broker-logos/tradestation.png', name: 'TradeStation' },
  tradier: { src: '/broker-logos/tradier.png', name: 'Tradier' },
  public: { src: '/broker-logos/public.png', name: 'Public' },
  alpaca: { src: '/broker-logos/alpaca.png', name: 'Alpaca' },
  moomoo: { src: '/broker-logos/moomoo.png', name: 'Moomoo' },
  chase: { src: '/broker-logos/chase.png', name: 'Chase' },
  citi: { src: '/broker-logos/citi.png', name: 'Citi' },
  'edward-jones': { src: '/broker-logos/edward-jones.png', name: 'Edward Jones' },
  coinbase: { src: '/broker-logos/coinbase.png', name: 'Coinbase' },
  tiaa: { src: '/broker-logos/tiaa.png', name: 'TIAA' },
  pnc: { src: '/broker-logos/pnc.png', name: 'PNC Wealth Management' },
};

function resolveBroker(input: string): { brokerId: string; name: string } | null {
  const norm = normalizeBrokerName(input);
  if (norm.includes('thinkorswim') || norm === 'tos') {
    return { brokerId: 'thinkorswim', name: 'thinkorswim' };
  }

  const entry = findBrokerEntryByName(input);
  if (entry) return { brokerId: entry.brokerId, name: entry.name };
  return null;
}

export function BrokerLogo({ broker, className = '', compact = false }: BrokerLogoProps) {
  const resolved = resolveBroker(broker);

  if (!resolved) {
    return <span className={`font-semibold text-lg ${className}`}>{broker}</span>;
  }

  const logo = LOGOS[resolved.brokerId];

  return (
    /*
     * min-w-0 on both the row and the label: without it a flex item refuses to shrink below the
     * width of its longest unbreakable word, so "thinkorswim" simply ran out past the right edge
     * of its own tile instead of wrapping. That was invisible at three columns and obvious at
     * four — the kind of bug that only shows up once the grid gets denser.
     */
    <div className={`flex items-center ${compact ? 'gap-2.5' : 'gap-3'} min-w-0 ${className}`}>
      <span
        className={`${compact ? 'h-11 w-11 rounded-lg p-1.5' : 'h-16 w-16 rounded-xl p-2'} bg-white border border-border/60 flex items-center justify-center shrink-0`}
      >
        {logo ? (
          <img src={logo.src} alt="" aria-hidden className="h-full w-full object-contain" />
        ) : (
          <Landmark className={`${compact ? 'h-5 w-5' : 'h-7 w-7'} text-slate-500`} aria-hidden />
        )}
      </span>
      <span className={`font-semibold min-w-0 break-words ${compact ? 'text-sm' : 'text-xl'}`}>
        {resolved.name}
      </span>
    </div>
  );
}

export function brokerIdFromName(name: string): string {
  return resolveBroker(name)?.brokerId ?? name;
}
