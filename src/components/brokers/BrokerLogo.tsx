import { Landmark } from 'lucide-react';
import { resolveBroker } from '../../utils/brokerIds';
import { BROKER_LOGOS } from '../../utils/brokerLogos';

interface BrokerLogoProps {
  broker: string;
  className?: string;
  /** Smaller badge and name, for dense grids where a 64px badge leaves no room for the label. */
  compact?: boolean;
}

// Each logo shows as a badge thumbnail of the real file (utils/brokerLogos), paired with a
// plain-text broker name at a consistent size. Every badge is the SAME fixed size (not just the
// same height) so the row reads as a uniform grid. Source PNGs are pre-cropped tight to their actual
// logo content, so object-contain zooms each one to fill as much of that fixed box as its aspect
// ratio allows, with nothing cropped off.
const LOGOS = BROKER_LOGOS;

export function BrokerLogo({ broker, className = '', compact = false }: BrokerLogoProps) {
  const resolved = resolveBroker(broker);

  if (!resolved) {
    return <span className={`font-semibold text-lg ${className}`}>{broker}</span>;
  }

  const logo = LOGOS[resolved.brokerId];
  const small = compact;

  /*
   * min-w-0 on both the row and the label, because without it a flex item refuses to shrink below
   * the width of its longest unbreakable word and "thinkorswim" ran out past the right edge of its
   * own tile. break-words then wraps it. (The landing page's strip sets nowrap on its tiles instead:
   * a tile that slides past can be as wide as its name.)
   */
  const row = `items-center ${compact ? 'gap-2.5' : 'gap-3'} min-w-0`;
  const label = 'min-w-0 break-words';

  return (
    <div className={`flex ${row} ${className}`}>
      <span
        className={`${small ? 'h-11 w-11 rounded-lg p-1.5' : 'h-16 w-16 rounded-xl p-2'} bg-white border border-border/60 flex items-center justify-center shrink-0`}
      >
        {logo ? (
          <img src={logo.src} alt="" aria-hidden className="h-full w-full object-contain" />
        ) : (
          <Landmark className={`${small ? 'h-5 w-5' : 'h-7 w-7'} text-slate-500`} aria-hidden />
        )}
      </span>
      <span className={`font-semibold ${label} ${small ? 'text-sm' : 'text-xl'}`}>{resolved.name}</span>
    </div>
  );
}
