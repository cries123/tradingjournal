Fix: connected Schwab account not showing up
==============================================

WHAT WAS WRONG
----------------
This one file had a bug: to check whether you already had a connected
Schwab account, it looked for the word "Charles" inside the account
name SnapTrade sent back. But SnapTrade actually calls Schwab accounts
just "Schwab" (not "Charles Schwab") — so even though your connection
to Schwab really did succeed on SnapTrade's side, this page could never
recognize it, and kept showing "Connect Charles" as if nothing were
linked. Robinhood wasn't affected — its match word was just "Robinhood",
which was already correct.

THE FIX
---------
Changed the match word for Schwab from "Charles" to "Schwab". That's the
whole change — one file, src/components/brokers/BrokerConnectContent.tsx.

HOW TO APPLY (GitHub Desktop)
---------------------------------
Drag this file into src/components/brokers/ in your local repo folder,
overwrite when prompted, then Changes tab → commit message → Commit →
Push origin.

AFTER APPLYING
-----------------
Once this is live, go back to Connect broker in the app and click
Refresh connections — your already-connected Schwab account should now
show up with the Sync trades button.
