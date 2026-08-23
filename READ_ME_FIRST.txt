ADMIN PANEL UPGRADE
====================

10 files, apply all of them together (this is a linked set — some of
these files import from the new ones, so a partial apply will break
the build).

WHAT'S NEW

1. Priority on bug reports & broker requests
   Each one now has a Low/Medium/High priority pill next to its status
   badge — click it to change it. Within whatever status filter you have
   selected, the list sorts High priority first automatically.

2. Internal admin notes + a flag, per user account
   Open any user in the Users list and there's a new "Internal notes
   (admin only)" section at the bottom — a free-text note plus a
   "Flag for review" toggle. This is stored completely separately from
   that user's own profile document, so it's never visible to them,
   only to you. Flagged accounts show a small red "Flagged" badge
   in the user list.

3. Recent admin activity (audit log)
   A new card logs every admin action automatically — status changes,
   priority changes, note saves, email/password changes, password
   reset emails sent, account deletions, flags. It's append-only
   (nothing can edit or delete an entry, including you, by design) so
   it stays a trustworthy record if you ever need to check "did I
   already handle this" or "when did I do that."

4. System health history
   The System health card now also shows a small timeline strip under
   each of the three checks (Broker sync / SPY benchmark / Firebase) —
   a row of green/red bars for the last ~30 times you loaded the admin
   page, plus a rolling uptime %. It fills in over time as you visit
   the panel; the first visit after this update will only show one bar.

5. CSV exports now include the new data
   Bug report and broker request exports have a priority column;
   the users export has flagged + admin_note columns.

6. Removed the public "Admin" link from the landing page footer
   (from your last request — still included in this same set).

IMPORTANT — TWO SEPARATE DEPLOY STEPS THIS TIME
This update touches firestore.rules for the first time in one of these
deliveries, which is NOT part of your normal Netlify deploy. You need
to do both of the following, in either order:

  A) The usual app deploy — commit + push these files like normal,
     Netlify builds and deploys the site.

  B) A SEPARATE Firestore rules deploy — from your local repo folder,
     with the Firebase CLI installed and logged in:

         firebase deploy --only firestore:rules

     If you don't have the Firebase CLI yet: `npm install -g firebase-tools`,
     then `firebase login`, then run the command above from inside your
     tradingjournal folder (it uses the firebase project already
     configured in this repo).

If you skip step B, the app will build and deploy fine, but the three
new features (notes/flags, audit log, health history) will silently
fail every read/write with a Firestore "permission denied" error,
because the security rules that allow YOUR admin account to use them
won't exist yet on the live database.

HOW TO APPLY
1. GitHub Desktop, branch fix/calendar-keys-and-lint.
2. Drag the firestore.rules file and the src/ folder from this zip
   into your repo root, overwriting the 7 matching files. The 3 new
   files (src/services/adminAuditLog.ts, adminShared.ts,
   adminUserNotes.ts) will show up as new files, not overwrites.
3. Should show as 10 changed files (7 modified, 3 added). Commit and
   push.
4. Run the firestore rules deploy command above (step B).

VERIFIED
- npx tsc -b --force: 0 errors
- npm run lint: 0 errors, same 18 pre-existing warnings as before
  this change (no new ones introduced)
I wasn't able to get you screenshots of the live admin panel this
round — Firebase isn't configured in this sandbox, so I can't sign in
and exercise it with real data — but everything above is verified by
type-checking and linting cleanly, and I hand-reviewed every file for
correctness before packaging.
