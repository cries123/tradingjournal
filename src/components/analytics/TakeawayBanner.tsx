import { Lightbulb, TrendingUp } from 'lucide-react';
import type { Takeaway } from '../../utils/takeaway';

interface TakeawayBannerProps {
  takeaway: Takeaway | null;
  /**
   * The AI read of the period, when one has arrived.
   *
   * Overrides the computed text rather than replacing the component, so the banner is on screen
   * with something true from first paint and simply gets sharper a moment later. Tone still comes
   * from the computed takeaway: it is what decides whether this is a warning or a win, and letting
   * the model pick the colour of its own message is a needless way to get an amber banner over
   * good news.
   */
  aiText?: string | null;
  /** True while the model's read of this period is still coming. */
  aiPending?: boolean;
}

/**
 * The one line that gives the dashboard a focal point.
 *
 * Without it every panel below carries equal visual weight and the reader has to do the work of
 * deciding what matters. This states the single most actionable finding for the period, so the
 * page opens with a conclusion rather than a wall of evenly-weighted metrics.
 */
export function TakeawayBanner({ takeaway, aiText, aiPending = false }: TakeawayBannerProps) {
  if (!takeaway) return null;

  /*
   * Hold rather than swap.
   *
   * This used to render the computed line immediately and replace it when the model answered,
   * which put new text under someone who had already started reading — it reads as the app
   * correcting itself rather than as loading. Waiting is only better than swapping while the wait
   * is short, so the hook gives up after a few seconds and pending goes false, at which point the
   * computed line renders and stays.
   */
  const text = aiText?.trim() || (aiPending ? null : takeaway.text);

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
        {text ? (
          <p className="text-xs md:text-sm text-text-primary leading-snug">{text}</p>
        ) : (
          // Two lines at the real text size, so the banner occupies roughly the space the answer
          // will and the page below it doesn't jump when it lands.
          <div className="space-y-1.5 py-0.5" aria-label="Working out what matters this period">
            <div className="h-2.5 w-full max-w-[46ch] rounded bg-text-secondary/15 animate-pulse motion-reduce:animate-none" />
            <div className="h-2.5 w-2/3 max-w-[30ch] rounded bg-text-secondary/15 animate-pulse motion-reduce:animate-none" />
          </div>
        )}
      </div>
    </div>
  );
}
