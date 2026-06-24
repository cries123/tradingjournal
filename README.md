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

Restart the dev server after changing `.env`. You can also paste the key in the import dialog (stored in your browser only).

### 5. Firebase cloud sync (optional)

1. Create a project at [Firebase Console](https://console.firebase.google.com/)
2. Add a **Web app** and copy the config values into `.env` (see `.env.example`)
3. Enable **Authentication → Google** sign-in provider
4. Create a **Firestore Database** (production mode)
5. Deploy rules from `firestore.rules` in the Firebase console (Rules tab):

```
allow read, write: if request.auth.uid == userId;
```

6. Restart `npm run dev` and click **Sign in with Google** in the sidebar

Your trades sync to `users/{your-uid}/trades` in Firestore. Local browser trades migrate automatically on first sign-in.

---

## Features

- **Dashboard** — Calendar, Net P&L, win rate, profit factor, weekday & daily charts
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
- With Firebase: trades sync to your Firestore under your Google account
- CSV import runs in your browser — your statement never leaves your machine
- Screenshot AI sends images to OpenAI only when you use that feature

## Tech stack

- React + TypeScript
- Vite
- Tailwind CSS
