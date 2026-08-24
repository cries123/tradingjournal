REAL BROKER LOGOS FOR THE 16 NEW BROKERS
==========================================

18 files (16 new logo images, 2 modified code files).

WHAT CHANGED
The 16 brokers added earlier (Fidelity, E*TRADE, Interactive Brokers,
Vanguard, tastytrade, TradeStation, Tradier, Public, Alpaca, Moomoo,
Chase, Citi, Edward Jones, Coinbase, TIAA, PNC Wealth Management) were
showing a generic building-icon badge since I didn't have official logo
files yet. You sent those over, so all 20 brokers now show their real
logo in the connect flow, the Brokers page, and anywhere else a broker
badge shows up.

WHAT I DID TO EACH IMAGE
Same treatment as the existing badges (Schwab, Robinhood, Webull,
thinkorswim): cropped tight to the actual logo content, background
removed and made transparent where the source had a plain white
background baked in, sized consistently, and saved as PNGs.

A few brokers' source files combined an icon mark with the company
wordmark (Moomoo, Vanguard, TIAA, PNC) — for those I kept just the
icon/symbol and dropped the wordmark, same call I made earlier for
thinkorswim and Robinhood, since the badge box is small and square and
the broker's name is already shown as text right next to it. A few
others (Interactive Brokers, TradeStation, Coinbase) have their brand
color/background baked into the icon itself (e.g. IB's red mark on
black, Coinbase's blue square) — those were left as their real icon
looks, not stripped to transparent, since the background is part of
the mark.

Edward Jones and Citi don't have a separate icon apart from their
wordmark, so those show the full wordmark, cropped tight — same as how
"Charles Schwab" already renders in its badge.

FILES
- public/broker-logos/*.png — 16 new logo files
- src/components/brokers/BrokerLogo.tsx — registered each new file
- src/data/brokerRegistry.ts — flipped hasLogo: false → true for
  these 16, for documentation/consistency (doesn't change behavior,
  BrokerLogo.tsx's own LOGOS record is what actually renders it)

HOW TO APPLY
1. GitHub Desktop, branch fix/calendar-keys-and-lint.
2. Drag the src/ and public/ folders from this zip into your repo
   root. public/broker-logos/ will show 16 new files; the 2 .tsx/.ts
   files overwrite existing ones.
3. Should show as 18 changed files (16 added, 2 modified). Commit and
   push.

VERIFIED
- Rendered all 20 broker badges together in a grid and screenshotted
  it — every one now shows a real, legible logo in the same fixed-size
  box, nothing stretched, cropped off, or showing the placeholder icon
  anymore.
- npx tsc -b --force: 0 errors
- npm run lint: 0 errors, same 19 warnings as the last delivery — no
  new ones.
- git status shows exactly these 18 files changed, nothing else.

ONE NOTE
Trend Chasers isn't affiliated with or endorsed by any of these
brokers — the badges are just there to show which ones you can
connect, same disclaimer that already applies to the first 4.
