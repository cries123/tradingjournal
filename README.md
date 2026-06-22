# Trading Journal

A dark-themed trading journal with a calendar view that color-codes each day green (profit) or red (loss), inspired by TraderSync.

## Features

- **Calendar view** — Monthly grid with green/red/gray day cells based on daily P&L
- **Daily details** — P&L amount, trade count, and setup tags (BREAKOUT, FOMO, RSI CROSSED, etc.)
- **Weekly summaries** — Totals on the right column for each week
- **Log trades** — Add trades with symbol, P/L, setup, and side (matches Thinkorswim-style daily P/L)
- **Filters** — Filter by symbol, setup, or side
- **Persistent storage** — Trades saved in your browser via localStorage

## Getting Started

```bash
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

## Usage

1. Click **+ Log Trade** to record a trade (enter your daily P/L from Thinkorswim).
2. Use the calendar arrows to navigate months.
3. Click any day to view or delete trades for that date.
4. Sample April 2025 data loads automatically on first visit.

## Tech Stack

- React + TypeScript
- Vite
- Tailwind CSS
