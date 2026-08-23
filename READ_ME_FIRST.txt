TREND CHASERS — Broker integration + AI-parsing removal update
================================================================

This zip contains all the NEW and CHANGED files from this update. It does
NOT include a couple of small binary/lockfile-safe items — see below.

WHAT THIS UPDATE DOES
----------------------
1. Removes the AI screenshot-parsing feature completely (no more
   "upload a screenshot" import). Manual trade entry is the only entry
   method for now.
2. Removes all "never connect your broker" marketing/legal copy sitewide
   (landing page, guides, FAQ, privacy policy, terms of service, README).
3. Adds real Schwab + Robinhood integration via SnapTrade, with a new
   in-app "Connect broker" screen that includes step-by-step setup
   instructions for each broker.

HOW TO APPLY THIS WITH GITHUB DESKTOP
---------------------------------------
Step 1 — Delete these 7 files from your local repo folder first
(these files were REMOVED in this update; dragging the zip in will NOT
delete them for you, so remove them manually in Finder/Explorer or by
right-clicking them in GitHub Desktop's "Changes" list after step 2):

  netlify/functions/health.ts
  netlify/functions/parse-screenshot.ts
  server/parseApiHandler.ts
  server/parseScreenshot.ts
  src/components/ScreenshotImportModal.tsx
  src/utils/parseScreenshot.ts
  vite-plugin-screenshot-api.ts

Step 2 — Drag every file/folder from inside this zip into your local
repo folder (the same folder that has your .git folder in it), letting
it overwrite files with the same name. Keep the folder structure —
e.g. drop "server" so it merges into your existing "server" folder.

Step 3 — Open GitHub Desktop. You should see ~45 changed files in the
Changes tab (some modified, some new, the 7 above marked as deleted).
Write a commit message like "Add broker integration, remove AI parsing"
and click "Commit to fix/calendar-keys-and-lint" (or whatever branch
you're on), then "Push origin."

IMPORTANT — TO MAKE BROKER SYNC ACTUALLY WORK
------------------------------------------------
The Connect broker screen is fully built and will show correctly, but
it needs credentials only you can create (I can't sign up for
third-party accounts on your behalf):

1. Sign up at https://dashboard.snaptrade.com and get your API keys
   (clientId + consumerKey).
2. In Netlify → Site settings → Environment variables, add:
     SNAPTRADE_CLIENT_ID = <your client id>
     SNAPTRADE_CONSUMER_KEY = <your consumer key>
3. Broker connect also requires Firebase, since each connection is tied
   to a signed-in user. If you haven't already set these in Netlify,
   add your Firebase web config (VITE_FIREBASE_*) and generate a
   Firebase service account key (Firebase Console → Project settings →
   Service accounts → Generate new private key), then add its JSON as
   one line under:
     FIREBASE_SERVICE_ACCOUNT_JSON = <the JSON, all on one line>
4. Redeploy. Until these are set, the Connect broker screen shows a
   friendly "not set up yet" message and the rest of the app (manual
   trade entry, dashboard, etc.) works completely normally.

WHAT'S SUPPORTED
------------------
- Charles Schwab (covers thinkorswim accounts too) — read & sync
- Robinhood — read-only (Robinhood has no public trading API, so the
  connection is brokered through SnapTrade, same as Schwab)

Both connections are read-only by default: they can pull trade history
but can't place trades or move money, and can be disconnected anytime
from the Connect broker screen.
