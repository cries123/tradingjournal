# Trend Chasers — working notes for Claude

A paid trading-journal SPA at **trendchasers.net**. Owner: Jay (Jaryn Healey), who trades
SPY/SPX 0DTE through Schwab. Read this before changing anything; most of it is here because
getting it wrong once already cost something.

## How Jay works

- Brief, direct prompts. Answer the same way — no preamble, no recap of what you just did.
- **Commit, then report. Push only when he says push.** Larger or riskier changes: commit, report
  back, push in a separate step after he approves.
- He wants layout changes shown as **before/after screenshots** before they ship. See
  "Screenshotting the app" below — there is a way to do it without a running server.
- He is building a business on this, not a toy. "Done properly" means tests and a real explanation
  of the trade-off, not a patch that makes the symptom go away.
- Never put his legal name in the site's terms or legal pages.

## Stack

React 19 · TypeScript · Vite 8 (rolldown) · Tailwind v4 · Firebase Auth + Firestore ·
Firebase Storage · Netlify (hosting + Functions) · Creem (billing) · SnapTrade (broker sync).

```
src/        the SPA
server/     logic shared by the Netlify functions, unit-tested directly
netlify/functions/   thin handlers; scheduled jobs live here
scripts/    prerender
```

## Commands

```bash
npm test                       # vitest, ~1,650 tests, node environment
npm run lint                   # eslint
npx tsc -p tsconfig.app.json --noEmit      # and .node / .server / .test — all four must pass
npm run build
```

`vitest.config.ts` sets `include: ['src/**/*.test.ts']` — a test outside `src/`, or named `.tsx`,
**is silently not run**. Tests for `server/` live under `src/services/*.test.ts`.

### Build workaround

`npm run build` writes to `dist/`, which fails with EPERM when the repo is reached through the
Cowork device bridge (that shell cannot unlink files). Build somewhere else instead:

```bash
SKIP_PRERENDER=1 npx vite build --outDir "$HOME/bc" --emptyOutDir
```

## Conventions that bite

- **eslint rules that will reject a natural-looking patch:** `react-hooks/purity` (no `Date.now()`
  or `new Date()` during render — use `const [now] = useState(() => Date.now())`),
  `react-hooks/set-state-in-effect`, `preserve-caught-error`, `react-refresh/only-export-components`
  (so a non-component export in a `.tsx` file is an error — put shared helpers in a `.ts`).
- **The landing page entry must not import Firestore or Storage.** Code reachable from
  `src/main.tsx` reads Firestore through `src/lib/lazyFirestore.ts` and auth through
  `src/lib/firebaseAuth.ts`; `src/lib/entryWeight.test.ts` walks the import graph and fails on a
  static `firebase/firestore` import. It halved what the marketing pages download.
- **firebase-admin through its modular entry points only** (`firebase-admin/app`, `/auth`,
  `/firestore`). A test fails on `import admin from 'firebase-admin'`; v14 drops that API and needs
  Node 22 on Netlify first — steps in RECOVERY.md.
- **Sentinels, never `Infinity`.** `UNLIMITED_BROKERS` / `UNLIMITED_JOURNALS` are
  `Number.MAX_SAFE_INTEGER`, because limits are JSON-serialised to the browser and
  `JSON.stringify(Infinity)` is `null` — which would arrive as "no limit at all".
- **Comments explain the decision, not the code.** Every non-obvious constant in this repo says why
  it is that number. Match that or the file stops being trustworthy.

## Mutation testing

The habit that has caught the most real bugs here: break the code, confirm exactly the right test
fails, restore.

```bash
/tmp/mut.sh <file> <old-string> <new-string> <test-files> <label>
```

Run it on anything load-bearing. Two examples from this repo's history: a DST bug survived because
the test machine runs UTC (fixed by looping `process.env.TZ` inside the test), and a filter change
survived because the test happened not to depend on the line being changed — which then revealed
the change would have broken `"Script error."` filtering in production.

## The pricing ladder — `src/config/tiers.ts` is the only source of truth

| | Free | Silver $9 | Gold $19 | Diamond $39 |
|---|---|---|---|---|
| Journals | 2 | 3 | 5 | unlimited |
| Broker connections | 0 | 5 | 10 | unlimited |
| Syncs/day | 0 | 5 | 10 | 24 |
| AI messages/day | 0 | 0 | 15 | 40 |
| Performance screen | — | yes | yes | yes |
| Track record, All journals, monthly PDF report | — | yes | yes | yes |
| Rule simulator | — | — | yes | yes |
| Auto-import, coach seat, rule alerts, AI review | — | — | — | yes |
| Market replay | — | — | — | yes |

### What things actually cost (checked against Jay's SnapTrade invoice, not their public page)

- **$1.00 per connected PERSON per month.** Not per connection, not per account. This is why
  connections are cheap to give away.
- **Syncing trades is free.** SnapTrade caches transactions, refreshes them once daily inside that
  per-user fee, and delivers them a day late. The $0.05 line on their dashboard is per successful
  **manual refresh** (`refreshBrokerageAuthorization`), which this app has never called. The
  per-day sync caps are a rate limit, not a cost control — read them that way.
- An assistant message is ~$0.0068. That is the only usage-driven cost worth capping.
- Creem takes 3.9% + $0.40 per charge.
- At full use of every cap every day: **79% margin on Silver, 72% Gold, 71% Diamond.**

Do not "correct" the $1.00 to SnapTrade's published Commercial rate. That mistake has been made.

## Broker sync reality

Schwab's SnapTrade feed sends a **date-only** `trade_date` — no fill time. So `hasTimeOfDay` is
false and every hour-of-day panel is empty for Schwab users, which is most of them. The Performance
screen was rebuilt around this: everything on it computes from symbol, side, quantity, price, date
and fees alone (`src/utils/brokerAnalytics.ts`), with `MIN_SAMPLE`/`MIN_PER_GROUP` gates so a panel
hides rather than concluding anything from four trades. Setups, R multiples, MAE/MFE and grades
still need hand entry — a coverage panel names what the broker did not send instead of drawing a
blank chart.

### How a sync decides what to ask for (October 2026 rebuild, after the duplicate/missing-trade complaints)

- **Every imported trade's id is `snaptrade_<accountId>_…`**, built only by `src/utils/brokerTradeIds.ts`
  (`manualSyncTradeId` / `autoSyncTradeId`). It is the only place the brokerage account survives onto a
  trade, and `syncWindow`, `journalForAccount` and the auto-sync journal lookup all read it. `addTrades`
  keeps an incoming id — it minted a UUID for every row for three months, so every manual sync looked
  like a first sync and pulled the whole history.
- **The window is anchored on open positions, not on the newest closed trade.** The client still sends
  `syncStartDate` (14 days back from the newest import) but it is a request; `server/brokerConnectHandler`
  plans the real start with `planSyncStart` (`src/utils/syncPlan.ts`) from `users/{uid}/private/brokerSync`
  (`accounts.{accountId}`: `oldestOpenDate`, `complete`, `feedDirection`). A position opened before the
  window and closed inside it used to arrive as a close with no open — an option close was dropped, a stock
  sale became an invented short, and the FIFO pairing differed from the last sync's so the same sell came
  back under a different `sourceId` with a different P&L. Now the pull starts no later than the day before
  the oldest open lot; with no trusted state (never synced, or the last pull was truncated) it pulls
  everything. Auto-sync plans the same way per account.
- **Feed direction is a hint carried between pulls.** `orientOldestFirst` reads it from a multi-day feed and
  stores it; a one-day feed with no hint keeps input order and reports `orientationAssumed`, which the screen
  says out loud. Whether SnapTrade is newest-first has still never been observed on a real account.
- **`dedupeIncomingTrades` keeps the execution fingerprint deliberately wide.** SnapTrade says activity ids
  "can change if we re-fetch and reprocess", so the fingerprint is the only thing that stops a re-issued id
  arriving as a duplicate. The cost — two genuinely identical fills on one day across two syncs collapse to
  one — was weighed and accepted; narrowing it is the wrong fix.
- **Sync history is the trader's, not just the admin's.** `action: 'history'` on `/api/broker-connect`
  returns the caller's `journalEvents` (collection stays server-only, no rules change). Auto-sync writes one
  event per account, `automatic: true`, with `fresh` after dedupe. The connect screen's copy comes from
  `describeSyncResult` (`utils/syncOutcomeCopy.ts`) and `describeSyncGaps` on every path, including
  "nothing paired", which used to be reported as "no activity found" with no notes.
- The matcher guards: zero-unit fills counted as `ZERO_UNITS` (they divided the fee by zero), non-finite fees
  read as 0, and every diagnostic date is the Eastern trading day, like the trades.
- **A pull has a clock, and resumes** (`server/activityPull.ts`, after a 11,491-activity Robinhood first sync
  died at Netlify's 10 s limit with "8,790 trades out" already in the history). The Netlify function hands the
  handler its deadline (`BROKER_SYNC_TIME_LIMIT_MS` caps it, 10 s default); no page is started that is not
  expected back before `deadline − RESERVE_AFTER_PULL_MS`. Only the OLDEST end of a window is ever matched — a
  newest-first feed is paged from its last offset using `pagination.total` — and the newest UTC day in hand is
  held back whole. The cut is stored in the sync state as `resumeFrom` with the lots open there (`openLots`,
  seeded into the next matcher) and the rows left (`remainingRows`, so a newest-first resume starts at the far
  end); `planSyncStart` then answers `'resuming'` from exactly that day, ignoring the client's window. Partial
  syncs are refunded (`'partial'` in syncRefund.ts) and the screen says "Imported part of your history — sync
  again to continue." Responses are cut the same way at `MAX_TRADE_BYTES` (Netlify caps bodies at 6 MB). The
  morning import uses the same pull with its 3-page cap as the budget, so the cap no longer forces a
  pull-everything repair. The browser confirms a saved import with `action: 'imported'`; a history row with
  `landed: false` is an answer that never reached a journal.

### SnapTrade credentials — never delete a stored secret to "recover"

`resetSnapTradeUserSecret` needs the user's CURRENT secret. Once a `users/{uid}/private/snaptrade`
secret is gone, the only fix is deleting the user at SnapTrade and reconnecting (admin → Reset broker
link). Recovery used to delete first and re-register after; when SnapTrade refused the app's client
id (401 "Invalid clientId provided", code 1083) every call looked like a dead user secret and each one
was deleted. The rules now, in `server/snaptradeCredentials.ts` (tested against fakes):

- a stored secret is only overwritten by one SnapTrade has just issued — never deleted;
- `isClientRejected` (server/upstreamErrors.ts) separates "SnapTrade refused the app" from "refused
  this user", and recovery never starts for the former; users get a 503 saying it is our side;
- `upstreamSummary` is what the admin Errors list records ("SnapTrade 401 · POST /… · reason (code)"),
  never the SDK's message, which is a status line plus a header dump.

## The screens, and the pieces they share

The October 2026 redesign drew every customer screen to mockups Jay approved. Where a screen
differs from its mockup, the commit that built it says what was left out and why. Usually the
mockup shows a control with no feature behind it, or something that would cost a trader data.

Sidebar destinations: Overview, Trades, Performance, Rule simulator, Assistant, Track record,
Coaching. Below them come the journals, the broker card and "+ Log trade". Settings, Subscription,
Support and the rest live in the profile menu at the bottom (`components/nav/ProfileMenu.tsx`). On a
phone the bottom bar is Overview · Performance · + · Ask · More, and More (`more/MoreContent.tsx`)
holds everything the sidebar and the profile menu hold. `bottomNavFit.test.ts` keeps the + circle
inside the bar. A day opens as a page on desktop (`appView === 'day'`) and as a bottom sheet on a
phone (`day/DaySheet.tsx`). `report` (the monthly report) is reached from the Overview, not the
sidebar. Every screen is wrapped in `PageFrame` (`src/components/layout/PageFrame.tsx`) — full
width in the app, a centred column on the public site. `sidebarDestination` hides its back link on
desktop, where the sidebar already goes there.

**Day notes are saved only through `useDayNote`** (`utils/dayNoteSave.ts` holds the rules). It
never writes a note that did not load, because a failed load is not an empty note: the old drawer
saved an empty box over the real note, and `saveDayNote` turns that into a delete. It never
re-saves an unchanged note either. Don't add fields to the day note document. `saveDayNote` is a
full `setDoc`, so any older copy of the app still open would erase them. That is why the mockup's
"plan before the open" box and mood tags were not built.

Shared pieces, so none of these get rebuilt:

- **`SegmentedControl`** (`components/ui/`) is the one period/mode toggle. There were three.
- **`CountUp`** and **`Reveal`** (`components/motion/`), `useReveal`, `useAnimatedClose`
  (`hooks/`). Figures count up and roll on change; cards rise in when first scrolled into view;
  every dialog plays out before it unmounts, via `useAnimatedClose` — a close wired straight to the
  prop skips the animation, which is the bug Escape had on the day drawer.
- **`.panel-grid`** in `index.css` makes the rows of a card grid end level, and splits a short last
  row into halves rather than leaving one card 1,600px wide. It works for any card count. Since
  the redesign, Performance lists its breakdowns biggest first instead of in a grid, so nothing
  uses the class now. It is kept for the next grid whose card count varies from journal to journal.
- **`.spotlight`** + `trackSpotlight` (`utils/spotlight.ts`): one pointer listener on the shell
  lights whichever card is under the cursor. `--spot-rgb` is brand green on the landing page and the
  theme accent in the app.
- **Reduced motion turns all of it off**, and `appPolish.test.ts` asserts that for each new
  animation. `.reveal` must end at `transform: none`, never `translateY(0)` — any transform makes
  the card a containing block for `position: fixed` children, which once put a dialog off the top
  of a phone screen.

**In-app colour comes from the theme tokens** (`text-profit-bright` / `text-loss-bright` /
`accent`), never a hard-coded `emerald`/`red` — the user picks the accent in Settings and about
fifteen places used to ignore it. `.panel-card` and `.stat-chip` are `@layer components` so a
utility class on the element still wins; unlayered, their `border` shorthand silently beat every
`border-*` utility, which is why the streak chip's amber border did nothing for months.

### All journals

Silver and up. A **view**, not a journal: `activeAccountId` stays a real journal so new trades,
CSV imports and "clear this journal" still have one to act on. Everything reads
`viewingAllJournals` from `SettingsContext` — the stored flag AND the plan AND a second journal
(`allJournalsView` in `utils/journalScope.ts`) — never `settings.viewAllJournals` directly, or a
stale flag after a downgrade strands somebody in a view they cannot leave.

**Rule limits stay per account.** The rule banner reads `activeJournalTrades`; in this view the
breach list stands aside with a note, the assistant is handed no rules, and the monthly report
omits its rules section. Adding a paper journal's trades to a live account's daily cap reports
breaches neither account had.

### The monthly report

`buildMonthlyReport` (`utils/monthlyReport.ts`) computes from the same functions the dashboard
uses, so the PDF cannot disagree with the screen. **No PDF library and no server**: "Download PDF"
calls `window.print()`, and a second copy of the document is portalled into `<body>` while
`@media print` hides everything else. That is what stops the PDF trailing blank pages the height
of the app.

### The assistant

One assistant, two surfaces: the Assistant page (`AssistantContent` — conversations, the chat,
"What it can see"; on a phone "Ask" with the history behind a clock icon) and the dock on the
Overview (`AssistantPanel`). Both take their state and their one way of asking from
`useAssistantChat` (facts, notes opt-in, Compare, the chatLocked gate — the hook never hands out
`send`) and the same saved conversations from `useAssistantThreads` (localStorage, not Firestore).
Each answer stores the period it saw (`source`), which is what its "From your journal · …" line
and the history row print. Pin, pinned answers and thumbs up/down are in the design but not built.

- The period opens on the narrowest one that **has trades**, not always this month — on the 1st of
  a month the old default showed "no trades in this period" over a full journal.
- `chatLocked` is the Silver view: the opening findings are computed in the browser by
  `openingFindings`, cost nothing, and are shown for real; only the chat is behind Gold. Free keeps
  the padlock, because those findings are the Performance screen's analysis.
- Server guardrails are in `server/aiAssistantHandler.ts`: **the model never computes** (the client
  sends facts already derived by `journalFacts.ts`) and **it never advises on what to trade next**.
  That second line is what keeps this a journaling feature rather than unlicensed financial advice.
  General questions have a rule since the October 2026 audit: trading vocabulary gets a short
  answer marked as general; company, ticker and "is X a good investment" questions are refused in
  one sentence. The model may say what the data shows past the third trade and that the Rule
  simulator can replay a cap, but never which number to set.
- **What the model sees is `JournalFacts`, and it now includes the Performance screen's breakdowns**
  (`sequence`, `dailyLoad`, `expiry`, `instruments`), the broken-days-against-kept-days comparison
  (`ruleDays`) and the playbook rule by rule (`playbook`). For months the assistant could not see
  the screen's headline finding and answered "where does my money go" from setups alone. The whole
  prompt is about 3,000 tokens; adding a block is cheap, but every block must be explained in the
  prompt (`assistantPrompt.test.ts` checks the new ones) or the model ignores it.
- Earlier turns are trimmed by `trimHistory`: questions at 600 characters, the assistant's own
  answers at 2,400. They used to share the 600 cap, so a follow-up was answered without the answer
  it followed. Reasoning effort is `AI_REASONING_EFFORT` (default medium); `AI_MODEL` picks the model.

### The landing page (October 2026 rebuild, to the concept Jay approved)

The page runs in this order: the hero (an HTML-built Overview in a browser window, plus an iPhone),
the broker logos, then **Connect → See → Fix** chapters with a sticky bar, the founder's −$496/+$163
proof, three fanned phones, the pricing ladder, guides and community, the FAQ, and the close.

- **One sample journal feeds every figure** that is not a fact about the product:
  `landingStory.ts` over `demoJournal()`. That means June 2026, a **3-trade cap**, and June 26
  played back trade by trade. Three, not four, because the app's own Performance screen says "Stop
  after three" for this sample, and the page shows that screen. `landingStory.test.ts` pins the
  figures the copy prints.
- **The app screenshots** in `public/landing/` are the real components rendered on that sample at
  2x. Re-render them with `scripts/landing-shots/render.ps1` whenever a screen they show changes.
  `landingShots.ts` holds their sizes, and its test reads each WebP header.
- **The root is `overflow-x-clip`, never `-hidden`.** Hidden turns the page into a scroll container,
  and every sticky element (the header, the chapter bar, the story's chart) then scrolls away. The
  header had been marked sticky and had never stuck. A test guards this.
- **Prices and trial badges come from the config**: `featureLines()` (the same function the
  pricing page uses) and `hasTrial()` in `config/trial.ts`. `TRIAL_TIERS` must match the Creem
  products that actually carry a trial.

## Deploy sequencing — this order, always

1. Push → Netlify deploys.
2. **Then** publish `firestore.rules` and `storage.rules` in the Firebase console.

Backwards, the live build gets denied collections it still reads. Neither rules file is
auto-deployed. `firestore.rules` can be published from Jay's machine with
`firebase deploy --only firestore:rules --project trading-69603` — `firebase.json` and `.firebaserc`
are in the repo and the CLI there is signed in — but only when Jay says to, and only after the push.
The CLI compiles the rules first and refuses to release a file that does not compile.
`storage.rules` is not in `firebase.json` and is still pasted by hand.

`storage.rules` grants each user their own `shareCardBackgrounds/{uid}/` folder. A deny-all version
was sent to him by mistake once — if share-card uploads break, that is why.

## The Ops tab — what the server records about itself

Four server-only collections, read back by `/api/admin-ops` (`server/adminOpsHandler.ts`). None
appears in a security rule, so none needs a rules deploy. Each starts empty on the release that
added it and the panel says so.

- **`jobRuns/{job}`** — the latest run of each scheduled function (`history/` behind it), written
  by `recordedJob()` in `server/jobRuns.ts`, which wraps all six `schedule()` handlers. The
  allowance that makes a run "late" is per job in `src/utils/jobSchedule.ts`.
- **`syncFeed`** — every sync row, across users, mirrored by `recordJournalEvent` beside the user's
  own `journalEvents/{uid}/events` row. A top-level copy because a cross-user read of the
  subcollection needs a collection-group index deployed by hand.
- **`emailLog`** — every `sendEmail` attempt, sent or not, written by the mailer itself. Per-user
  reads filter on `to` with no orderBy (sorted in memory), so no composite index.
- **`creemEvents/{id}`** — the webhook's seen-marker now carries the event type, uid, outcome and
  the raw payload. A marker whose outcome is `failed` is NOT a duplicate (the marker used to be
  deleted on failure, which deleted the only record of it). The apply lives in
  `server/creemApply.ts`; **Replay** on the Ops tab runs it again with `notify: false`, so no
  customer email is re-sent, and audits as `billing.event-replayed`.

## Emailing everybody — the admin Email tab

`server/broadcast.ts`, `server/adminBroadcastHandler.ts`, `/api/admin-broadcast`,
`components/admin/EmailBroadcastPanel.tsx`. Two server-only collections, `broadcasts/{id}` and
`broadcasts/{id}/chunks/{n}`, in no security rule, so no rules deploy.

- **Two kinds.** `news` carries an unsubscribe link (list `news`, `emailPrefs/{uid}.news`), the
  RFC 8058 `List-Unsubscribe` / `List-Unsubscribe-Post` headers Gmail and Yahoo require of bulk mail,
  and the sender's postal address that CAN-SPAM requires of commercial mail. **The server refuses
  news unless `MAIL_POSTAL_ADDRESS` and `EMAIL_TOKEN_SECRET` are set in Netlify** — a PO box or
  virtual mailbox address, never Jay's legal name. `notice` (account or service changes only) has no
  opt-out, reaches people who unsubscribed from news, and needs a tick box saying it is not a promotion.
- **The send is resumable and cannot double up.** `create` snapshots the recipients into chunks of
  100; the open tab then calls `send` until done, each call sending chunks until 3.5 s before its 8 s
  budget. One Resend batch per chunk with `Idempotency-Key: broadcast-<id>-<n>` (Resend honors keys
  for 24 h), a 60 s lease on the chunk being sent, and a retry with the same key after a 429/5xx or a
  call that died. A batch refused outright falls back to one message at a time, each with its own key.
  Five strikes and a chunk's remaining people are counted as failed. Totals are recomputed from the
  chunks on every call, so the record cannot drift from what went out.
- `email-unsubscribe` now accepts POST (the mail client's own button) as well as GET.
- Every recipient is in `emailLog` (tag `broadcast`); starting a send audits `email.broadcast-sent`,
  a test `email.broadcast-test`.

## Errors

Client errors land in the admin panel through `src/services/errorFingerprint.ts` (pure: fingerprint
+ ignore list) and `errorReporting.ts` (transport). Two things to know:

- **`normalizeError` keeps `err.name` in its own field, so the message alone is not what a reader
  sees.** An ignore rule written as `/^AbortError/` matches nothing unless `shouldReport` is given
  the name — it now tests every pattern against the message *and* against `name: message`, against
  both because several patterns are anchored and `"Script error."` arrives with the default name.
- **One chunk-error pattern, in `src/utils/chunkError.ts`, imported by both consumers.** Netlify's
  SPA rewrite answers a request for an evicted chunk with index.html, so browsers report a MIME
  type rather than a missing module. Two copies of that list drifted once and iPhone users got a
  crash screen for the one failure that self-heals on reload.

Floating promises are the other recurring bug: an unguarded `void somethingFirestore()` rejects
into the global handler as minified SDK frames with no idea what it was. Three have been fixed
(trade writes ×2, settings write). Catch and pass a `scope`.

## Screenshotting the app without running it

Renders the real components with the real built CSS — good enough to judge layout, and it needs no
server, no auth and no data:

1. Write a temp `src/components/__preview.test.ts` that `renderToString`s the shell
   (`JournalApp`'s wrapper: sidebar + `main.flex-1.p-2.md:p-5` + `div.max-w-[1680px].mx-auto`) and
   writes an HTML file into `dist/` with the built CSS inlined from the build output.
   Copy the mock block from `src/components/journalSurfacesRender.test.ts` — it already mocks
   firebase, both contexts, entitlement, auth and the coach-seat fetches. Add `journalLimit` and
   `canAddJournal` to the settings mock or the sidebar renders the upgrade line.
2. Stage the HTML to the cloud container, screenshot with Playwright at 1893×905
   (`executablePath: '/opt/pw-browsers/chromium'`).
3. Move the temp test out of `src/` afterwards — it must not stay in the suite.

For a true **before**, render the same harness in a second checkout of the old commit:
`git worktree add --detach <dir> <commit>`, then a junction from `<dir>/node_modules` to this repo's
`node_modules`, build its CSS to its own `--outDir`, and run the harness there. Remove the junction
with `cmd /c rmdir <dir>\node_modules` **before** `git worktree remove` — removing the worktree
with the junction still in place can delete through it into the real `node_modules`.

## Environment gotchas (Cowork device bridge)

- The shell on Jay's machine **cannot delete files** — `rm` fails with "Operation not permitted".
  Git therefore leaves `.git/index.lock` behind after every command, and the *next* write command
  fails with "Another git process seems to be running". Work around it by `mv`-ing the lock into
  `dist/stale-locks/` before each git write. Renames work; unlinks do not.
- `dist/` is gitignored, which makes it the right place for temp files that must live inside the
  mounted folder.
- Cowork writes delivered files into a `Claude outputs/` folder in the repo root. It is excluded
  locally via `.git/info/exclude`.
- **That shell's outbound network comes and goes.** When it is down, every host 403s at CONNECT —
  github, npm, everything — and `git push` cannot leave the machine. The cloud container can read
  GitHub but its git proxy refuses to push to a repo that is not in the session's authorized set,
  and repos can only be attached when a session is created. When both are shut, **Jay pushes from
  his own terminal**; do not go looking for a way around either denial.

## Open items

- **Market replay is live on Diamond (October 2026).** `MARKET_REPLAY_LIVE = true` in `tiers.ts` put it
  on the Diamond card (first of the Diamond-only lines), opened the screen and the server to Diamond,
  and turned on the landing page's `#replay` section, which renders only while `priceOf('marketReplay')`
  is non-null. Below Diamond the day page's Replay button opens the lock card. The site admin can
  always open it. Turning the flag off again takes it away from paying members.
  - **Public page:** `/market-replay` (`pages/MarketReplayPage.tsx`), in the Products menu and the phone
    menu with a "New" chip, prerendered and in the sitemap. It replaced the noindexed "Market Simulator
    — coming soon" placeholder; `/market-simulator` still routes to it. Study and strategy names on it
    are read from `replayStudies.ts` / `replayStrategies.ts`, plan and price from `tiers.ts`.
  - **Landing image** `public/landing/shot-replay.webp` is NOT from the SSR harness (the chart is a
    canvas): it is the replay screen in a real browser on the synthetic sample session, 1180px wide at
    2x, captured with Playwright against the Vite dev server and a temporary preview entry. Its size is
    in `landingShots.ts`, which the header test checks.
  - **What it is:** TradingView-style bar replay on the day page's "Replay" button. Candles from
    TradingView's open-source Lightweight Charts (pinned 5.2.1, lazy-loaded so no other screen pays
    for it), 1m/5m/15m, VWAP, click a candle to start, play/step/speed, practice trades at the close
    of the candle on screen (`utils/replayPractice.ts`, never saved), the day's contracts, plus any
    0DTE strike picked by hand.
  - **Data:** Databento historical, pay-as-you-go. OPRA.PILLAR for options, EQUS.MINI for the
    underlying, ohlcv-1m. Fetched by `server/marketReplay.ts` with `DATABENTO_API_KEY` (set in
    Netlify), and cached once per symbol-day in the server-only `marketReplayBars` collection (no
    rule, so clients are denied). SPX is drawn as SPY, because index values carry their own license.
  - **What it costs, and the allowance.** Databento bills by bytes in its binary encoding (56 bytes a
    one-minute bar) and publishes no per-GB rate for options, so every pull is priced by its own
    `metadata.get_cost` endpoint and recorded in `server/replayLedger.ts` (`replayMonths/{uid}_{month}`,
    `replayStats/{day}` and `month-{month}`, all server-only). Each Diamond member gets
    `replayUsdPerMonth` ($20, Jay's figure, in `tiers.ts`), released a day at a time with what is unused
    carried forward (`utils/replayAllowance.ts`), so it lasts the month. Only bought data counts: a
    cached day always replays, even for someone who has used their allowance. The site admin is never
    capped but is counted. A failed price is an estimate at a deliberately high $1/GB and is flagged.
    Admin → Ops → "Market replay data" shows the real spend. Jay considered opening replay to every
    paid plan behind a switch and decided against it (too expensive): Diamond only.
  - **The next-day rule is the license, not a preference.** OPRA charges nothing for options data
    a full trading day old, and Databento allows external display after 24 hours, so a day opens at
    the later of the two (`replayAvailableAt`: a Friday on Monday at 9:30 ET, a Monday on Tuesday at
    4:15 ET). The server refuses anything earlier. Same-day replay would bring OPRA's $1,500/month.
  - **Schwab sends no fill times,** so the replay never shows a real time for those trades. It
    shades the candles a fill price traded through, labeled as an estimate. SPX vs SPXW is decided
    by which root's bars contain the trader's fill prices.
  - **The chart's toolkit** (all computed in `utils/`, drawn by `components/replay/ReplayChart.tsx`):
    studies in `indicators.ts` use TradingView's default definitions (EMA seeded with an SMA,
    Wilder's RSI, population-sd Bollinger) so a number matches theirs; `replayStudies.ts` holds
    which are on, per browser. The strategy tester (`replayStrategies.ts`: EMA cross, opening-range
    breakout, VWAP cross) only sees the bars the replay has shown, fills at candle closes, and is
    labeled a test on one past day, never a signal. Drawings (`replayDrawings.ts`, trend line,
    horizontal line, zone) are kept per contract and day in localStorage.
  - **Drawing clicks come from the DOM, not the chart.** Lightweight Charts folds a second click
    within ~500ms into a double-click and reports neither when the two are far apart, so a trend
    line drawn at a natural pace lost its end. `subscribeClick` is only for picking a start candle.
  - The chart box is `isolate`: the library's pane separator has a z-index that otherwise sat over
    the Indicators menu once RSI or MACD was on.
- Annual billing is built and **switches itself on** once `CREEM_PRODUCT_SILVER_ANNUAL`,
  `_GOLD_ANNUAL` and `_DIAMOND_ANNUAL` are set in Netlify (distinct from the monthly ids) —
  `/api/payments-status` reports `annualReady`, the pricing toggle sells from it, and the admin
  health panel names what is missing. There is no flag. Moving a LIVE subscription between monthly
  and yearly is refused on purpose (cross-interval proration in Creem is untested); support does it.
- The playbook is done: rules per strategy in Settings, ticked on the trade form, stored on the trade
  as `checklist` (a snapshot — editing rules never rewrites old trades), scored rule-by-rule in the
  Discipline panel (`src/utils/playbook.ts`) and sent to the assistant as `playbook`.
- The rule simulator shipped on Gold. Jay's own numbers were the pitch: −$496/day on 11+ trade days
  vs +$163 on 1–2 trade days; he needs a 47.2% win rate to break even and hits 39.9%.
- Trial emails key on `trialEndsAt`, written by the webhook on a "trialing" signal. The daily
  trial-nudges run also asks Creem once per paying account whether it is a trial the webhook missed
  (`server/trialBackfill.ts`).
- **Every plan has the 7-day free trial (October 2026)**, set on each plan's monthly Creem product.
  `TRIAL_TIERS` in `src/config/trial.ts` lists them. Creem gives a product's trial to every new
  subscription and a checkout cannot opt out. So one trial per person is enforced at checkout:
  `planCheckoutTrial` (`server/checkoutTrial.ts`) sends anyone `trialEligibility` refuses to the
  plan's no-trial copy (`CREEM_PRODUCT_*_NO_TRIAL`). Until a copy exists, that plan's checkouts all
  get the trial, as Silver always did. `trialProducts` in the Ops report asks Creem whether all six
  products match what the site promises. The pricing page and the locked-feature cards offer each
  plan's own trial (`hasTrial(tier)`, `StartTrialButton tier=`), a buy-now-without-the-trial link
  where the plan's no-trial copy exists (`choosePlan(tier, 'month', { trial: false })`), and yearly
  at two months free once `annualReady`.
- Company research in the assistant is deliberately NOT wanted and the prompt now refuses it: there
  is no data source behind it, the model's knowledge goes stale, and "is X a good company" is the
  edge of investment advice.
- **Day notes and the "Followed my plan" rating reach the assistant** as `dayNotes`, behind the same
  switch as trade notes (one switch, "Let it read my trade and day notes"; the privacy page says so).
  `useAssistantChat` reads them once per account with `fetchAllDayNotes` (through `import()`, so
  Firestore stays out of other bundles) whether or not they are shared, because the nudge counts
  them; `buildJournalFacts` drops them unless `includeNotes`. Only days with trades in the period go,
  biggest result first, ten at most; `byRating` compares days rated 4–5 with days rated 1–2 once
  each side has three. The `/api/ai-takeaway` endpoint and `useAiTakeaway` are dead since the
  Overview lost its banner; the weekly recap uses `writeReview` in the assistant handler instead.

## Packaging it as a mobile app — what is already true

Asked for, not yet started. The facts that decide the approach:

- It is **already an installable PWA** — `public/manifest.webmanifest` is `display: standalone`,
  and the landing FAQ tells people to use Add to Home Screen.
- **The backend is Firebase**, so a wrapped build shares auth and Firestore with the web app and a
  journal carries over with no migration. That is the whole "same journal on both" problem, solved
  by not having it.
- The layout is already mobile-first: `useIsDesktop` (768px) switches between the sidebar and
  `MobileNav` + `MobileBottomNav`.
- **The hard part is billing, not the shell.** Creem subscriptions are a web checkout; Apple
  requires in-app purchase for digital subscriptions sold inside an iOS app, at their cut. Decide
  that before writing any wrapper code — it shapes whether the app sells at all or only signs in.
- Second hard part: the SnapTrade connect flow is a redirect to their portal, which needs checking
  inside a webview, and `/api/*` is Netlify Functions on a different origin.
