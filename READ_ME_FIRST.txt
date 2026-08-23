Complete broker-sync fix — 6 files, all at once
==================================================

WHY THIS ONE IS DIFFERENT
----------------------------
Your Netlify build just failed with 5 TypeScript errors, all pointing to
the same root cause: you applied the "Schwab match fix" file, but not
the earlier "sync full history + dedupe" delivery it was actually built
on top of. That earlier delivery never got applied, so the newer file
references things (a `sourceId` field, a `truncated` flag) that didn't
exist yet in your repo.

To stop this from happening again, this zip has ALL SIX files that
belong together as one unit. Don't apply these one at a time — replace
all six now, in one go, then commit and push once.

FILES IN THIS ZIP
--------------------
server/brokerConnectHandler.ts
server/mapSnapTradeActivities.ts
src/components/brokers/BrokerConnectContent.tsx
src/pages/JournalApp.tsx
src/services/brokerConnect.ts
src/types.ts

HOW TO APPLY (GitHub Desktop)
---------------------------------
1. Drag ALL of these files (keeping their folder structure — "server",
   "src/components/brokers", "src/pages", "src/services") into your
   local repo folder, overwriting the existing files each time.
2. In GitHub Desktop, go to the Changes tab. You should see exactly 6
   files listed (not more, not fewer). If you see other unexpected
   files changed, stop and let me know before committing.
3. Write a commit message, click Commit, then click the Push button
   (it will say "Push origin" with a number next to it once you've
   committed — that number should NOT be 0).
4. Go to Netlify's Deploys tab and watch the new build. It should say
   "Published" this time, since these 6 files are internally consistent.

AFTER IT DEPLOYS
-------------------
Go back to Connect broker in the app, click Refresh connections, and
your Schwab account should finally show up with a Sync trades button.
Click that to pull in your trade history and fill in the calendar.

If the build fails again, copy the FULL error text from Netlify's
deploy log (like you did last time) and send it over — that log is the
fastest way for me to diagnose exactly what's missing.
