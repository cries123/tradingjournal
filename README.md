# Trading Journal

A dark-themed trading journal with a calendar dashboard — green days for profit, red for loss. Connect
Schwab or Robinhood for automatic trade sync, or log trades manually.

## Run locally on your computer

### Requirements

- [Node.js](https://nodejs.org/) 18 or newer (includes `npm`)

### 1. Get the code

```bash
git clone https://github.com/cries123/tradingjournal.git
cd tradingjournal
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the app

**Development (recommended while using it):**

```bash
npm run dev
```

Open **http://localhost:5173** in your browser.

**Production build (faster, no hot reload):**

```bash
npm run build
npm start
```

Open **http://localhost:5173** — this serves the built app locally.

### 4. Optional — broker sync (Schwab & Robinhood)

Broker sync requires both Firebase (below) and a SnapTrade account, since the connection has to be tied
to a signed-in user and SnapTrade brokers the actual link to Schwab/Robinhood.

1. Sign up at [SnapTrade](https://dashboard.snaptrade.com) and grab your `clientId` and `consumerKey`
2. Add them to `.env`:

```bash
cp .env.example .env
```

```
SNAPTRADE_CLIENT_ID=your-client-id
SNAPTRADE_CONSUMER_KEY=your-consumer-key
```

3. Broker connect also needs `FIREBASE_SERVICE_ACCOUNT_JSON` (a Firebase service account key, server-side
   only) so the Netlify function can store each user's SnapTrade connection securely — see the Firebase
   Console → Project settings → Service accounts → Generate new private key, then paste the JSON as one
   line into `.env`.

Without these, the app still runs fine — the Connect broker screen just shows a "not set up yet" message,
and manual entry works exactly the same either way.

### 5. Firebase cloud sync (optional, required for broker sync)

1. Create a project at [Firebase Console](https://console.firebase.google.com/)
2. Add a **Web app** and copy the config values into `.env` (see `.env.example`)
3. Enable **Authentication → Email/Password** and **Google** sign-in providers
4. Create a **Firestore Database** (production mode)
5. Deploy rules from `firestore.rules` in the Firebase console (Rules tab)
6. Add **trendchasers.net** (and your Netlify subdomain) under **Authentication → Settings → Authorized domains**
7. Generate a service account key (Project settings → Service accounts) if you also want broker sync,
   and set it as `FIREBASE_SERVICE_ACCOUNT_JSON`
8. Restart `npm run dev` — a login popup appears on first visit

Your trades sync to `users/{your-uid}/trades` in Firestore. Local browser trades migrate automatically on first sign-in.

---

## Deploy to Netlify

1. Push this repo to GitHub and connect it in [Netlify](https://www.netlify.com/)
2. Build settings are in `netlify.toml` (`npm run build`, publish `dist`)
3. Add **Environment variables** in Netlify → Site settings → Environment:

| Variable | Required | Notes |
|----------|----------|-------|
| `SNAPTRADE_CLIENT_ID` | For broker sync | From your SnapTrade dashboard |
| `SNAPTRADE_CONSUMER_KEY` | For broker sync | Server-side only — never exposed to the browser |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | For broker sync | Service account key JSON, server-side only |
| `VITE_FIREBASE_API_KEY` | For cloud sync | Firebase web config |
| `VITE_FIREBASE_AUTH_DOMAIN` | For cloud sync | |
| `VITE_FIREBASE_PROJECT_ID` | For cloud sync | |
| `VITE_FIREBASE_STORAGE_BUCKET` | For cloud sync | |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | For cloud sync | |
| `VITE_FIREBASE_APP_ID` | For cloud sync | |
| `SITE_URL` | Production domain | `https://trendchasers.net` — used for share links, broker-connect redirects and links in email |
| `RESEND_API_KEY` | For email | Ticket-reply notifications and the weekly recap. Without it both are silently skipped and the in-app unread badge is the only notice |
| `MAIL_FROM` | For email | Defaults to `Trend Chasers <support@trendchasers.net>`. The domain must be verified in Resend first |
| `EMAIL_TOKEN_SECRET` | For email | Any random string of 16+ characters. Signs one-click unsubscribe links; without it the recap sends with no unsubscribe link, so set it before enabling the recap |

4. Deploy. Broker sync calls `/api/broker-connect`, which runs as a Netlify Function using your SnapTrade
   and Firebase credentials.

### Custom domain (trendchasers.net)

1. In Netlify → **Domain management**, add `trendchasers.net` and follow DNS instructions
2. Set `SITE_URL=https://trendchasers.net` in environment variables (also used for broker-connect redirects)
3. Redeploy after changing env vars

---

## Features

- **Dashboard** — Calendar, Net P&L, win rate, profit factor, weekday & daily charts (fits in one screen, no scrolling)
- **Login popup** — Email/password or Google sign-in; create an account stored in Firebase
- **Connect broker** — Read-only Schwab or Robinhood sync via SnapTrade; round-trip trades matched automatically
- **Log trades manually** — Symbol, P/L, setup tags, always available with no connection required
- **Persistent storage** — Browser cache + **Firebase Firestore** when signed in

## Connect a broker

1. In the app: **Connect broker** in the sidebar
2. Choose Charles Schwab (covers thinkorswim accounts too) or Robinhood
3. Approve a read-only connection in the SnapTrade window that opens
4. Back in the app, click **Refresh** then **Sync trades** on the account you connected

## Data & privacy

- Without Firebase: trades saved in your browser only
- With Firebase: trades sync to your Firestore under your account
- Broker sync is opt-in and read-only — your brokerage credentials go to your broker or SnapTrade's secure
  portal, never to this app's servers
- Disconnect a broker anytime from Connect broker — that revokes SnapTrade's access immediately

## Tech stack

- React + TypeScript
- Vite
- Tailwind CSS
- Firebase Auth + Firestore
- Netlify Functions (SnapTrade broker sync)
