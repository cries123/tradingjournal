import { Flame } from 'lucide-react';
import { Sparkline } from '../Sparkline';

export function DashboardPreview() {
  const days = [
    null, null, null, null, null, null, 1,
    2, 3, 4, 5, 6, 7, 8,
    9, 10, 11, 12, 13, 14, 15,
    16, 17, 18, 19, 20, 21, 22,
    23, 24, 25, 26, 27, 28, 29,
    30, null, null, null, null, null, null,
  ];

  const pnl: Record<number, { v: string; win: boolean; trades: number; intensity: number }> = {
    9: { v: '$142', win: true, trades: 3, intensity: 0.4 },
    15: { v: '$96', win: true, trades: 2, intensity: 0.28 },
    22: { v: '$321', win: true, trades: 5, intensity: 0.9 },
    23: { v: '$396', win: true, trades: 1, intensity: 1 },
    24: { v: '-$359', win: false, trades: 8, intensity: 0.95 },
  };

  // A rough cumulative-equity trend for the sparkline — same shape of data
  // StatsCards feeds into its own Sparkline from the real month's running P&L.
  const cumulativeSeries = [0, 142, 118, 214, 358, 358, -1];
  const netTrend = cumulativeSeries.slice(0, -1);

  return (
    <div className="glass-card glow-border-brand relative overflow-hidden rounded-2xl p-4 shadow-2xl shadow-black/40 md:p-5">
      {/* Ambient glow, matching the real dashboard's hero-card::before treatment */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 90% at 8% 0%, rgba(var(--color-profit-bright-rgb), 0.14), transparent 60%), radial-gradient(ellipse 40% 80% at 100% 100%, rgba(var(--color-accent-rgb), 0.1), transparent 60%)',
        }}
      />

      <div className="relative flex items-start justify-between mb-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-secondary">Live preview</p>
          <p className="text-lg font-semibold mt-0.5">June 2026</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-text-secondary">Net P&amp;L</p>
          <div className="flex items-center justify-end gap-2 mt-0.5">
            <Sparkline values={netTrend} positive width={52} height={20} className="hidden sm:block" />
            <span className="hero-value-profit text-xl md:text-2xl font-extrabold leading-none">+$358.00</span>
          </div>
        </div>
      </div>

      <div className="relative grid grid-cols-7 gap-1 mb-4">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className="text-[9px] text-text-secondary text-center py-1">
            {d}
          </div>
        ))}
        {days.map((day, i) => {
          if (!day) return <div key={i} className="h-9 rounded-md bg-bg-primary/30" />;
          const data = pnl[day];

          const borderClass = data
            ? data.win
              ? 'border-profit-bright/50 ring-1 ring-profit-bright/15 shadow-sm shadow-profit-bright/10'
              : 'border-loss-bright/50 ring-1 ring-loss-bright/15 shadow-sm shadow-loss-bright/10'
            : 'border-border/40';

          const alpha = data ? 0.06 + data.intensity * 0.22 : 0;
          const heatStyle = data
            ? {
                background: data.win
                  ? `linear-gradient(160deg, rgba(var(--color-profit-bright-rgb), ${alpha}), rgba(var(--color-profit-bright-rgb), ${alpha * 0.25}))`
                  : `linear-gradient(160deg, rgba(248, 113, 113, ${alpha}), rgba(248, 113, 113, ${alpha * 0.25}))`,
              }
            : undefined;

          return (
            <div
              key={i}
              style={heatStyle}
              className={`h-9 rounded-md border text-[9px] p-1 flex flex-col justify-between bg-bg-card/60 transition-transform duration-200 motion-safe:hover:scale-[1.05] ${borderClass}`}
            >
              <span className="text-text-secondary leading-none">{day}</span>
              {data && (
                <span className={`font-bold leading-none truncate ${data.win ? 'text-profit-bright' : 'text-loss-bright'}`}>
                  {data.v}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="relative flex flex-wrap items-center gap-1.5">
        <span className="stat-chip border-amber-500/30">
          <Flame size={11} className="text-amber-400" />
          <span className="chip-value text-amber-300">4-day streak</span>
        </span>
        <span className="stat-chip">
          Win rate <span className="chip-value text-profit-bright">50%</span>
        </span>
        <span className="stat-chip">
          Avg/day <span className="chip-value text-profit-bright">$119</span>
        </span>
        <span className="stat-chip">
          Profit factor <span className="chip-value text-profit-bright">1.82</span>
        </span>
      </div>
    </div>
  );
}
