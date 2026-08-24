EVERYTHING SINCE 4:38PM
=========================

firestore.rules + 29 code files, apply all of them together (this is
a linked set — many of these files import from the new ones, so a
partial apply will break the build). This is one combined zip of
everything from the four separate deliveries since then, so you don't
have to track down and re-merge earlier zips — this replaces all of
them.

IMPORTANT — TWO SEPARATE DEPLOY STEPS THIS TIME
This set touches firestore.rules (new Help Center articles
collection), which is NOT part of your normal Netlify deploy. You
need to do both of the following, in either order:

  A) The usual app deploy — commit + push these files like normal,
     Netlify builds and deploys the site.

  B) A SEPARATE Firestore rules deploy — from your local repo folder,
     with the Firebase CLI installed and logged in:

         firebase deploy --only firestore:rules

If you skip step B, the app builds and deploys fine, but the Help
Center will silently fail to load or save articles with a
"permission denied" error, because the security rules that allow it
won't exist yet on the live database.

WHAT'S IN HERE, IN ORDER

1. Broker badges — all four broker badges (thinkorswim, Schwab,
   Robinhood, Webull) are now the same fixed size, with each logo
   zoomed to fill it. Schwab and Webull's source images were cropped
   to remove baked-in empty space around the logo.

2. New nav logo — swapped in your new 3D compass/arrow render,
   sized up, then cropped a touch tighter.

3. Header nav redesign — nav links moved next to the logo, CTA
   renamed to "Sign up", a Products dropdown (Journal, Market
   Simulator, AI Assistant, Pricing, What's New), Tutorials, Brokers,
   and Help Center as top-level items. Market Simulator, AI
   Assistant, and Pricing go to a "coming soon" page. What's New is a
   real changelog page (src/data/whatsNew.ts) with the broker sync
   launch as its first entry.

4. Mobile hamburger menu — below the sm breakpoint, a hamburger
   button opens all those nav items in a dropdown panel, since they'd
   previously only been reachable on wider screens.

5. Real Help Center — /help-center is now a proper knowledge base
   with 7 fixed categories (General, Brokers, Dashboard, Journal,
   Settings, Privacy, Support), search, and expandable articles.
   Articles are written entirely from a new "Help Center articles"
   card in the admin panel — only your admin account can create,
   edit, publish/unpublish, or delete them.

6. Mobile header + search bar fixes — the logo/hamburger/Sign up
   row was overflowing off the right edge on phones; now sits with
   even padding on both sides. The Help Center search box's
   placeholder text was running into the magnifying glass icon
   (same latent bug also existed in the admin Users search box,
   fixed both).

HOW TO APPLY
1. GitHub Desktop, branch fix/calendar-keys-and-lint.
2. Drag the firestore.rules file and the public/ and src/ folders
   from this zip into your repo root, overwriting the matching files.
   8 files (ProductsDropdown.tsx, MobileNavPanel.tsx,
   AdminHelpArticleModal.tsx, HelpCenterPage.tsx, ComingSoonPage.tsx,
   WhatsNewPage.tsx, whatsNew.ts, adminHelpArticles.ts) will show up
   as new files, not overwrites.
3. Should show as 30 changed files (22 modified, 8 added). Commit
   and push.
4. Run the firestore rules deploy command above (step B).

VERIFIED
- npx tsc -b --force: 0 errors
- npm run lint: 0 errors, same 18 pre-existing warnings as before
  all of this work — no new ones introduced across any of it
