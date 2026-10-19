import { useId, useMemo } from 'react';
import type { Trade } from '../../types';
import { formatCurrency } from '../../utils/format';
import { equityCurve, equityGeometry } from '../../utils/equityCurve';

type Currency = Parameters<typeof formatCurrency>[1];

/** The box the curve is laid into. Stretched to its strip, so these are proportions, not pixels. */
const W = 600;
const H = 60;

function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Running P&L, day by day, as a strip inside the Net P&L card — the drawdown shaded under the
 * high-water mark, the trough marked, and one line of labels.
 *
 * It was a card of its own, a third of a screen tall, and that was too much room for a line
 * whose job is a one-second read. As a strip under the figures it costs about forty pixels and
 * sits beside the number it explains.
 *
 * The SVG is stretched to the strip (preserveAspectRatio none), which keeps the line full width at
 * any size but would stretch a circle into an ellipse — so the marker is HTML, positioned by
 * percentage over the same box. The line draws itself once on arrival (.equity-line in index.css,
 * paused until the card is revealed) and is simply there under reduced motion.
 */
export function EquityCurve({ trades, currency }: { trades: Trade[]; currency: Currency }) {
  const curve = useMemo(() => equityCurve(trades), [trades]);
  const geometry = useMemo(() => (curve ? equityGeometry(curve, W, H, 3) : null), [curve]);
  const gradientId = useId();

  if (!curve || !geometry) return null;

  const fmt = (n: number) => formatCurrency(n, currency);
  const up = curve.final >= 0;
  const first = curve.points[0]!;
  const last = curve.points[curve.points.length - 1]!;
  const lineColour = up ? 'var(--color-profit-bright)' : 'var(--color-loss-bright)';

  return (
    <div className="relative mt-2.5 md:mt-3" aria-label="Running P&L by day">
      <div className="relative h-10 md:h-14">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full overflow-visible"
          aria-hidden
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColour} stopOpacity="0.22" />
              <stop offset="100%" stopColor={lineColour} stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* The drawdown: everything between the running high and where the account actually was. */}
          <path d={geometry.drawdownBand} style={{ fill: 'var(--color-loss-bright)', opacity: 0.14 }} />
          <line
            x1="0"
            x2={W}
            y1={geometry.zeroY}
            y2={geometry.zeroY}
            stroke="var(--color-border)"
            strokeDasharray="3 4"
            vectorEffect="non-scaling-stroke"
          />
          <path d={geometry.area} fill={`url(#${gradientId})`} />
          <path
            d={geometry.line}
            pathLength={1}
            className="equity-line"
            fill="none"
            stroke={lineColour}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {geometry.trough && (
          <span
            className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-loss-bright"
            style={{ left: `${(geometry.trough.x / W) * 100}%`, top: `${(geometry.trough.y / H) * 100}%` }}
            aria-hidden
          />
        )}
      </div>

      <div className="mt-1 flex items-center justify-between gap-2 text-[9px] text-text-secondary tabular-nums">
        <span>{dayLabel(first.date)}</span>
        <span className="truncate">
          Running P&amp;L · {curve.points.length} day{curve.points.length === 1 ? '' : 's'}
          {curve.trough && (
            <>
              {' '}· <span className="text-loss-bright">max drawdown −{fmt(curve.maxDrawdown)}</span>, {dayLabel(curve.trough.date)}
            </>
          )}
        </span>
        <span>{dayLabel(last.date)}</span>
      </div>
    </div>
  );
}
