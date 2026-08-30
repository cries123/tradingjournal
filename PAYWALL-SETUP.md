# Turning the paywall on

Everything is built and deployed-safe: with no Creem keys set, the plans still
show, checkout says "not set up yet", and nothing breaks. These are the steps
that make it actually take money.

## 1. Create the three products in Creem

In the Creem dashboard, create one **recurring monthly** product per plan:

| Plan    | Price | Env var to paste its product id into |
| ------- | ----- | ------------------------------------ |
| Silver  | $5    | `CREEM_PRODUCT_SILVER`               |
| Gold    | $10   | `CREEM_PRODUCT_GOLD`                 |
| Diamond | $25   | `CREEM_PRODUCT_DIAMOND`              |

The price shown on the pricing page comes from `src/config/tiers.ts`, not from
Creem — if you change a price in Creem, change it there too or the page will lie.

## 2. Add the environment variables in Netlify

Site settings → Environment variables:

```
CREEM_API_KEY          = <your live API key>
CREEM_WEBHOOK_SECRET   = <the signing secret from the webhook you create below>
CREEM_PRODUCT_SILVER   = prod_...
CREEM_PRODUCT_GOLD     = prod_...
CREEM_PRODUCT_DIAMOND  = prod_...
PUBLIC_SITE_URL        = https://trendchasers.net
```

Leave `CREEM_TEST_MODE` unset for production. Set it to `true` only if you want
to run against Creem's sandbox — that needs a separate key **and** separate
product ids, so don't mix them.

## 3. Point Creem's webhook at the site

Webhook URL: `https://trendchasers.net/api/creem-webhook`

Subscribe to the subscription events (active / paid / cancelled / expired /
past due). Copy the signing secret into `CREEM_WEBHOOK_SECRET`.

Without that secret the endpoint refuses **every** webhook — which is the right
failure, since the signature is the only thing stopping a stranger from POSTing
themselves a Diamond plan. If payments go through but nobody gets upgraded, this
secret is the first thing to check.

## 4. Publish the Firestore rules

`firestore.rules` gained four blocks: `entitlements`, `syncUsage`, `creemEvents`,
and a tightened read on the existing counters. Deploy them (Firebase console →
Firestore → Rules, or `firebase deploy --only firestore:rules`) or the admin
panel won't be able to read anyone's plan.

## 5. Grandfather the people already using broker sync

**Do this before or immediately after you deploy.** Anyone currently syncing a
broker is on Free the moment this goes live, and Free has no broker sync — they
will hit the paywall on their next sync.

Admin panel → Users → click a user → **Plan** → click the tier you want to give
them. That writes a grant marked as manual, and billing webhooks are explicitly
forbidden from overriding it, so it survives forever until you remove it. The
audit log records every grant.

To find who's affected: they're the users with broker-synced trades — the user
list shows trade counts, and a user's detail modal shows their connection.

## How the pieces fit

- `src/config/tiers.ts` — the only place limits and prices are written down.
  Client and server both import it, so the badge, the paywall and the server
  that refuses the 16th AI message can't disagree.
- `server/entitlements.ts` — reads/writes `entitlements/{uid}`, Admin-SDK only.
  `effectiveTier()` is what decides access: a cancelled subscription still works
  until the period it was paid for runs out; past-due and expired do not.
- `netlify/functions/creem-webhook.ts` — verifies the HMAC, then applies the
  change. Idempotent: Creem retries up to five times, and a repeat of an event
  already handled is a no-op.
- `netlify/functions/creem-checkout.ts` — starts a checkout for the **signed-in**
  user. The uid comes from their Firebase token, never the request body.
- `server/usage.ts` — the per-day counters for syncs and AI messages, in a
  transaction so two tabs can't both spend the last one.

## Testing without real money

Set `CREEM_TEST_MODE=true` with sandbox keys and sandbox product ids, buy a plan
with Creem's test card, and watch the function log for
`[creem-webhook] subscription.paid uid=… tier=… applied=true`. Then set it back.

Faster still: grant yourself a tier from the admin panel. That exercises
everything downstream of payment — the gates, the meters, the badge — without
touching Creem at all.
