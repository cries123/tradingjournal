import { Landmark } from 'lucide-react';
import { resolveBroker } from '../../utils/brokerIds';
import { BROKER_LOGOS } from '../../utils/brokerLogos';

interface BrokerLogoProps {
  broker: string;
  className?: string;
  /** Smaller badge and name, for dense grids where a 64px badge leaves no room for the label. */
  compact?: boolean;
  /**
   * Compact, laid out by the width of the tile it sits in rather than the screen's, and the name
   * wraps only between words. The tile must be a size container (`@container`). For grids whose
   * tiles can get narrower than a badge plus "thinkorswim" — see components/landing/BrokerGrid.
   */
  fit?: boolean;
}

// Each logo shows as a badge thumbnail of the real file (utils/brokerLogos), paired with a
// plain-text broker name at a consistent size. Every badge is the SAME fixed size (not just the
// same height) so the row reads as a uniform grid. Source PNGs are pre-cropped tight to their actual
// logo content, so object-contain zooms each one to fill as much of that fixed box as its aspect
// ratio allows, with nothing cropped off.
const LOGOS = BROKER_LOGOS;

export function BrokerLogo({ broker, className = '', compact = false, fit = false }: BrokerLogoProps) {
  const resolved = resolveBroker(broker);

  if (!resolved) {
    return <span className={`font-semibold text-lg ${className}`}>{broker}</span>;
  }

  const logo = LOGOS[resolved.brokerId];
  const small = compact || fit;

  /*
   * Full-size and compact: min-w-0 on both the row and the label, because without it a flex item
   * refuses to shrink below the width of its longest unbreakable word and "thinkorswim" ran out
   * past the right edge of its own tile. break-words then wraps it.
   *
   * Inside the word, though — on the landing page's four-column card that cure printed
   * "thinkors / wim" and "Vanguar / d". So `fit` does the opposite: the label never shrinks below
   * its longest word (break-normal, no min-w-0) and the layout makes room for it instead. Badge
   * beside the name from 9rem of tile — the 44px badge, the 10px gap and 90px of name — and above
   * it below that. 90px is the widest word any registered broker has ("Management", 84px in
   * Figtree 600 at 14px) plus a few px for a fallback font; landingRender.test.ts holds the
   * measurements and fails if a broker is added with a word nobody measured.
   */
  const row = fit
    ? 'flex-col items-center gap-2 text-center @min-[9rem]:flex-row @min-[9rem]:gap-2.5 @min-[9rem]:text-left'
    : `items-center ${compact ? 'gap-2.5' : 'gap-3'} min-w-0`;
  const label = fit ? 'break-normal' : 'min-w-0 break-words';

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
