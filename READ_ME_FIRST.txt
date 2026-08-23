BUILD FAILURE FIX — FULL PROJECT SNAPSHOT
=============================================

WHAT WENT WRONG
Your Netlify build failed with:
  "Cannot find module '../components/landing/AnnouncementBar'"

This means LandingPage.tsx (which I've updated many times) imports a file
called AnnouncementBar.tsx that got added to your repo folder structure a
while back, in one of the earlier zips — but it looks like that specific
new file (it lives in a subfolder, src/components/landing/) never actually
got dragged into GitHub Desktop along with everything else. Every zip since
then assumed it was already there, so the mismatch didn't show up until
now.

This is exactly the kind of thing that's easy to miss with file-by-file
zips over many turns — a new file in a subfolder is easy to skip when
you're focused on the files you were told changed. So instead of another
small diff, this zip is a COMPLETE, verified snapshot of every file your
project currently needs — all 175 tracked files, exactly as they should
be. No guessing about what you might be missing.

HOW TO APPLY (do this once, carefully, and it resets you to a known-good
state)
1. Open your tradingjournal folder on your computer (the one GitHub
   Desktop points at).
2. Do NOT delete the ".git" folder inside it — that's your repo history,
   leave it alone.
3. Delete everything else inside that folder (all the visible files and
   folders except .git) — or just extract this zip's contents directly on
   top, overwriting everything, since every file this zip contains matches
   a file that should already exist in your repo.
4. Extract/copy every file and folder from this zip into that same
   tradingjournal folder, so its contents replace what's there.
5. Open GitHub Desktop. It'll show you the full list of changes (likely
   just a handful of real changes, plus the missing AnnouncementBar.tsx
   file showing up as new). Review it looks reasonable, then commit
   everything with one commit and push.
6. That should be enough to fix the Netlify build. If Netlify auto-deploys
   on push, watch for the next build to go green.

VERIFIED BEFORE SENDING
I ran your exact Netlify build command locally (tsc -b && vite build) —
both steps complete with zero errors. (The third step, the prerender
script, needs to download a browser that my sandbox can't reach — that's
a sandbox limitation, not a problem with your code; Netlify's own build
environment already has what it needs for that step, since your builds
got that far before.)

Going forward, once this gets you back to a clean baseline, future fixes
from me will go back to being small targeted diffs — this full-snapshot
delivery is specifically to recover from the missing file, not the new
normal.
