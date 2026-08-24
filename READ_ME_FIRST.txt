BUILD FIX: OLD PerformanceChart.tsx STILL IN YOUR REPO
=============================================================

1 file, overwrites what's currently in your repo.

WHAT BROKE
Same error shape as last time — your build failed because
src/components/PerformanceChart.tsx still imports getPerformanceData
from src/utils/stats.ts, but that function was removed on purpose when
we took the performance chart out of the dashboard. The last zip I
sent asked you to delete that file by hand in GitHub Desktop (drag-
and-drop only adds/overwrites files, it can't delete them), and that
step didn't happen — easy to miss, it's not like the other steps.

THE FIX — NO DELETING REQUIRED THIS TIME
Instead of asking you to delete the file again, this zip just replaces
its contents with an empty placeholder. Nothing in the app imports
this file anymore, so an empty file in that spot is completely inert —
it does nothing, shows up nowhere, and can't break the build no matter
what. You can leave it there forever, or delete it whenever you're
next cleaning up — either way from here on out it's a normal
drag-and-drop overwrite like every other file, no special steps.

HOW TO APPLY
1. GitHub Desktop, branch fix/calendar-keys-and-lint.
2. Drag the src/ folder from this zip into your repo root, overwriting
   src/components/PerformanceChart.tsx.
3. Should show as 1 changed file. Commit and push.

VERIFIED
- Dropped this exact file into a full copy of the project and ran:
  npx tsc -b --force → 0 errors
  npm run lint → 0 errors, 18 warnings (same baseline as your last
  successful delivery, nothing new)
- This is the specific failure mode from your last build log, fixed
  at the source rather than relying on a manual step.
