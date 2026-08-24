JOURNAL POLISH PASS: COLOR, FILTERS, CHARTS, SPACING
==========================================================

8 files modified. Covers the 4 areas you picked.

1. COLOR DISCIPLINE
Every card's little uppercase label — CALENDAR, YEAR VIEW, YOUR WEEK,
RHYTHM, SESSIONS, TRADING INSIGHTS — was the same green as your P&L
numbers, win-rate pills, and buttons. Everything on the page was
competing for the same color, so nothing stood out. Those section
labels now use the app's sky-blue accent instead (the same blue
already used for "today" on the calendar), so green is reserved for
what it actually means — profit — and the section labels read as
structure, not data. Bonus: this also fixed a small existing bug —
those labels were hardcoded to green even for people using the Cyan
or Violet theme in Settings, so they wouldn't match. They're theme-
aware now.
I left the Month/Year toggle, buttons, and the broker-sync banner
alone — those are legitimately your brand color (used for actions and
promotion), not the "everything is green" problem you were describing.

2. FILTERS & CONTROLS
The Symbol/Setup/Tag/Side dropdowns were plain unstyled browser
selects sitting next to a bunch of polished cards. They're now pill-
shaped controls with a proper chevron icon, and they highlight in
blue with the chevron to match whenever a filter is actually active —
so you can tell at a glance that a filter's applied, not just what it
says.

3. WEEKDAY & SESSIONS CHARTS
The "Performance by Weekday" bars now have fully rounded pill ends
instead of a slight corner-radius, matching the rounder, softer style
of the newer parts of the app. The "Gross Daily P&L" bars got the
same rounded-cap treatment, and their value labels switched to a
compact format ($643 instead of $643.20) so they stop truncating or
crowding each other on narrower screens — this was actually visibly
broken on mobile before (numbers were getting cut off mid-digit).

4. SPACING & CARD RHYTHM
The Rhythm and Sessions cards had slightly tighter padding (10px)
than every other card around them (12px) — bumped to match, so the
whole page now uses one consistent padding scale instead of two.

FILES
- src/components/DashboardView.tsx
- src/components/DashboardCalendar.tsx
- src/components/YearHeatmap.tsx
- src/components/WeeklyRecapCard.tsx
- src/components/FiltersBar.tsx
- src/components/WeekdayChart.tsx
- src/components/DailyPnlChart.tsx
- src/components/analytics/TradingInsightsSection.tsx

HOW TO APPLY
1. GitHub Desktop, branch fix/calendar-keys-and-lint.
2. Drag the src/ folder from this zip into your repo root, overwriting
   these 8 files.
3. Should show as 8 changed files. Commit and push.

VERIFIED
- Rendered the full journal with ~450 days of generated sample trades
  at desktop width, in both Month and Year view, and checked the
  filter row's active/inactive states directly.
- npx tsc -b --force: 0 errors
- npm run lint: 0 errors, 18 warnings — same as your last delivery,
  no new ones.
- git status shows exactly these 8 files changed (plus whatever's
  still pending from the broker-logo and chart-removal zips I sent
  separately, if you haven't applied those yet — this one's
  independent of both).

WHAT I DIDN'T TOUCH
This pass was scoped to the four areas you picked. There's more I
could look at if you want to keep going — the sidebar/nav chrome, the
trade-entry modal, empty states elsewhere in the app — just say what
to look at next.
