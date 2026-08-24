import { useEffect, useId, useMemo, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import type { Trade } from '../types';
import { getPerformanceData, type PerformancePeriod } from '../utils/stats';
import { formatCurrency } from '../utils/format';
import { useSettings } from '../context/SettingsContext';

interface PerformanceChartProps {
  trades: Trade[];
}

const TABS: { key: PerformancePeriod; label: string; headline: string }[] = [
  { key: 'day', label: 'Day', headline: 'Today' },
  { key: 'week', label: 'Week', headline: 'This week' },
  { key: 'month', label: 'Month', headline: 'This month' },
  { key: 'year', label: 'Year', headline: 'This year' },
  { key: 'all', label: 'All time', headline: 'All time' },
];

const CHART_W = 600;
const CHART_H = 168;
const PAD_TOP = 14;
const PAD_BOTTOM = 14;
const PAD_X = 8;

/** Smooth line through `pts` using quadratic Bezier segments via each pair's midpoint — simple,
 *  cheap, and avoids the sharp zig-zag a plain polyline gives an equity curve. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y} L ${pts[0].x} ${pts[0].y}`;
  if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;

  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const curr = pts[i];
    const next = pts[i + 1];
    const midX = (curr.x + next.x) / 2;
    const midY = (curr.y + next.y) / 2;
    d += ` Q ${curr.x} ${curr.y} ${midX} ${midY}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

export function PerformanceChart({ trades }: PerformanceChartProps) {
  const { settings } = useSettings();
  const gradientId = useId();
  const [period, setPeriod] = useState<PerformancePeriod>('week');
  const [animate, setAnimate] = useState(false);

  const data = useMemo(() => getPerformanceData(trades, period), [trades, period]);
  const activeTab = TABS.find((t) => t.key === period)!;

  useEffect(() => {
    setAnimate(false);
    const raf = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(raf);
  }, [period, trades]);

  const { buckets, cumulative } = data;
  const isProfit = data.headlinePnl >= 0;
  const windowTotal = cumulative[cumulative.length - 1] ?? 0;
  const windowProfit = windowTotal >= 0;

  const chart = useMemo(() => {
    if (buckets.length === 0) return null;

    const usableH = CHART_H - PAD_TOP - PAD_BOTTOM;
    const usableW = CHART_W - PAD_X * 2;
    const slotX = buckets.length > 1 ? usableW / (buckets.length - 1) : 0;

    const cumMin = Math.min(...cumulative, 0);
    const cumMax = Math.max(...cumulative, 0);
    const cumRange = Math.max(cumMax - cumMin, 1);

    const points = buckets.map((b, i) => {
      const x = buckets.length > 1 ? PAD_X + i * slotX : CHART_W / 2;
      const v = cumulative[i] ?? 0;
      const y = PAD_TOP + usableH - ((v - cumMin) / cumRange) * usableH;
      const flat = b.pnl === 0;
      return { key: b.key, x, y, flat, profit: b.pnl > 0, label: b.label, pnl: b.pnl, cumulative: v };
    });

    const zeroY = PAD_TOP + usableH - ((0 - cumMin) / cumRange) * usableH;
    // A single bucket (e.g. a trader's first year, with only one year of history) has nothing to
    // draw a line between — smoothPath degenerates to a zero-length path. Draw the total as a flat
    // line spanning the full width instead of a near-invisible dot.
    const linePoints = points.length === 1
      ? [{ ...points[0], x: PAD_X }, { ...points[0], x: CHART_W - PAD_X }]
      : points;
    const linePath = smoothPath(linePoints);
    const areaPath = linePoints.length
      ? `${linePath} L ${linePoints[linePoints.length - 1].x} ${PAD_TOP + usableH} L ${linePoints[0].x} ${PAD_TOP + usableH} Z`
      : '';

    return { points, linePath, areaPath, zeroY };
  }, [buckets, cumulative]);

  const fmt = (n: number) => formatCurrency(n, settings.currency);

  return (
    <div className="panel-card p-2.5 md:p-4 flex flex-col h-full">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-2 md:mb-3 shrink-0">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-emerald-400/80 font-medium mb-0.5">Performance</p>
          <h3 className="text-[10px] md:text-sm font-semibold text-text-primary">P&amp;L over time</h3>
        </div>
        <div className="flex rounded-lg bg-bg-tertiary/60 p-0.5 border border-border/50">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setPeriod(t.key)}
              className={`px-2 md:px-2.5 py-1 rounded-md text-[10px] md:text-xs font-medium transition-colors focus-ring whitespace-nowrap ${
                period === t.key ? 'bg-emerald-500/15 text-emerald-300' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {buckets.length === 0 ? (
        <div className="flex-1 min-h-[140px] flex items-center justify-center text-xs text-text-secondary">
          No trades yet — this fills in once you log or sync your first trade.
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-2 mb-2 shrink-0">
            <span className="text-[10px] md:text-xs text-text-secondary uppercase tracking-wide">{activeTab.headline}</span>
            <span className={`text-lg md:text-2xl font-bold tracking-tight ${isProfit ? 'text-profit-bright' : 'text-loss-bright'}`}>
              {fmt(data.headlinePnl)}
            </span>
            <span className="text-[10px] md:text-xs text-text-secondary">
              {data.headlineTrades} trade{data.headlineTrades === 1 ? '' : 's'}
            </span>
          </div>

          <div className="flex-1 min-h-[110px] md:min-h-[140px]">
            {chart && (
              <svg
                viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                preserveAspectRatio="none"
                className="w-full h-full overflow-visible"
                role="img"
                aria-label={`${activeTab.label} profit and loss chart`}
              >
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={windowProfit ? 'var(--color-profit-bright)' : 'var(--color-loss-bright)'} stopOpacity="0.32" />
                    <stop offset="100%" stopColor={windowProfit ? 'var(--color-profit-bright)' : 'var(--color-loss-bright)'} stopOpacity="0" />
                  </linearGradient>
                </defs>

                <line x1={0} y1={chart.zeroY} x2={CHART_W} y2={chart.zeroY} stroke="currentColor" className="text-border/60" strokeWidth={1} />

                <path
                  d={chart.areaPath}
                  fill={`url(#${gradientId})`}
                  opacity={animate ? 1 : 0}
                  style={{ transition: 'opacity 500ms ease-out' }}
                />

                <path
                  d={chart.linePath}
                  fill="none"
                  className={windowProfit ? 'stroke-profit-bright' : 'stroke-loss-bright'}
                  strokeWidth={2.25}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pathLength={100}
                  strokeDasharray={100}
                  strokeDashoffset={animate ? 0 : 100}
                  style={{ transition: 'stroke-dashoffset 650ms ease-out' }}
                />

                {chart.points.map((pt) => (
                  <circle
                    key={pt.key}
                    cx={pt.x}
                    cy={pt.y}
                    r={chart.points.length > 20 ? 0 : 3}
                    className={pt.flat ? 'fill-text-secondary/60' : pt.profit ? 'fill-profit-bright' : 'fill-loss-bright'}
                    stroke="var(--color-bg-card)"
                    strokeWidth={1.5}
                    opacity={animate ? 1 : 0}
                    style={{ transition: 'opacity 400ms ease-out', transitionDelay: '500ms' }}
                  >
                    <title>
                      {pt.label}: {fmt(pt.pnl)} · running total {fmt(pt.cumulative)}
                    </title>
                  </circle>
                ))}
              </svg>
            )}
          </div>

          <div className="flex justify-between mt-1 shrink-0 gap-1">
            {buckets.map((b, i) => (
              <span
                key={b.key}
                className={`text-[8px] md:text-[9px] text-text-secondary truncate flex-1 text-center ${
                  buckets.length > 12 && i % 2 === 1 ? 'hidden md:block' : ''
                }`}
              >
                {b.label}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-1.5 mt-2 text-[9px] md:text-[10px] text-text-secondary shrink-0">
            <TrendingUp size={11} className={windowProfit ? 'text-profit-bright' : 'text-loss-bright'} />
            <span>{fmt(windowTotal)} cumulative over this window</span>
          </div>
        </>
      )}
    </div>
  );
}
