CALENDAR: FULL WIDTH + WEEK TOTAL COLUMN
================================================

3 files (2 modified, 1 new).

WHAT CHANGED

1. Calendar now spans the full width
   It was capped to a centered ~820px box, which is exactly what made
   it look like it was floating in a sea of empty space next to your
   full-width stat cards. That cap is gone — the calendar (and the
   Year view) now stretches edge-to-edge from the sidebar to the right
   side of the window, same as every other card on the page. Since the
   day cells scale with the available width, they're noticeably
   bigger now too.

2. Saturday's column is now a "Week total"
   Each week row is Sun–Fri plus one more column on the right showing
   that week's total P&L and trade count, instead of a mostly-empty
   Saturday cell (fine detail: the total still includes any actual
   Saturday trades in the sum, in the rare case you have any — it's
   just not broken out into its own cell anymore). It's styled
   distinctly from the day cells — blue "WEEK TOTAL" label, tinted
   green/red border by that week's result — so it reads as a summary
   column, not just another day.

FILES
- src/components/DashboardView.tsx — removed the width cap
- src/components/DashboardCalendar.tsx — 6-day week (Sun–Fri) +
  week-total column, both in the header row and the grid
- src/components/DashboardWeekTotalCell.tsx (new) — the week-total
  cell component, matching the day cells' sizing so the grid still
  lines up

HOW TO APPLY
1. GitHub Desktop, branch fix/calendar-keys-and-lint.
2. Drag the src/ folder from this zip into your repo root.
   DashboardWeekTotalCell.tsx will show up as a new file; the other 2
   overwrite what's there.
3. Should show as 3 changed files (1 added, 2 modified). Commit and
   push.

VERIFIED
- Rendered the dashboard with ~450 days of sample trades at a wide
  desktop width (with a sidebar alongside it, like your screenshot)
  and confirmed the calendar now runs the full width with noticeably
  bigger cells, and the week-total numbers add up correctly against
  the individual days shown.
- Checked mobile width too — still fits cleanly, the week-total column
  just shows "TOT" and a compact number ($1.9k) instead of the full
  label, same pattern as the rest of the app on small screens.
- npx tsc -b --force: 0 errors
- npm run lint: 0 errors, 18 warnings — same baseline as your last
  successful build, nothing new.
