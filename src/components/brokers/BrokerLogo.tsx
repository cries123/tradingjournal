import { Landmark } from 'lucide-react';
import { findBrokerEntryByName, normalizeBrokerName } from '../../data/brokerRegistry';

interface BrokerLogoProps {
  broker: string;
  className?: string;
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

export function BrokerLogo({ broker, className = '' }: BrokerLogoProps) {
  const resolved = resolveBroker(broker);

  if (!resolved) {
    return <span className={`font-semibold text-lg ${className}`}>{broker}</span>;
  }

  const logo = LOGOS[resolved.brokerId];

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span className="h-16 w-16 rounded-xl bg-white border border-border/60 flex items-center justify-center shrink-0 p-2">
        {logo ? (
          <img src={logo.src} alt="" aria-hidden className="h-full w-full object-contain" />
        ) : (
          <Landmark className="h-7 w-7 text-slate-500" aria-hidden />
        )}
      </span>
      <span className="font-semibold text-xl">{resolved.name}</span>
    </div>
  );
}

export function brokerIdFromName(name: string): string {
  return resolveBroker(name)?.brokerId ?? name;
}
