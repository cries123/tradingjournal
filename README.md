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

---

## Features

- **Dashboard** — Calendar, Net P&L, win rate, profit factor, weekday & daily charts
- **Import CSV** — Schwab/Thinkorswim account statement (`Account Trade History`)
- **Import Screenshot** — AI reads Thinkorswim P/L Day from phone screenshots
- **Log trades manually** — Symbol, P/L, setup tags
- **Persistent storage** — All data stays in your browser (`localStorage`); nothing is sent to a server except OpenAI when parsing screenshots

## Import your Schwab trades

1. In Thinkorswim/Schwab: **History → Export account statement** (CSV)
2. In the app: **Import CSV** → upload the file
3. Review matched round-trip trades → **Import**

## Import from screenshots

1. Click **Import Screenshot**
2. Upload Thinkorswim position screenshots
3. Parse with AI → review → add to journal

## Data & privacy

- Trades are saved **only in your browser** on this computer
- Clearing browser data or using a different browser/device will not show the same trades
- CSV import runs entirely in your browser — your statement never leaves your machine
- Screenshot AI parsing sends the image to OpenAI if you use that feature

## Tech stack

- React + TypeScript
- Vite
- Tailwind CSS
