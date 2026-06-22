# Trading Journal

A dark-themed trading journal with a calendar view that color-codes each day green (profit) or red (loss), inspired by TraderSync.

## Features

- **Calendar view** — Monthly grid with green/red/gray day cells based on daily P&L
- **Daily details** — P&L amount, trade count, and setup tags (BREAKOUT, FOMO, RSI CROSSED, etc.)
- **Weekly summaries** — Totals on the right column for each week
- **Log trades** — Add trades with symbol, P/L, setup, and side (matches Thinkorswim-style daily P/L)
- **Screenshot import** — Upload a Thinkorswim/brokerage screenshot; AI extracts P/L Day, symbol, and contract details
- **Filters** — Filter by symbol, setup, or side
- **Persistent storage** — Trades saved in your browser via localStorage

## Getting Started

```bash
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

## Screenshot Import (AI)

1. Click **Import Screenshot** in the sidebar
2. Upload a Thinkorswim (or other brokerage) screenshot showing P/L Day
3. Enter your [OpenAI API key](https://platform.openai.com/api-keys) (saved locally), or set `OPENAI_API_KEY` in `.env`
4. Click **Parse with AI**, review the extracted fields, then **Add to Journal**

The parser reads symbol (e.g. SPY), P/L Day ($260.00), option contract notes, and side from screenshots like your Thinkorswim positions screen.

## Usage

1. Click **+ Log Trade** or **Import Screenshot** to record a trade.
2. Use the calendar arrows to navigate months.
3. Click any day to view or delete trades for that date.

## Tech Stack

- React + TypeScript
- Vite
- Tailwind CSS
