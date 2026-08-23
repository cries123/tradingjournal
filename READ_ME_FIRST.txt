LOGO SIZE FIX + TEXT WRAP FIX
================================

2 files, apply both.

WHAT WAS WRONG
Squeezing thinkorswim/Robinhood's wide wordmark logos into a fixed square
badge meant either shrinking them tiny (my first fix) or cropping off
letters when I tried to zoom in (second attempt — "thinkor" and "bin" were
getting cut off, which is why you still couldn't read them).

THE ACTUAL FIX
- src/components/brokers/BrokerLogo.tsx — badges are now locked to a
  consistent HEIGHT instead of a fixed square. The image scales to fill
  that height with nothing cropped and nothing shrunk — square-ish logos
  (Schwab, Webull) still look like compact badges, and wide wordmarks
  (thinkorswim, Robinhood) render wider but fully readable, same height,
  same white background, same style. This is really the only way to show
  a very wide logo and a very square one at a consistent, legible size.
- src/pages/LandingPage.tsx — the broker grid on the landing page was
  splitting into 2 columns at a width that squeezed "Charles Schwab" onto
  two lines. Changed to a single column so every card has enough room.

HOW TO APPLY
1. GitHub Desktop, branch fix/calendar-keys-and-lint.
2. Drag the src/ folder from this zip into your repo root, overwriting
   the 2 matching files.
3. Should show as 2 changed files. Commit and push.

Verified: screenshotted both the landing page broker grid and the full
/brokers page — all four logos are now fully legible with nothing cropped,
and no text wraps onto a second line anywhere.
