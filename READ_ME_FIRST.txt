How to use this folder with GitHub Desktop
===========================================

1. In GitHub Desktop, make sure your "tradingjournal" repo is cloned
   and open (File > Add local repository, or File > Clone repository
   if you don't have it yet).

2. In GitHub Desktop, go to Repository > Show in Explorer/Finder to
   open the repo's folder on your computer.

3. Unzip this file. Drag every file and folder from inside the
   unzipped folder into that repo folder, letting it overwrite the
   matching files (Finder/Explorer will ask "Replace?" — say yes).
   One file, src/hooks/useEscapeToClose.ts, is brand new and will
   just be added.

4. Switch back to GitHub Desktop. It will now list every changed
   file under "Changes" on the left.

5. (Recommended) Click the current branch name at the top and choose
   "New branch" — name it fix/calendar-keys-and-lint — so this lands
   on its own branch instead of directly on main.

6. Write a commit summary, e.g. "Fix audit findings, mobile polish,
   SEO structured data", and click "Commit to fix/calendar-keys-and-lint".

7. Click "Publish branch" (or "Push origin" if the branch already
   exists on GitHub).

8. On GitHub.com you'll see a banner to open a pull request into
   main — open it, review the diff, and merge when ready.
