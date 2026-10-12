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

Sidebar destinations: Overview, Performance, Rule simulator, Assistant, Track record, plus Connect
broker, Settings, Support. `report` (the monthly report) is reached from the Overview, not the
sidebar. Every screen is wrapped in `PageFrame` (`src/components/layout/PageFrame.tsx`) — full
width in the app, a centred column on the public site. `sidebarDestination` hides its back link on
desktop, where the sidebar already goes there.

Shared pieces, so none of these get rebuilt:

- **`SegmentedControl`** (`components/ui/`) is the one period/mode toggle. There were three.
- **`CountUp`** and **`Reveal`** (`components/motion/`), `useReveal`, `useAnimatedClose`
  (`hooks/`). Figures count up and roll on change; cards rise in when first scrolled into view;
  every dialog plays out before it unmounts, via `useAnimatedClose` — a close wired straight to the
  prop skips the animation, which is the bug Escape had on the day drawer.
- **`.panel-grid`** in `index.css` lays the Performance panels out so rows end level and a short
  last row splits into halves rather than leaving one card 1,600px wide. It works for any card
  count; `dist/pv-gridcheck.mjs` checks 1–10 at three widths.
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

`AssistantPanel` is one component on two surfaces — the Assistant page (`layout="page"`) and the
dock on the Overview. Both read the same saved conversations from `useAssistantThreads`
(localStorage, not Firestore).

- The period opens on the narrowest one that **has trades**, not always this month — on the 1st of
  a month the old default showed "no trades in this period" over a full journal.
- `chatLocked` is the Silver view: the opening findings are computed in the browser by
  `openingFindings`, cost nothing, and are shown for real; only the chat is behind Gold. Free keeps
  the padlock, because those findings are the Performance screen's analysis.
- Server guardrails are in `server/aiAssistantHandler.ts`: **the model never computes** (the client
  sends facts already derived by `journalFacts.ts`) and **it never advises on what to trade next**.
  That second line is what keeps this a journaling feature rather than unlicensed financial advice.
  There is no rule in the prompt covering general knowledge, so "what does SPY track" is currently
  undefined behaviour.

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

- Market replay is **not built and not on any card**. Diamond still grants it, so shipping is
  `MARKET_REPLAY_LIVE = true` in `tiers.ts` and the line returns to the card by itself. It needs
  licensed intraday data; don't relist it as "coming soon" — that is still selling it.
- Annual billing is built and **switches itself on** once `CREEM_PRODUCT_SILVER_ANNUAL`,
  `_GOLD_ANNUAL` and `_DIAMOND_ANNUAL` are set in Netlify (distinct from the monthly ids) —
  `/api/payments-status` reports `annualReady`, the pricing toggle sells from it, and the admin
  health panel names what is missing. There is no flag. Moving a LIVE subscription between monthly
  and yearly is refused on purpose (cross-interval proration in Creem is untested); support does it.
- The playbook is done: rules per strategy in Settings, ticked on the trade form, stored on the trade
  as `checklist` (a snapshot — editing rules never rewrites old trades), scored rule-by-rule in the
  Discipline panel (`src/utils/playbook.ts`). Rule-by-rule results are not yet in the assistant's
  facts.
- The rule simulator shipped on Gold. Jay's own numbers were the pitch: −$496/day on 11+ trade days
  vs +$163 on 1–2 trade days; he needs a 47.2% win rate to break even and hits 39.9%.
- Trial emails key on `trialEndsAt`, written by the webhook on a "trialing" signal. The daily
  trial-nudges run also asks Creem once per paying account whether it is a trial the webhook missed
  (`server/trialBackfill.ts`).
- Rule-by-rule playbook results are still not in the assistant's facts.
- The assistant prompt says nothing about general knowledge, so a plain "what does assignment mean"
  is undefined — it may answer from memory or deflect. Company research is deliberately NOT wanted:
  there is no data source behind it, the model's knowledge goes stale, and "is X a good company" is
  the edge of investment advice.

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
