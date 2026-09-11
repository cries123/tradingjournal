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
npm test                       # vitest, 698 tests, node environment
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

## Deploy sequencing — this order, always

1. Push → Netlify deploys.
2. **Then** publish `firestore.rules` and `storage.rules` in the Firebase console.

Backwards, the live build gets denied collections it still reads. Neither rules file is
auto-deployed (there is no `firebase.json`); both are pasted by hand. Jay does this himself.

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

- Market replay is sold on the Diamond card but not built — `MARKET_REPLAY_LIVE = false` in
  `tiers.ts` is the single flag to flip when it ships.
- Annual billing is built and off: `ANNUAL_BILLING_LIVE = false`, needs three Creem product ids.
- `Strategy.criteria` is declared in `src/types/strategy.ts` and written as `[]` everywhere, and
  `checklistScore` is a percentage typed into a box — which is why the Discipline panel is dead for
  every user. Finishing the playbook is the most-requested Gold feature on the list.
- A rule simulator (replay "stop at 4 trades a day" against real history) is the proposed Gold
  headline feature. Jay's own numbers are the pitch: −$496/day on 11+ trade days vs +$163 on 1–2
  trade days; he needs a 47.2% win rate to break even and hits 39.9%.
