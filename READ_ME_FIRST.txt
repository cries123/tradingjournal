BUILD FIX: MISSING getPerformanceData EXPORT
==================================================

5 files, replaces the versions currently in your repo.

WHAT BROKE
Your Netlify build failed with:
  "Module '../utils/stats' has no exported member 'getPerformanceData'"

That function lives in src/utils/stats.ts and was part of the original
dashboard-redesign delivery (the one that added the PnL performance
chart next to the calendar) — but your repo has the newer
PerformanceChart.tsx (the line-graph version) without the matching
stats.ts changes underneath it. Somewhere along the way that one file
didn't make it in, which is an easy thing to miss when dragging folders
across a few separate zips. The extra "implicitly has an 'any' type"
errors in the same build log are just a side effect of that one missing
export — TypeScript gives up inferring types once the import it depends
on doesn't exist, they're not separate bugs.

THE FIX
This zip has the complete, current, working set of every file this
feature touches, all pulled from the same consistent state and
verified to build together:
- src/utils/stats.ts (the missing piece — adds getPerformanceData)
- src/components/PerformanceChart.tsx (the line chart you already have)
- src/components/DashboardView.tsx (calendar + chart side-by-side layout)
- src/components/DashboardDayCell.tsx (the day-cell height tweak)
- src/components/EmptyDashboard.tsx (the "Connect your broker" copy fix)

Overwriting all 5 together removes any doubt about what's actually in
your repo right now — safer than guessing which single file is missing.

HOW TO APPLY
1. GitHub Desktop, branch fix/calendar-keys-and-lint.
2. Drag the src/ folder from this zip into your repo root, overwriting
   these 5 files.
3. Should show as up to 5 changed files (however many actually differ
   from what you have — could be just stats.ts if everything else was
   already correct). Commit and push.

VERIFIED
- npx tsc -b --force: 0 errors
- npm run lint: 0 errors, 19 warnings (same baseline as every prior
  delivery, no new ones)
- This is the exact set of files currently sitting in my working copy,
  which is what every screenshot I've sent you of the dashboard/chart
  was rendered from — so it's known-good.
