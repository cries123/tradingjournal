import type { Trade } from '../src/types';
import { tierHas, type Tier } from '../src/config/tiers';

/**
 * The automatic morning import — Diamond's reason to exist.
 *
 * Every other difference between Gold and Diamond is a bigger number, and two of those numbers do
 * not mean much: broker connections cost nothing to give away (SnapTrade bills per person), and a
 * sync allowance buys impatience rather than freshness, because the daily refresh behind it is
 * already paid for. This is the one that changes what the product does — the journal is up to date
 * before the trader opens it, and there is no button.
 *
 * The decision logic lives here, apart from the Netlify function, for the same reason the reaper's
 * does: what this job is about to do to somebody's journal should be testable without Firestore,
 * SnapTrade, or a clock.
 *
 * Two invariants everything below is arranged around:
 *
 *   Never import a trade twice. Dedupe runs against what is already in the journal, using the
 *   same pure function the manual sync uses, so an automatic import can never disagree with a
 *   manual one about what "already imported" means.
 *
 *   Never spend a user's allowance. The pull costs the same as a manual sync and is recorded as
 *   such for the cost report, but it must not eat a sync the trader was saving — see
 *   recordAutomatic in usage.ts.
 */

/** Users touched in one run. A scheduled function has a wall-clock budget, and pulls are slow. */
export const MAX_USERS_PER_RUN = 40;

/**
 * How far back each automatic pull asks for.
 *
 * Not the full history. The first import a trader ever does is a manual one that backfills
 * everything; from then on this is topping up, so the window only has to cover the gap since the
 * last run plus a margin for a weekend, a holiday, a failed run, and a brokerage that reports a
 * fill late. Ten days is all four with room to spare, and a narrow window is also a smaller
 * dedupe read.
 */
export const LOOKBACK_DAYS = 10;

const DAY_MS = 86_400_000;

export interface AutoSyncSubject {
  uid: string;
  /** Market day (YYYY-MM-DD) of the last automatic import, or null if it has never run. */
  lastRunDate: string | null;
}

export type SkipReason = 'not-entitled' | 'switched-off' | 'already-ran' | 'no-connection';

export type AutoSyncDecision = { run: true } | { run: false; reason: SkipReason };

/**
 * Whether this account gets an automatic import right now.
 *
 * Entitlement is checked against the effective tier the caller resolves, not the billing tier, so
 * a complimentary Diamond grant works exactly like a purchased one — an admin who hands somebody
 * the top plan should not have to explain why the headline feature is missing.
 */
export function decideAutoSync(input: {
  tier: Tier;
  connected: boolean;
  enabled: boolean;
  lastRunDate: string | null;
  today: string;
}): AutoSyncDecision {
  if (!tierHas(input.tier, 'autoSync')) return { run: false, reason: 'not-entitled' };
  if (!input.connected) return { run: false, reason: 'no-connection' };
  if (!input.enabled) return { run: false, reason: 'switched-off' };
  // A scheduled function can fire more than once — a retry, or a redeploy landing on the boundary.
  // Without this a double fire is a doubled SnapTrade bill for a run that imports nothing.
  if (input.lastRunDate === input.today) return { run: false, reason: 'already-ran' };
  return { run: true };
}

/** The first day an automatic pull asks the broker about. */
export function lookbackStart(today: string, days = LOOKBACK_DAYS): string {
  const at = Date.parse(`${today.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(at)) return today;
  return new Date(at - days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Which journal automatically imported trades belong in.
 *
 * The journal the trader last imported broker trades into, not whichever one happens to be open.
 * A manual sync uses the active journal because a person chose it a second ago; a job running at
 * six in the morning has no such signal, and someone who left a paper-trading journal selected
 * would find real fills in it. Falling back to the active journal keeps the very first automatic
 * import — before there is any history to read — behaving like the manual one it follows.
 */
export function journalForImports(existing: Trade[], activeAccountId: string): string {
  let best: Trade | null = null;
  for (const trade of existing) {
    if (!trade.sourceId || !trade.accountId) continue;
    if (!best || trade.date > best.date) best = trade;
  }
  return best?.accountId ?? activeAccountId;
}

export interface AutoSyncOutcome {
  uid: string;
  imported: number;
  accounts: number;
  /** Set when the pull or the write failed; the run continues with the next user regardless. */
  error?: string;
}

export interface AutoSyncSummary {
  considered: number;
  ran: number;
  imported: number;
  skipped: Record<SkipReason, number>;
  failed: number;
  outcomes: AutoSyncOutcome[];
}

export interface AutoSyncDeps {
  today: string;
  /** Everyone the broker mirror believes still has a live connection. */
  listConnected: () => Promise<AutoSyncSubject[]>;
  /** The tier that actually applies, complimentary access included. */
  resolveTier: (uid: string) => Promise<Tier>;
  /** The user's own switch, and where a manual sync would have put the trades. */
  readPreferences: (uid: string) => Promise<{ enabled: boolean; activeAccountId: string }>;
  /** Pulls, maps and dedupes for one user; returns how many were written. */
  importFor: (uid: string, activeAccountId: string) => Promise<{ imported: number; accounts: number }>;
  /** Stamps the run so a second firing today does nothing. */
  markRun: (uid: string, day: string, imported: number) => Promise<void>;
  maxUsers?: number;
  /** Decide and log without pulling anything — for looking before leaping. */
  dryRun?: boolean;
}

const NO_SKIPS: Record<SkipReason, number> = {
  'not-entitled': 0,
  'switched-off': 0,
  'already-ran': 0,
  'no-connection': 0,
};

/**
 * One pass over everybody with a live broker link.
 *
 * A failure for one account is recorded and stepped over. The alternative — letting it throw —
 * means one person's revoked brokerage credential silently stops the morning import for everybody
 * after them in the list, and nobody finds out for a week.
 */
export async function runAutoSync(deps: AutoSyncDeps): Promise<AutoSyncSummary> {
  const summary: AutoSyncSummary = {
    considered: 0,
    ran: 0,
    imported: 0,
    skipped: { ...NO_SKIPS },
    failed: 0,
    outcomes: [],
  };

  const subjects = await deps.listConnected();
  const limit = deps.maxUsers ?? MAX_USERS_PER_RUN;

  for (const subject of subjects) {
    if (summary.ran >= limit) break;
    summary.considered += 1;

    let tier: Tier;
    let prefs: { enabled: boolean; activeAccountId: string };
    try {
      tier = await deps.resolveTier(subject.uid);
      prefs = await deps.readPreferences(subject.uid);
    } catch (err) {
      summary.failed += 1;
      summary.outcomes.push({
        uid: subject.uid,
        imported: 0,
        accounts: 0,
        error: err instanceof Error ? err.message : 'could not read the account',
      });
      continue;
    }

    const decision = decideAutoSync({
      tier,
      connected: true,
      enabled: prefs.enabled,
      lastRunDate: subject.lastRunDate,
      today: deps.today,
    });

    if (!decision.run) {
      summary.skipped[decision.reason] += 1;
      continue;
    }

    if (deps.dryRun) {
      summary.ran += 1;
      summary.outcomes.push({ uid: subject.uid, imported: 0, accounts: 0 });
      continue;
    }

    try {
      const result = await deps.importFor(subject.uid, prefs.activeAccountId);
      summary.ran += 1;
      summary.imported += result.imported;
      summary.outcomes.push({ uid: subject.uid, ...result });
      // Stamped after the import, so a crash mid-pull leaves the day open to retry rather than
      // marking it done and skipping the trader until tomorrow.
      await deps.markRun(subject.uid, deps.today, result.imported);
    } catch (err) {
      summary.failed += 1;
      summary.outcomes.push({
        uid: subject.uid,
        imported: 0,
        accounts: 0,
        error: err instanceof Error ? err.message : 'import failed',
      });
    }
  }

  return summary;
}
