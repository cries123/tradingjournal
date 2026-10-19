import { useId, useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import type { Trade } from '../../types';
import { formatCurrency } from '../../utils/format';
import { equityCurve, equityGeometry } from '../../utils/equityCurve';
import { useReveal } from '../../hooks/useReveal';

type Currency = Parameters<typeof formatCurrency>[1];

/** The box the curve is laid into. Stretched to the card, so these are proportions, not pixels. */
const W = 600;
const H = 160;

function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Running P&L, day by day, with the drawdown shaded under the high-water mark.
 *
 * The SVG is stretched to the card (preserveAspectRatio none), which keeps the line full width at
 * any size but would stretch a circle into an ellipse — so the marker and the labels are HTML,
 * positioned by percentage over the same box. The line draws itself once on arrival (.equity-line
 * in index.css) and is simply there under reduced motion.
 */
export function EquityCurve({
  trades,
  currency,
  periodLabel,
}: {
  trades: Trade[];
  currency: Currency;
  periodLabel?: string;
}) {
  const curve = useMemo(() => equityCurve(trades), [trades]);
  const geometry = useMemo(() => (curve ? equityGeometry(curve, W, H) : null), [curve]);
  const { ref, revealProps } = useReveal();
  const gradientId = useId();

  if (!curve || !geometry) return null;

  const fmt = (n: number) => formatCurrency(n, currency);
  const up = curve.final >= 0;
  const first = curve.points[0]!;
  const last = curve.points[curve.points.length - 1]!;
  const end = geometry.xy[geometry.xy.length - 1]!;
  const lineColour = up ? 'var(--color-profit-bright)' : 'var(--color-loss-bright)';

  return (
    <div ref={ref} {...revealProps} className="reveal panel-card spotlight p-3 md:p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-start gap-2 min-w-0">
          <span className="text-accent/80 mt-0.5 shrink-0">
            <TrendingUp size={14} />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-accent/80 font-medium mb-0.5">Equity</p>
            <h3 className="text-xs md:text-sm font-semibold text-text-primary">
              Running P&amp;L{periodLabel ? ` · ${periodLabel}` : ''}
            </h3>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[9px] uppercase tracking-wide text-text-secondary leading-none mb-1">
            {curve.maxDrawdown > 0 ? 'Max drawdown' : 'No drawdown'}
          </p>
          <p className="text-lg md:text-2xl font-bold tabular-nums leading-none text-loss-bright">
            {curve.maxDrawdown > 0 ? `−${fmt(curve.maxDrawdown)}` : '—'}
          </p>
        </div>
      </div>

      <div className="relative mt-3 h-28 md:h-40">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full overflow-visible"
          aria-hidden
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColour} stopOpacity="0.28" />
              <stop offset="100%" stopColor={lineColour} stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* The drawdown: everything between the running high and where the account actually was. */}
          <path d={geometry.drawdownBand} style={{ fill: 'var(--color-loss-bright)', opacity: 0.16 }} />
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
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {geometry.trough && curve.trough && (
          <>
            <span
              className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-loss-bright ring-2 ring-bg-card"
              style={{ left: `${(geometry.trough.x / W) * 100}%`, top: `${(geometry.trough.y / H) * 100}%` }}
              aria-hidden
            />
            <span
              className={`absolute whitespace-nowrap rounded bg-bg-card/85 px-1 text-[9px] text-loss-bright tabular-nums ${
                geometry.trough.x > W * 0.7 ? '-translate-x-full' : geometry.trough.x < W * 0.15 ? '' : '-translate-x-1/2'
              } ${
                // A trough near the floor of the box would print its label over the date row.
                geometry.trough.y > H * 0.75 ? '-translate-y-full -mt-2' : 'mt-1.5'
              }`}
              style={{ left: `${(geometry.trough.x / W) * 100}%`, top: `${(geometry.trough.y / H) * 100}%` }}
            >
              −{fmt(curve.maxDrawdown)} · {dayLabel(curve.trough.date)}
            </span>
          </>
        )}

        <span
          className={`absolute -translate-x-full -translate-y-full whitespace-nowrap pb-1 text-[11px] md:text-xs font-semibold tabular-nums ${
            up ? 'text-profit-bright' : 'text-loss-bright'
          }`}
          style={{ left: `${(end.x / W) * 100}%`, top: `${(end.y / H) * 100}%` }}
        >
          {fmt(curve.final)}
        </span>
      </div>

      <div className="mt-1.5 flex justify-between text-[9px] text-text-secondary tabular-nums">
        <span>{dayLabel(first.date)}</span>
        <span>
          {curve.points.length} trading day{curve.points.length === 1 ? '' : 's'}
        </span>
        <span>{dayLabel(last.date)}</span>
      </div>
    </div>
  );
}
