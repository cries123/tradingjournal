export function DashboardSkeleton() {
  return (
    <div className="h-full flex flex-col gap-2 md:gap-3 min-h-0 animate-pulse">
      <div className="panel-card p-4 shrink-0">
        <div className="flex justify-between mb-4">
          <div className="space-y-2">
            <div className="h-3 w-16 skeleton-shimmer rounded" />
            <div className="h-5 w-32 skeleton-shimmer rounded" />
          </div>
          <div className="h-6 w-24 skeleton-shimmer rounded" />
        </div>
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="aspect-square md:h-[72px] md:aspect-auto skeleton-shimmer rounded-lg" />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3 shrink-0">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="stat-card p-3 md:p-4 space-y-2">
            <div className="h-3 w-20 skeleton-shimmer rounded" />
            <div className="h-6 w-24 skeleton-shimmer rounded" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3 flex-1">
        <div className="panel-card p-4 min-h-[120px] skeleton-shimmer rounded-xl" />
        <div className="panel-card p-4 min-h-[140px] skeleton-shimmer rounded-xl" />
      </div>
    </div>
  );
}
