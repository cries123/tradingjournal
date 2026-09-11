# Reddit update post — short version

**Title:** My journal's analytics page was blank for anyone who synced a broker, so I rebuilt it

---

I build Trend Chasers, a trading journal. The Performance page used to need hand-tagged trades — setup, R, MAE, MFE. Connect Schwab instead and you got empty tables, because their feed doesn't send fill times. So I rebuilt the whole page around what brokers actually send.

What's on it now, all from a sync alone:

- **Breakeven win rate** — what your avg win/loss requires, next to what you hit. Mine: need 47.2%, hit 39.9%.
- **Position sizing** — P&L per trade on your biggest quarter of positions vs. the rest. Mine: −$40.00 vs −$7.89. Size following ego, not edge.
- **Tilt** — the trade after a loss vs. after a win.
- **Trades per day** — I averaged −$496 on 11+ trade days, +$163 on 1–2 trade days.
- **Days to expiry, calls vs puts, commissions as a share of gross.**
- A panel that says what your broker *didn't* send instead of drawing an empty chart at you.

Also new: a 0–100 Trading Score that admits when it doesn't have enough trades yet, the assistant moved to its own tab with saved chat history, a support tab with real ticket threads, and on the top plan — automatic morning imports, a coach seat where your coach writes notes back, rule alerts when you blow a daily loss limit, and a weekly review written from your actual journal.

Plus a pile of import fixes: option lots kept long/short separate, same-day fills paired in order, expirations recorded, entry commissions charged once, and a sync that saves nothing no longer claims success.

Free tier is the full journal — manual logging, calendar, notes, grading, tax export. Paid starts at $9 where broker sync and the analytics live.

trendchasers.net — tell me what's missing.
