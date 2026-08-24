TRANSPARENT LOGO BACKGROUND ON THE SIGN-UP PANEL
==============================================

1 file, overwrites what's in your repo.

WHAT CHANGED
logo.svg (the bigger stacked mark + "TREND CHASERS" + tagline version
shown on the left panel of the sign-in/sign-up screen) had its own
solid dark rectangle (#13171c) baked in as a background. That rectangle
sat on top of the panel's green/cyan gradient background, so it showed
up as a visible dark box around the logo instead of blending in.

Removed that background rectangle. The logo (mark + text) is now
transparent behind, so it sits directly on the panel's gradient like
the rest of the panel content does.

Nothing else changed — same mark, same text, same layout, just no more
boxed-in background.

FILES
- public/logo.svg

HOW TO APPLY
1. GitHub Desktop, branch fix/calendar-keys-and-lint.
2. Drag the public/ folder from this zip into your repo root,
   overwriting this 1 file.
3. Should show as 1 changed file. Commit and push.

VERIFIED
- Rendered the sign-up panel with the updated file and screenshotted
  it — the dark box is gone, the logo blends into the gradient panel
  the same way the icon-only mark already did.
- npx tsc -b --force: 0 errors
- npm run lint: 0 errors, 18 warnings — same baseline, nothing new
  (asset-only change, no component code touched).
