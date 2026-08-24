FIX: WIDE, NOT TALL
=========================

2 files. Overwrites what's in your repo (DashboardWeekTotalCell.tsx
is new if you haven't applied the last zip yet — either way this one
supersedes it).

WHAT CHANGED
Last time I made the calendar go full width by removing its max-width
cap. The day cells were set to always be perfect squares, so once the
box got wider, each cell also got taller to match — which is why the
whole calendar (and the page below it) ballooned in height and you
ended up scrolling twice as far to see everything.

Fixed it properly this time: on desktop, the cells now use a fixed
height instead of always matching their width, so they get wider
without getting taller. The calendar still spans the full width like
you wanted, but the whole block is noticeably shorter now — closer to
your original page length, just with each cell wider and roomier.
Phone-sized screens are untouched — cells stay square there since the
grid is naturally narrow and that still looks right.

FILES
- src/components/DashboardDayCell.tsx — fixed height on desktop
  instead of aspect-square
- src/components/DashboardWeekTotalCell.tsx — same fixed height, so
  it still lines up with the day cells next to it

HOW TO APPLY
1. GitHub Desktop, branch fix/calendar-keys-and-lint.
2. Drag the src/ folder from this zip into your repo root, overwriting
   these 2 files.
3. Should show as 2 changed files. Commit and push.

VERIFIED
- Rendered the full dashboard at a wide desktop width with ~450 days
  of sample trades and measured the page height before/after: it
  dropped from about 2890px to about 2250px — roughly a 20% shorter
  page — while the calendar itself still runs the full width.
- Checked mobile width too — cells are still square there, unchanged
  from before.
- npx tsc -b --force: 0 errors
- npm run lint: 0 errors, 18 warnings — same baseline, nothing new.
