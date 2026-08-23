BIGGER LOGO + WIDER LANDING PAGE (ROUND 2)
==============================================

2 files, apply both together. This builds on the full-snapshot fix from
last time — apply this AFTER that one (or just apply these 2 files now if
you've already gotten the full snapshot in and pushed successfully).

WHAT CHANGED
- src/components/landing/LandingFooter.tsx — nav bar logo roughly doubled
  in size (was h-10/h-12, now h-16/h-20), and the nav bar itself got a bit
  taller (80px → 96px) to fit it comfortably. Much more presence now.
- src/pages/LandingPage.tsx — content width bumped again, from 1400px to
  1680px, so it fills a lot more of a wide monitor. Based on your
  screenshot your screen is around 1868px wide, so this leaves a
  reasonable ~94px margin on each side instead of the bigger gap before.

HOW TO APPLY
1. GitHub Desktop, branch fix/calendar-keys-and-lint.
2. Drag the src/ folder from this zip into your repo root, overwriting the
   2 matching files.
3. Should show as 2 changed files. Commit and push.

Verified: TypeScript compiles clean, lint is clean, and I screenshotted
the page at your actual screen width (1868px) plus a normal 1280px width
and mobile — logo and spacing look right at all three.
