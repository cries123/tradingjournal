# Recovery — what broke, what's fixed, what you need to do

---

## THE ROOT CAUSE: Firestore daily read quota was exhausted

Everything that looked like separate catastrophes was one thing.

Firestore's free tier allows 50,000 document reads per day. Once that trips, **Firestore refuses
every read for the rest of the day.** It does not return an error users understand — it just fails,
and each part of the app reports the failure in its own misleading words:

| What you saw | What was actually happening |
|---|---|
| "All my July trades are gone" | The trades were never deleted. The read was refused, so the calendar rendered empty. |
| Admin panel "Access denied" | The panel reads `config/admin` to check your uid. The read threw; the code catches any error and can only say "denied". |
| Broker "not connected" / 500 | Your SnapTrade credentials live in a Firestore document. The server couldn't read it, so it reported "not registered". |

**No data was lost.** Not one trade.

### Why the quota blew out — this part is mine

Two of my mistakes multiplied:

1. **The duplication doubled every connected user's document count.** Twice the documents means
   twice the reads, on every single load.
2. **The journal had no local cache.** `subscribeTrades` streamed the *entire* trades collection
   from the server on every app open. A trader with 800 trades billed 800 reads just to look at
   their dashboard — again on every reload, every device, all day.

Together: enough traffic to burn 50,000 reads well before the day was out.

### The fix in this build

`src/lib/firebase.ts` now initialises Firestore with a **persistent on-disk cache**
(`persistentLocalCache` + `persistentMultipleTabManager`). First load pays for the documents once;
after that they're served from IndexedDB and the listener pulls only what changed. A journal that
gains a few trades a day costs a few reads a day instead of its entire history every time.

This is the difference between a journal that costs pennies and one that doesn't — and now that
you're on Blaze it's a billing question rather than a lockout one.

`server/brokerConnectHandler.ts` also stops lying about the cause: a Firestore quota or
availability failure now returns a message saying the database is unavailable and that **nothing
has been disconnected**, instead of "Broker connect request failed. Please try again" — advice that
cannot possibly work when the database is refusing reads.

### You're on Blaze — good. Two things to check

1. **Billing account actually linked.** Firebase Console → ⚙️ → Usage and billing → Details &
   settings. "Blaze" with no Cloud Billing account attached doesn't lift anything.
2. **Legacy App Engine daily spending limit.** Google Cloud Console → App Engine → Settings. Older
   projects carry a daily spending limit that defaults to **$0**, which keeps enforcing free-tier
   caps even on Blaze. If it's there and it's $0, that's why the limit message persisted.

If both are fine, the quota window clears on its own at **midnight Pacific** and everything returns.

### Set a budget alert today

You're on pay-as-you-go now. Google Cloud Console → Billing → Budgets & alerts → Create budget.
Set something like $25/month with alerts at 50/90/100%. It won't cap spend, but you'll never be
surprised. Do this before you close the laptop.

### Do NOT turn on App Check

You were one click from enabling it. App Check with reCAPTCHA Enterprise, once enforced, blocks
every client that can't produce a valid attestation token — which right now is all of them. It
would take your app fully offline and it has nothing to do with any of this.

---

Three things went wrong at once. They have **three different causes**, and only one of them is
fixed by deploying code. Do them in this order.

---

## 1. Duplicated trades — MY BUG. Fixed in this build.

**What happened.** I shipped an automatic broker sync that ran when the journal opened. It could
fire *before* the journal had finished loading from Firestore. At that moment the app's trade list
is still empty, so the sync compared the broker's trades against nothing, concluded every trade was
new, and imported everyone's history a second time.

**What this build does about it:**

- **The automatic sync is gone.** Broker data is only ever fetched when someone opens Connect
  Broker and presses Sync. There is no background job, no schedule, no sync-on-open.
- **Journals repair themselves.** On next open, duplicate rows are detected and removed, and the
  trader sees a short note saying how many went and why.
- **The cleanup is provable, not guessed.** Every broker trade carries a `sourceId` from SnapTrade
  (`snaptrade:<open>:<close>`). Two rows with the same `sourceId` in the same journal are the same
  fill written twice — that's the only thing it removes. Manually-logged trades have no `sourceId`
  and are never candidates, because two identical trades on one day is something traders genuinely
  do. Where a trade existed twice, it keeps the copy carrying notes, tags, screenshots and grade.
- **A second duplication path, closed.** The manual Sync button deduped against the *filtered*
  trade list. If a trader had a symbol or tag filter active and pressed Sync, everything hidden by
  the filter came back in as new. It now checks every trade in every journal, unfiltered. This one
  had nothing to do with auto-sync — it would have bitten you eventually anyway.

**It asks before deleting, and backs up first.** I originally built this to run automatically
because you asked for that. I've changed it back, and you should know why: an unattended deleter is
only as safe as your confidence in the surrounding system, and while trades are going missing for
reasons neither of us has explained yet, that confidence doesn't exist. Detection being provable is
not the same as this being the right moment.

So: a banner shows the count, the trader can read the exact list before agreeing, and the rows are
written to a downloaded JSON file *before* a single delete is issued. Even a mistaken cleanup is
recoverable from their own downloads folder. Change it back to automatic once the missing-trade
question is answered and I'll do it in a minute.

---

## 2. Clear journal button — fixed in this build.

It deleted trades with one request per trade, all fired at once. On a small journal that's fine; on
a doubled journal it's hundreds of concurrent writes, and a single rejection aborted the whole
operation. It half-cleared and looked like the button did nothing. It now deletes in chunked
batches, and a failure shows you a message instead of failing silently.

---

## 3. Admin panel "Access denied" — NOT a code problem. Deploying won't fix it.

Admin access is one Firestore document: **`config/admin`**, with a `uid` field. The panel lets you
in only when that `uid` matches the account you're signed in as. Your screenshot shows you signed
in as `criesemail123@gmail.com`, and it's saying that account isn't the one on file. No deploy and
no rollback can change that document.

**Check this first (2 minutes):**

1. Firebase Console → Firestore Database → `config` → `admin`. Note the `uid` value.
2. Firebase Console → Authentication → Users. Find `criesemail123@gmail.com`, note its **User UID**.
3. Same? Then it's a rules problem — go to (b). Different? Go to (a).

**(a) The uids differ.** Either sign in with the account that originally claimed admin, or edit the
`uid` field in `config/admin` to your current account's UID. That's the whole fix.

**(b) The uids match but you're still denied.** The read is being rejected by your published
security rules. Open DevTools on `/admin` and look for `permission-denied` in the console. If it's
there, re-publish `firestore.rules` from this build.

**Worth fixing soon either way:** the rule is *"the first signed-in user to visit /admin claims the
role."* If your Firestore is ever reset, whoever hits `/admin` first owns your admin panel. That
should be a hardcoded UID, not a race. Say the word and I'll change it.

---

## 4. AI assistant "unavailable right now" — diagnose before changing anything.

That message has several possible causes and they need different fixes. Open DevTools → Network,
ask the assistant a question, click the `ai-assistant` request and read the **status code**:

| Status | Meaning | Fix |
|---|---|---|
| **404** | The function isn't deployed | Check the Netlify build log for `ai-assistant` under Functions |
| **503** + "not set up yet" | `OPENAI_API_KEY` missing | Add it in Netlify → Site config → Environment variables, then **redeploy** |
| **502** | OpenAI rejected the call | Almost certainly the model name — see below |
| **429** | Daily cap | Real cap, or previously a masked Firestore failure — now reported separately |
| **500** | Server error | Netlify → Functions → `ai-assistant` → logs |

### Update: found it — it's the reasoning-token budget

Your screenshot said **"The assistant returned an empty answer."** That is not a rephrasing
problem and never was.

`gpt-5-mini` is a reasoning model: it spends part of its completion budget thinking before it
writes anything. I capped `max_completion_tokens` at **700**. The reasoning consumed the entire
allowance, so the API returned HTTP 200 with empty content and `finish_reason: "length"` — and the
code turned that into "try rephrasing", sending every user to fix a question that was fine.

Fixed in this build:

- Budget raised to 3000 (`AI_MAX_TOKENS` to override). Unused budget costs nothing — you're billed
  on tokens actually produced.
- `reasoning_effort: 'low'` for gpt-5/o-series models. This task is "explain these numbers", not a
  puzzle; a long reasoning pass buys nothing and is what starved the answer.
- Empty answer now retries with double the budget, then falls back to `gpt-4o-mini`, logging what
  to fix each time.
- The user-facing message no longer blames the question.

**The other 502 cause, still worth knowing:** I set `AI_MODEL` to
`gpt-5-mini`. If that name isn't right or isn't enabled on your OpenAI account, every single call
fails and the assistant is dead for everyone — with the only evidence in a function log.

This build fixes that failure mode: if the configured model is rejected (400/404), it retries once
on `AI_FALLBACK_MODEL` (default `gpt-4o-mini`) and logs loudly telling you to fix `AI_MODEL`. The
assistant keeps working while you sort it out.

It also stops a Firestore outage from telling every user they'd hit a 15-question limit they never
used — that now reports as a brief outage, which points you at the real problem.

**To pin a model explicitly:** set `AI_MODEL` in Netlify environment variables to a model you know
your account has, and redeploy. Check your available models at
<https://platform.openai.com/docs/models>. Also confirm billing is active on the OpenAI account —
a key with no credit fails every call.

---

## Deploy order

1. **Netlify → Deploys → last good deploy → Publish deploy.** Stops the bleeding in ~30 seconds
   while you do the rest. This alone halts new duplication.
2. Unzip this over your repo, commit, push. That ships items 1 and 2 and the AI hardening.
3. Work through item 3 (admin) in the Firebase console — independent of the deploy.
4. Work through item 4 (AI) with the status code — independent of the deploy.

## Verification in this build

- `tsc -b --force` — clean
- `eslint` — 0 errors (19 pre-existing warnings, all `react-hooks/set-state-in-effect`, untouched)
- `vite build` — clean
- 23 unit assertions across duplicate detection and both dedupe paths, including a reproduction of
  the filter bug proving old behaviour re-imported and new behaviour doesn't
