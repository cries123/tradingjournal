import type { SyncOutcome } from '../src/utils/journalEvents';

/**
 * Whether this morning's automatic import did its job, judged from what it left behind.
 *
 * The run itself can complete with every account failing — it steps over failures on purpose, so
 * one revoked credential cannot stop everybody else's import — which means "the function ran"
 * says nothing. What says something is the history each account's pull writes: a row per account
 * per morning, with how many activities came back and how many trades were new. This reads those
 * rows for everyone the broker mirror believes is connected and names what is wrong, if anything,
 * so the owner hears about a dead morning at breakfast rather than from a cancellation.
 *
 * Pure: the function in netlify/functions/sync-health.ts gathers the rows, this decides.
 */

export interface ConnectedAccount {
  uid: string;
  /** The day the morning import last completed for this user, from the broker mirror. */
  autoSyncRanOn: string | null;
  /** This user's automatic sync rows from today, one per brokerage account. */
  today: SyncOutcome[];
}

export interface SyncHealth {
  /** True when nothing needs the owner's attention. */
  ok: boolean;
  /** Each problem in one sentence, worst first. */
  problems: string[];
  /** What happened, in the numbers the problems are judged from. */
  summary: {
    connected: number;
    ran: number;
    accounts: number;
    activities: number;
    fresh: number;
    truncated: number;
    emptyFeeds: number;
  };
}

export function assessSyncHealth(connected: ConnectedAccount[], today: string): SyncHealth {
  const ran = connected.filter((c) => c.autoSyncRanOn === today);
  const rows = ran.flatMap((c) => c.today);
  const summary = {
    connected: connected.length,
    ran: ran.length,
    accounts: rows.length,
    activities: rows.reduce((n, r) => n + r.activityCount, 0),
    fresh: rows.reduce((n, r) => n + (r.fresh ?? 0), 0),
    // `truncated` is what rows older than the resumable pull wrote; `partial` is what they write now.
    truncated: rows.filter((r) => r.truncated || r.partial).length,
    emptyFeeds: rows.filter((r) => r.activityCount === 0).length,
  };

  const problems: string[] = [];

  if (connected.length > 0 && ran.length === 0) {
    problems.push(
      `The morning import did not complete for anyone: ${connected.length} connected ${
        connected.length === 1 ? 'account has' : 'accounts have'
      } no run stamped for ${today}. Either the job did not fire, or every pull failed — the Errors tab has the reasons if it ran.`,
    );
  }

  if (ran.length > 0 && rows.length === 0) {
    problems.push(
      `${ran.length} ${ran.length === 1 ? 'user' : 'users'} ran but wrote no sync history — the pull returned before reaching any brokerage account.`,
    );
  }

  // Every feed empty at once is SnapTrade, or the app's keys — not twenty traders all taking the
  // same day off.
  if (rows.length >= 2 && summary.emptyFeeds === rows.length) {
    problems.push(
      `All ${rows.length} brokerage accounts returned no activity at all. One quiet account is a quiet trader; every one at once is SnapTrade or our credentials.`,
    );
  }

  if (summary.truncated > 0) {
    problems.push(
      `${summary.truncated} ${summary.truncated === 1 ? 'account' : 'accounts'} hit the page cap, so the newest days of the window were not read; each row has the day the next sync, automatic or manual, continues from.`,
    );
  }

  return { ok: problems.length === 0, problems, summary };
}

/** The email, as plain paragraphs — the mailer's admin template lays it out. */
export function syncHealthMessage(health: SyncHealth, today: string): { subject: string; message: string } {
  const s = health.summary;
  const numbers =
    `Today (${today}): ${s.ran} of ${s.connected} connected users ran, across ${s.accounts} brokerage ` +
    `${s.accounts === 1 ? 'account' : 'accounts'}; ${s.activities} activities came back and ${s.fresh} ` +
    `${s.fresh === 1 ? 'trade was' : 'trades were'} new.`;

  if (health.ok) {
    return { subject: `Morning import ran: ${s.fresh} new trades`, message: numbers };
  }

  return {
    subject: `Morning import needs a look — ${health.problems.length === 1 ? '1 problem' : `${health.problems.length} problems`}`,
    message: [...health.problems, numbers, 'Each user’s rows are under their account in the admin panel; the Errors tab has any failures.'].join('\n\n'),
  };
}
