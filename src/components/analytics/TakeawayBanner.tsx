import { Lightbulb, TrendingUp } from 'lucide-react';
import type { Takeaway } from '../../utils/takeaway';

interface TakeawayBannerProps {
  takeaway: Takeaway | null;
}

/**
 * The one line that gives the dashboard a focal point.
 *
 * Without it every panel below carries equal visual weight and the reader has to do the work of
 * deciding what matters. This states the single most actionable finding for the period, so the
 * page opens with a conclusion rather than a wall of evenly-weighted metrics.
 */
export function TakeawayBanner({ takeaway }: TakeawayBannerProps) {
  if (!takeaway) return null;

  const isWarning = takeaway.tone === 'warning';

  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 shrink-0 ${
        isWarning
          ? 'border-amber-500/30 bg-amber-500/[0.07]'
          : 'border-profit-bright/30 bg-profit-bright/[0.06]'
      }`}
    >
      <span className={`mt-0.5 shrink-0 ${isWarning ? 'text-amber-400' : 'text-profit-bright'}`}>
        {isWarning ? <Lightbulb size={15} /> : <TrendingUp size={15} />}
      </span>
      <div className="min-w-0">
        <p
          className={`text-[10px] uppercase tracking-widest font-semibold mb-0.5 ${
            isWarning ? 'text-amber-400/90' : 'text-profit-bright/90'
          }`}
        >
          {isWarning ? 'Worth fixing' : "What's working"}
        </p>
        <p className="text-xs md:text-sm text-text-primary leading-snug">{takeaway.text}</p>
      </div>
    </div>
  );
}
