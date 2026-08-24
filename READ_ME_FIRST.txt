BROKER SYNC: 3 BROKERS -> 20 BROKERS
=======================================

14 files (1 new, 13 modified), apply all of them together — this is
a linked set, several of these import from the new registry file.

WHAT CHANGED
Automatic, one-click sync now covers 20 brokers instead of 4
(thinkorswim, Schwab, Robinhood, Webull). Newly added, all with a
confirmed SnapTrade integration (I checked each one against
SnapTrade's own site before adding it, since a broker not really
in their catalog would mean a broken "Connect" button):

  Fidelity, Interactive Brokers, E*TRADE, Vanguard, tastytrade,
  TradeStation, Tradier, Public, Alpaca, Moomoo, Chase, Citi,
  Edward Jones, Coinbase, TIAA, PNC Wealth Management

Same mechanism as your existing brokers — SnapTrade, read-only,
your credentials never touch Trend Chasers, disconnect anytime.

ONE THING I COULDN'T DO: LOGOS
I don't have official logo image files for these 16 new brokers
(only thinkorswim/Schwab/Robinhood/Webull have real assets on
file). Per what you picked earlier, they show a plain "landmark"
icon + the broker's name for now — same box size and style as the
real logos, just no image. Send me the official logo PNGs
(transparent background, like your existing ones) whenever you
have them and I'll swap them in — it's a one-line change per
broker in src/components/brokers/BrokerLogo.tsx.

WHY IT'S BUILT THIS WAY (in case you want to add more later)
Every broker now lives in ONE place: src/data/brokerRegistry.ts.
It holds each broker's key, display name, logo slug, and the
name-matching rules used to (a) find the broker's real slug in
SnapTrade's catalog on the server, and (b) group a synced account
under the right card on the client. Before this change, that same
information was duplicated by hand across 4 different files, so
adding one broker meant editing all 4 and hoping they stayed in
sync. Now adding a broker is a single new line in that one file —
everything else (the connect page, the badges, the Brokers page,
server-side validation) reads from it automatically.

WHAT ELSE MOVED
- The "Coming soon" list on the Brokers page now shows the 4
  well-known brokers I could NOT confirm a SnapTrade integration
  for (Ally Invest, SoFi Invest, M1 Finance, Firstrade) — the 5
  that used to be there (Interactive Brokers, tastytrade, E*TRADE,
  Fidelity, TradeStation) all moved up into the fully-supported list.
- Updated the copy that mentioned "Schwab or Robinhood" by name in
  a few places — the connect page intro, the in-app and landing-page
  announcement banners, the Brokers page intro, the changelog, and
  the SEO meta descriptions/FAQ — so none of them undersell what's
  now supported.

HOW TO APPLY
1. GitHub Desktop, branch fix/calendar-keys-and-lint.
2. Drag the server/ and src/ folders from this zip into your repo
   root, overwriting the 13 matching files. src/data/brokerRegistry.ts
   will show up as a new file.
3. Should show as 14 changed files (1 added, 13 modified). Commit
   and push.

No firestore.rules changes — broker credentials are stored the same
way regardless of which broker, so nothing there needed to change.
Just a normal app deploy.

A HEADS UP ON LIVE TESTING
I can't test a live broker connection from here — this sandbox has
no SnapTrade API keys configured (same as your production site
needs SNAPTRADE_CLIENT_ID / SNAPTRADE_CONSUMER_KEY set for connect
to work at all). I'm confident in the 16 new brokers because each
one has its own integration page on SnapTrade's site, but I'd
suggest clicking "Connect" on 2-3 of the new ones after this
deploys (Fidelity and one or two others) just to see the real
SnapTrade connection window open cleanly — if any single broker's
name inside SnapTrade's catalog is worded differently than expected,
that one broker's Connect button would need a small tweak to its
matching rule in brokerRegistry.ts, without affecting the rest.

VERIFIED
- Rendered both the connect page (all 19 connect cards) and the
  public Brokers page (all 20 broker entries) in a browser to
  confirm the layout, badges, and copy all look right — including
  the new generic landmark-icon badges.
- npx tsc -b --force: 0 errors
- npm run lint: 0 errors, same 18 pre-existing warnings as before
  this change — no new ones
- git status shows exactly these 14 files changed, nothing else.
