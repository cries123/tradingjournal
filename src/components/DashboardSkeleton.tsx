/**
 * The Overview while the journal loads, in the Overview's own shape.
 *
 * It used to be a 7-column calendar first and six stat cards under it — a layout the dashboard has
 * not had since the hero card and the week-total column arrived — so the moment the data landed
 * every block jumped to a different place. Now each placeholder sits where the real thing will:
 * header, hero with its figures across, the takeaway strip, then the calendar with its eight
 * columns. The real dashboard fades in over it (see the keyed wrapper in JournalApp).
 *
 * One shimmer, no pulse on top of it; under reduced motion the shimmer is off too.
 */
export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-2 md:gap-3 min-h-0" aria-busy="true" aria-label="Loading your journal">
      <div className="flex flex-wrap items-center gap-3 px-0.5">
        <div className="hidden md:block h-9 w-40 skeleton-shimmer rounded-lg" />
        <div className="h-8 w-36 skeleton-shimmer rounded-lg" />
        <div className="h-8 w-64 skeleton-shimmer rounded-full" />
      </div>

      <div className="hero-card p-3 md:p-5 shrink-0">
        <div className="relative flex flex-col md:flex-row md:items-center gap-3 md:gap-8">
          <div className="space-y-2 shrink-0">
            <div className="h-3 w-32 skeleton-shimmer rounded" />
            <div className="h-9 md:h-12 w-48 md:w-64 skeleton-shimmer rounded-lg" />
            <div className="h-3 w-40 skeleton-shimmer rounded" />
          </div>
          <div className="grid grid-cols-2 gap-3 md:flex-1 md:grid-cols-3 xl:grid-cols-5 md:gap-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-2.5 w-16 skeleton-shimmer rounded" />
                <div className="h-5 w-20 skeleton-shimmer rounded" />
              </div>
            ))}
          </div>
        </div>
        <div className="relative mt-3 md:mt-4 h-1 skeleton-shimmer rounded-full" />
      </div>

      <div className="h-14 skeleton-shimmer rounded-xl" />

      <div className="panel-card p-2 md:p-4 shrink-0">
        <div className="flex justify-between mb-3">
          <div className="space-y-2">
            <div className="h-2.5 w-16 skeleton-shimmer rounded" />
            <div className="h-5 w-32 skeleton-shimmer rounded" />
          </div>
          <div className="h-8 w-48 skeleton-shimmer rounded-lg" />
        </div>
        <div className="grid grid-cols-8 gap-0.5 md:gap-2">
          {Array.from({ length: 40 }).map((_, i) => (
            <div key={i} className="aspect-square md:aspect-auto md:h-[108px] skeleton-shimmer rounded-sm md:rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
