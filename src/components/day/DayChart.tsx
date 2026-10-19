import type { DayPoint } from '../../utils/dayReport';
import { ordinal } from '../../utils/dayReport';

interface DayChartProps {
  points: DayPoint[];
  /** The trade cap, to shade everything past it. */
  cap?: number;
  /** The daily loss limit, as a positive number, to draw as a line when the day came near it. */
  lossLimit?: number;
  fmt: (n: number) => string;
}

/** Inner box in percent, leaving room for the labels drawn over it. */
const X0 = 6;
const X1 = 96;
const Y0 = 10;
const Y1 = 88;

/**
 * The day's running total after each trade — the shape of the day in one line.
 *
 * Lines and fills are SVG stretched to the box; the dots and every label are HTML placed by
 * percentage, so text stays readable on a phone instead of shrinking with a scaled drawing. Points
 * are evenly spaced by trade rather than by clock, because most imports have no fill times and an
 * axis of invented times would be worse than an honest "1st, 2nd, 3rd".
 */
export function DayChart({ points, cap, lossLimit, fmt }: DayChartProps) {
  if (points.length === 0) return null;
  const totals = [0, ...points.map((p) => p.running)];
  const low = Math.min(...totals);
  const high = Math.max(...totals);
  // The limit line only when the day went at least halfway to it — otherwise it squashes the line.
  const showLimit = lossLimit != null && lossLimit > 0 && -low >= lossLimit * 0.5;
  const min = Math.min(low, showLimit ? -lossLimit! * 1.08 : low);
  const max = Math.max(high, 0);
  const span = max - min || 1;

  const x = (i: number) => X0 + ((X1 - X0) * i) / Math.max(1, points.length);
  const y = (v: number) => Y0 + ((max - v) / span) * (Y1 - Y0);
  const coords = totals.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const last = totals.at(-1)!;
  const stroke = last >= 0 ? 'var(--color-profit-bright)' : 'var(--color-loss-bright)';
  const capX = cap != null && points.length > cap ? x(cap) : null;
  const allTimed = points.every((p) => Boolean(p.trade.entryTime));

  return (
    <div>
      <div className="relative h-44 md:h-52">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
          {capX != null && <rect x={capX} y={Y0 - 6} width={X1 + 2 - capX} height={Y1 - Y0 + 8} fill="rgba(251,191,36,0.06)" />}
          {capX != null && <line x1={capX} x2={capX} y1={Y0 - 6} y2={Y1 + 2} stroke="rgba(251,191,36,0.6)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
          <line x1={X0} x2={X1} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.12)" vectorEffect="non-scaling-stroke" />
          {showLimit && (
            <line x1={X0} x2={X1} y1={y(-lossLimit!)} y2={y(-lossLimit!)} stroke="rgba(248,113,113,0.6)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          )}
          <polyline points={coords} fill="none" stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>

        {totals.slice(1).map((v, i) => (
          <span
            key={points[i].trade.id}
            title={`${ordinal(i + 1)} trade: ${fmt(points[i].pnl)}, day ${fmt(v)}`}
            className={`absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-bg-card ${
              points[i].pnl >= 0 ? 'border-profit-bright' : 'border-loss-bright'
            } ${i === totals.length - 2 ? (v >= 0 ? 'bg-profit-bright' : 'bg-loss-bright') : ''}`}
            style={{ left: `${x(i + 1)}%`, top: `${y(v)}%` }}
          />
        ))}

        <span className="absolute left-0 -translate-y-1/2 text-[11px] text-text-secondary" style={{ top: `${y(0)}%` }}>
          $0
        </span>
        {showLimit && (
          <span className="absolute left-[7%] -translate-y-full pb-0.5 text-[11px] text-loss-bright" style={{ top: `${y(-lossLimit!)}%` }}>
            Daily loss limit {fmt(-lossLimit!)}
          </span>
        )}
        {capX != null && (
          <span className="absolute top-0 pl-1.5 text-[11px] text-amber-300" style={{ left: `${capX}%` }}>
            Past your {cap}-trade cap
          </span>
        )}
      </div>

      <div className="relative h-5 text-[11px] text-text-secondary">
        <span className="absolute -translate-x-1/2" style={{ left: `${x(0)}%` }}>
          Open
        </span>
        {points.map((p, i) => (
          <span key={p.trade.id} className="absolute -translate-x-1/2 tabular-nums" style={{ left: `${x(i + 1)}%` }}>
            {/* Times when every trade has one; positions otherwise, and only every other one when
                a long day would crowd them. */}
            {allTimed ? p.trade.entryTime!.slice(0, 5) : points.length > 8 && i % 2 === 1 ? '' : ordinal(i + 1)}
          </span>
        ))}
      </div>
    </div>
  );
}
