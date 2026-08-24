FAVICON + BROKER BADGE ZOOM + SMALLER HEADER LOGO
====================================================

10 files, apply all of them together. This combines the favicon
update and the broker badge/logo sizing fix into one drop, so you
don't have to apply two separate zips.

WHAT'S IN HERE

1. New favicon / app icons (7 files, all in public/)
   Your site's favicon and app icons, swapped over to your new
   compass/arrow/"TC" mark. Every size (browser tab, home-screen/
   PWA icon, Apple touch icon) was regenerated from that artwork,
   cropped to its actual content and centered on the same dark
   background (#13171c) the old icons used, so it matches the
   existing dark rounded-square look.
     - public/favicon.svg — primary favicon modern browsers use
     - public/favicon-32.png, public/favicon-16.png — fallback tab
       icons
     - public/apple-touch-icon.png — iOS home-screen icon
     - public/icon-192.png, public/icon-512.png — PWA install icons
     - public/favicon.png — spare full-size copy some services
       look for
   Note: at the literal 16x16 size browsers show in a tab, any
   detailed logo like yours mostly reads as a small colored shape
   rather than a crisp picture — that's normal, not a bug. 32px
   and up are all sharp.

2. Broker badges zoomed in (2 files, in public/broker-logos/)
   thinkorswim.png and robinhood.png were the full horizontal
   lockup — icon plus the brand name spelled out in the image
   itself — so when scaled into the square badge box, most of the
   box ended up empty and the actual mark rendered tiny. Recropped
   to just the icon mark (the star / the feather) — not a content
   loss, since the broker's name is already shown as separate text
   next to the badge — so they now scale up and fill the box the
   same way Schwab and Webull already did. Badge box size itself is
   unchanged.

3. Smaller header logo (1 file: src/components/landing/LandingFooter.tsx)
   The "TREND CHASERS" logo top-left of the site was a bit larger
   than it needed to be — sized down a notch (was h-16 on phones /
   h-28 on larger screens, now h-14 / h-24).

HOW TO APPLY
1. GitHub Desktop, branch fix/calendar-keys-and-lint.
2. Drag the public/ and src/ folders from this zip into your repo
   root, overwriting the 10 matching files.
3. Should show as 10 changed files. Commit and push.

No firestore.rules changes — just a normal app deploy.

VERIFIED
- Checked every regenerated icon by opening it, and rendered
  favicon.svg in a real browser page at multiple sizes to confirm
  it displays the dark rounded-square background plus your mark
  correctly.
- Rendered the four broker badges together at their actual box
  size — thinkorswim and Robinhood now fill the box like Schwab
  and Webull do.
- Rendered the header logo at both its mobile and desktop size to
  confirm the new size looks proportional next to the nav links.
- npx tsc -b --force: 0 errors
- npm run lint: 0 errors, same 18 pre-existing warnings as before
  all of this — no new ones
- git status shows exactly these 10 files changed, nothing else.
