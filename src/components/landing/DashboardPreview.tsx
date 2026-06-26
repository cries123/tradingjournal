export function DashboardPreview() {
  const days = [
    null, null, null, null, null, null, 1,
    2, 3, 4, 5, 6, 7, 8,
    9, 10, 11, 12, 13, 14, 15,
    16, 17, 18, 19, 20, 21, 22,
    23, 24, 25, 26, 27, 28, 29,
    30, null, null, null, null, null, null,
  ];

  const pnl: Record<number, { v: string; win: boolean; trades: number }> = {
    22: { v: '$321', win: true, trades: 5 },
    23: { v: '$396', win: true, trades: 1 },
    24: { v: '-$359', win: false, trades: 8 },
  };

  return (
    <div className="glass-card glow-border rounded-2xl p-4 md:p-5 shadow-2xl shadow-black/40">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs text-text-secondary uppercase tracking-widest">Live preview</p>
          <p className="text-lg font-semibold mt-0.5">June 2026</p>
        </div>
        <span className="text-emerald-400 font-semibold text-sm">+$358.00</span>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-4">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className="text-[9px] text-text-secondary text-center py-1">{d}</div>
        ))}
        {days.map((day, i) => {
          if (!day) return <div key={i} className="h-9 rounded-md bg-bg-primary/40" />;
          const data = pnl[day];
          return (
            <div
              key={i}
              className={`h-9 rounded-md border text-[9px] p-1 flex flex-col justify-between ${
                data
                  ? data.win
                    ? 'border-emerald-500/40 bg-emerald-500/10'
                    : 'border-red-500/40 bg-red-500/10'
                  : 'border-border/40 bg-bg-primary/30'
              }`}
            >
              <span className="text-text-secondary leading-none">{day}</span>
              {data && (
                <span className={`font-bold leading-none ${data.win ? 'text-emerald-400' : 'text-red-400'}`}>
                  {data.v}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Net P&L', value: '$358', accent: true },
          { label: 'Win Rate', value: '50%' },
          { label: 'Avg / Day', value: '$119' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg bg-bg-primary/50 border border-border/60 p-2.5">
            <p className="text-[9px] text-text-secondary">{stat.label}</p>
            <p className={`text-sm font-bold mt-0.5 ${stat.accent ? 'text-emerald-400' : 'text-text-primary'}`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
