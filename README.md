# Trading Journal

A dark-themed trading journal with a calendar dashboard — green days for profit, red for loss. Import trades from Schwab CSV exports or Thinkorswim screenshots.

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

### 4. Optional — AI screenshot import

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Add your OpenAI API key:

```
OPENAI_API_KEY=sk-your-key-here
```

Restart the dev server after changing `.env`. You can also paste the key in the import dialog when no server key is configured (stored in your browser only).

### 5. Firebase cloud sync (optional)

1. Create a project at [Firebase Console](https://console.firebase.google.com/)
2. Add a **Web app** and copy the config values into `.env` (see `.env.example`)
3. Enable **Authentication → Email/Password** and **Google** sign-in providers
4. Create a **Firestore Database** (production mode)
5. Deploy rules from `firestore.rules` in the Firebase console (Rules tab)
6. Add **trendchasers.net** (and your Netlify subdomain) under **Authentication → Settings → Authorized domains**
7. Restart `npm run dev` — a login popup appears on first visit

Your trades sync to `users/{your-uid}/trades` in Firestore. Local browser trades migrate automatically on first sign-in.

---

## Deploy to Netlify

1. Push this repo to GitHub and connect it in [Netlify](https://www.netlify.com/)
2. Build settings are in `netlify.toml` (`npm run build`, publish `dist`)
3. Add **Environment variables** in Netlify → Site settings → Environment:

| Variable | Required | Notes |
|----------|----------|-------|
| `OPENAI_API_KEY` | For screenshot AI | Server-side only — never exposed to the browser |
| `VITE_FIREBASE_API_KEY` | For cloud sync | Firebase web config |
| `VITE_FIREBASE_AUTH_DOMAIN` | For cloud sync | |
| `VITE_FIREBASE_PROJECT_ID` | For cloud sync | |
| `VITE_FIREBASE_STORAGE_BUCKET` | For cloud sync | |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | For cloud sync | |
| `VITE_FIREBASE_APP_ID` | For cloud sync | |
| `SITE_URL` | Production domain | `https://trendchasers.net` — used for OAuth redirects and share links |
| `SCHWAB_CLIENT_ID` | Schwab OAuth | App Key from Schwab Developer Portal |
| `SCHWAB_CLIENT_SECRET` | Schwab OAuth | App Secret from Schwab Developer Portal |
| `SCHWAB_REDIRECT_URI` | Schwab OAuth | `https://trendchasers.net/api/broker-oauth-callback` (must match Schwab portal exactly) |

4. Deploy. Screenshot import calls `/api/parse-screenshot`, which runs as a Netlify Function using your `OPENAI_API_KEY`.

### Custom domain (trendchasers.net)

1. In Netlify → **Domain management**, add `trendchasers.net` and follow DNS instructions
2. Set `SITE_URL=https://trendchasers.net` in environment variables
3. Update Schwab Developer Portal **Callback URL** to `https://trendchasers.net/api/broker-oauth-callback`
4. Redeploy after changing env vars

---

## Features

- **Dashboard** — Calendar, Net P&L, win rate, profit factor, weekday & daily charts (fits in one screen, no scrolling)
- **Login popup** — Email/password or Google sign-in; create an account stored in Firebase
- **Import CSV** — Schwab/Thinkorswim account statement (`Account Trade History`)
- **Import Screenshot** — AI reads Thinkorswim P/L Day from phone screenshots
- **Log trades manually** — Symbol, P/L, setup tags
- **Persistent storage** — Browser cache + **Firebase Firestore** when signed in

## Import your Schwab trades

1. In Thinkorswim/Schwab: **History → Export account statement** (CSV)
2. In the app: **Import CSV** → upload the file
3. Review matched round-trip trades → **Import**

## Import from screenshots

1. Click **Import Screenshot**
2. Upload Thinkorswim position screenshots
3. Parse with AI → review → add to journal

## Data & privacy

- Without Firebase: trades saved in your browser only
- With Firebase: trades sync to your Firestore under your account
- CSV import runs in your browser — your statement never leaves your machine
- Screenshot AI sends images to OpenAI only when you use that feature

## Tech stack

- React + TypeScript
- Vite
- Tailwind CSS
- Firebase Auth + Firestore
- Netlify Functions (OpenAI screenshot parsing)
