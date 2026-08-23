NEW NAV LOGO + WIDER LANDING PAGE
====================================

3 files, apply all together.

1) Nav bar now uses your new logo
   - public/nav-logo.png — the new logo file you sent (icon + "TREND
     CHASERS" + tagline, all baked into one image). Confirmed genuinely
     transparent.
   - src/components/landing/LandingFooter.tsx — the nav bar's brand mark
     now renders this image directly instead of the hand-built text I had
     before. Heads up: the wordmark text in your file is a translucent
     near-white, which is why it looked faint on the white chat preview —
     it's actually designed to sit on a dark background, and it reads
     great against our dark nav (I checked with a screenshot).

2) Fixed the wasted space on wide screens
   - src/pages/LandingPage.tsx — the landing page's content width went
     from 1152px to 1400px, so it fills a lot more of a wide monitor
     instead of leaving big empty margins. I left the FAQ and final CTA
     sections narrower on purpose — wide paragraph text is harder to read,
     so those stay comfortable regardless of screen size.
   - Same width bump applied to the nav bar and footer (in
     LandingFooter.tsx) so they stay visually aligned with the page above
     and below them.

HOW TO APPLY
1. GitHub Desktop, branch fix/calendar-keys-and-lint.
2. Drag the public/ and src/ folders from this zip into your repo root,
   overwriting matching files, adding the new logo image.
3. Should show as 1 new file + 2 changed files. Commit and push.

Verified: TypeScript compiles clean, lint is clean, and I screenshotted the
page at both a normal 1280px width and a wide 1889px width to confirm
nothing wraps oddly and the extra space is actually being used now.
