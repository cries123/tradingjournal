# Reddit update post — Trend Chasers

## Title options

1. I rebuilt the analytics in my trading journal because the whole page was blank for anyone who synced a broker
2. Spent a month fixing my journal's analytics after realizing half the charts needed data brokers don't send
3. Update: broker-only analytics, a coach seat, and four import bugs I'd rather not have found

---

## Body

I build Trend Chasers, a trading journal. This is the "what changed" post, and the honest version of why.

The Performance page used to be built for people who tag every trade by hand — setup name, planned R, MAE, MFE, a grade. If you did all that, it was great. If you connected Schwab and let it import, you got a page of empty tables, because Schwab's feed doesn't even send a fill time — just a date. Every hour-of-day chart on that screen was drawing nothing. It shipped that way for months.

So I threw it out and rebuilt it around what a broker actually sends: symbol, side, quantity, price, date, fees. Everything on the page now populates from a sync alone.

**What's on it now**

- **Breakeven win rate.** Given your average win and average loss, the win rate you need just to be flat — next to the one you actually have. Mine says I need 47.2% and I hit 39.9%. That single line explains more than any equity curve I've ever looked at.
- **Position sizing.** Average P&L per trade on your biggest quarter of positions vs. everything else. Tells you whether size is following your edge or your ego. (Mine: −$40.00 per trade on the big ones, −$7.89 on the rest. Ego.)
- **Tilt.** What the trade right after a loss looks like compared to the trade after a win — size, hold time, result.
- **Trades per day.** P&L bucketed by how many trades you took that session. On days I took 11+ I averaged −$496. On 1–2 trade days, +$163. I had never once looked at my trading that way.
- **Days to expiry at entry**, and a **calls vs. puts** split, for anyone trading options.
- **Costs.** Commissions and fees as a share of gross P&L.
- **A coverage panel** that says plainly which fields your broker didn't send, instead of silently drawing an empty chart at you.

Every panel has a minimum sample size and stays hidden until you clear it. Nothing here is going to tell you your edge based on four trades.

**One number, honestly labeled.** There's now a Trading Score, 0–100, from five equally weighted parts: edge, payoff, profit factor, recovery from drawdown, and consistency. Under 30 trades it says out loud that it isn't reliable yet rather than quietly pretending.

**The assistant has its own tab now,** with saved threads. Ask it something about your stats in March, come back in June, the conversation is still there.

**A support tab** with actual ticket history, so you can read what support told you three weeks ago instead of digging through email.

**New on Diamond:**
- Automatic import every market morning. No button, no remembering.
- A coach seat — invite your coach, they get a free account, and they can write notes back on specific days and trades that you see in the app.
- Rule alerts. Set a daily loss limit or a max trade count and get told in-app the moment you cross it, plus a summary the next morning.
- A weekly review the assistant writes from your actual journal, not a template.

**Import correctness, which is the unglamorous half.** Long and short option lots are kept separate so a covering buy can't close out a long position. Within a single timestamp, opens now match before closes. Same-day fills pair in the order they happened. Expirations get recorded instead of leaving a position open forever. An entry commission is charged once no matter how many exits close the position. And a sync that saved nothing no longer reports success — it tells you what it couldn't account for. If your earlier imports were affected, the app now says so and tells you how to fix them.

**Plans**, since it comes up: free keeps the entire journal — manual logging, calendar, notes, grading, share cards, tax export — and 2 journals. Silver is $9 and adds broker sync plus the whole Performance page. Gold is $19 for more of everything and the assistant. Diamond is $39 for unlimited broker connections and the four things above. Broker connections are unlimited on Diamond because my provider bills me per person, not per connection, so charging for them was just rent.

Happy to answer anything, and genuinely interested in what's missing. The breakeven-win-rate panel exists because someone in a thread like this pointed out that win rate on its own is a meaningless stat, and they were right.

trendchasers.net

---

## Prepared reply for "what does it cost / is it free"

Free tier is the full journal — log trades by hand, calendar, notes, grading, share cards, tax export, 2 journals. No trial timer on it. Paid starts at $9 and that's where broker sync and the analytics page live, because the broker connection has a per-user cost I actually pay.

## Prepared reply for "which brokers"

It goes through SnapTrade, so anything they cover. Fair warning from the post above: how much of the Performance page fills in depends on what your broker's feed includes. Schwab sends dates without times, so anything hour-of-day stays hidden for them — the coverage panel tells you which ones you're missing rather than faking it.
