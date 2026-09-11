/**
 * Account rules the client shows and the server enforces.
 *
 * Same reason tiers.ts exists: this number is written into the copy on the account screen and
 * checked again in the Netlify function that performs the rename. Written down once, the sentence
 * the user reads and the rule that refuses them cannot drift apart.
 */

/**
 * How long between username changes.
 *
 * Thirty days is long enough that a handle somebody saw last week still resolves to the same
 * person, and short enough to fix a name typed wrong at signup. It exists because the old handle
 * is never released — without a limit, "reserved forever" becomes a way to hoard names one at a
 * time.
 */
export const RENAME_COOLDOWN_DAYS = 30;
