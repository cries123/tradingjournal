import { useMemo, useState } from 'react';
import { useSettings } from '../../context/useSettings';
import { formatCurrency } from '../../utils/format';

interface EquityCurvePoint {
  /** ISO date for the session this point closes. */
  date: string;
  /** Cumulative net P&L through the end of that session. */
  equity: number;
}

interface EquityCurveProps {
  points: EquityCurvePoint[];
  height?: number;
}

const PAD_TOP = 12;
const PAD_BOTTOM = 18;
const VIEW_W = 1000;

function formatDay(iso: string): string {
  const [, m, d] = iso.split('-');
  return m && d ? `${Number(m)}/${Number(d)}` : iso;
}

/**
 * Cumulative P&L with the drawdown from each running peak shaded underneath.
 *
 * The drawdown band is the point of the chart, not decoration: a curve that ends up and to the
 * right can still hide a stretch where the trader was 40% off their high, and that stretch is
 * what actually decides whether they can stay in the game. Shading it means you read both the
 * result and the ride in one glance.
 */
export function EquityCurve({ points, height = 200 }: EquityCurveProps) {
  const { settings } = useSettings();
  const [hover, setHover] = useState<number | null>(null);

  const model = useMemo(() => {
    if (points.length < 2) return null;

    // The curve starts from flat — a trader's equity before the first session is zero, and
    // without this the first session's move is invisible (it would be the leftmost point).
    const series = [{ date: points[0].date, equity: 0 }, ...points];

    let peak = Number.NEGATIVE_INFINITY;
    const peaks = series.map((p) => {
      peak = Math.max(peak, p.equity);
      return peak;
    });

    const values = [...series.map((p) => p.equity), ...peaks];
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 0);
    const range = max - min || 1;
    const plotH = height - PAD_TOP - PAD_BOTTOM;

    const x = (i: number) => (i / (series.length - 1)) * VIEW_W;
    const y = (v: number) => PAD_TOP + (1 - (v - min) / range) * plotH;

    const linePath = series.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.equity)}`).join(' ');

    // Closed band between the running peak and actual equity — zero-width where at a new high.
    const drawdownPath = [
      ...peaks.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p)}`),
      ...series
        .map((p, i) => ({ p, i }))
        .reverse()
        .map(({ p, i }) => `L ${x(i)} ${y(p.equity)}`),
      'Z',
    ].join(' ');

    const final = series[series.length - 1].equity;
    const maxDrawdown = peaks.reduce((worst, pk, i) => Math.max(worst, pk - series[i].equity), 0);

    return { series, peaks, x, y, linePath, drawdownPath, zeroY: y(0), final, maxDrawdown };
  }, [points, height]);

  if (!model) {
    return (
      <div className="flex items-center justify-center text-xs text-text-secondary" style={{ height }}>
        Log a couple of sessions to see your equity curve
      </div>
    );
  }

  const { series, x, y, linePath, drawdownPath, zeroY, final, maxDrawdown } = model;
  const isProfit = final >= 0;
  const stroke = isProfit ? 'var(--color-profit-bright)' : 'var(--color-loss-bright)';
  const active = hover !== null ? series[hover] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${VIEW_W} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        className="overflow-visible"
        role="img"
        aria-label={`Equity curve ending at ${formatCurrency(final, settings.currency)}`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          const idx = Math.round(ratio * (series.length - 1));
          setHover(Math.min(series.length - 1, Math.max(0, idx)));
        }}
      >
        <defs>
          <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Break-even reference. Everything below this line is a losing period. */}
        <line
          x1="0"
          x2={VIEW_W}
          y1={zeroY}
          y2={zeroY}
          stroke="rgba(148,163,184,0.28)"
          strokeWidth="1"
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />

        {/* Area under the curve, then the drawdown band on top of it. */}
        <path d={`${linePath} L ${VIEW_W} ${zeroY} L 0 ${zeroY} Z`} fill="url(#equityFill)" />
        <path d={drawdownPath} fill="rgba(248,113,113,0.16)" />

        <path
          d={linePath}
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {active && (
          <>
            <line
              x1={x(hover as number)}
              x2={x(hover as number)}
              y1={PAD_TOP}
              y2={height - PAD_BOTTOM}
              stroke="rgba(148,163,184,0.45)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={x(hover as number)} cy={y(active.equity)} r="4" fill={stroke} />
          </>
        )}
      </svg>

      <div className="flex items-center justify-between text-[10px] text-text-secondary mt-1 tabular-nums">
        <span>{formatDay(series[0].date)}</span>
        {active ? (
          <span className="text-text-primary font-medium">
            {formatDay(active.date)} ·{' '}
            <span className={active.equity >= 0 ? 'text-profit-bright' : 'text-loss-bright'}>
              {formatCurrency(active.equity, settings.currency)}
            </span>
          </span>
        ) : (
          maxDrawdown > 0 && (
            <span>
              <span className="inline-block w-2 h-2 rounded-sm bg-loss-bright/30 align-middle mr-1" />
              Max drawdown {formatCurrency(-maxDrawdown, settings.currency)}
            </span>
          )
        )}
        <span>{formatDay(series[series.length - 1].date)}</span>
      </div>
    </div>
  );
}
