/**
 * The scheduled jobs, what each is for, and when one is late.
 *
 * Six functions run on a timer and none of them used to record that it ran. If Netlify silently
 * stopped one, the morning import simply stopped importing and nothing said so — the first sign
 * would be a customer asking why their trades had not arrived. Each job now writes a run record
 * (server/jobRuns.ts); this table says how often a run is expected, so the admin panel can turn
 * "last ran 3 days ago" into "late".
 *
 * Pure and in src/ because the admin panel renders it and the server writes against it.
 */

export type JobName = 'auto-sync' | 'sync-health' | 'rule-alerts' | 'trial-nudges' | 'reap-broker-links' | 'weekly-recap';

export interface JobSpec {
  name: JobName;
  label: string;
  /** What it does, in a line. */
  purpose: string;
  /** The cron line, for the reader. */
  schedule: string;
  /**
   * The longest gap between runs that is still fine, in hours. Weekday jobs skip the weekend, so
   * their allowance covers Friday to Tuesday with slack for a slow start; the daily ones get a day
   * and a half; the Sunday recap a week and a half.
   */
  expectedWithinHours: number;
}

export const JOBS: JobSpec[] = [
  { name: 'auto-sync', label: 'Morning import', purpose: 'Pulls yesterday’s fills for every connected Diamond account.', schedule: '0 11 * * 2-6', expectedWithinHours: 80 },
  { name: 'sync-health', label: 'Sync health check', purpose: 'Reads the morning import’s rows and emails the owner when something is wrong.', schedule: '0 13 * * 2-6', expectedWithinHours: 80 },
  { name: 'rule-alerts', label: 'Rule alerts', purpose: 'Emails Diamond traders who broke one of their own rules yesterday.', schedule: '0 12 * * 2-6', expectedWithinHours: 80 },
  { name: 'trial-nudges', label: 'Trial emails', purpose: 'The three trial emails, keyed on when each trial ends.', schedule: '0 15 * * *', expectedWithinHours: 36 },
  { name: 'reap-broker-links', label: 'Broker link reaper', purpose: 'Removes broker links from accounts whose plan lapsed, after a grace period.', schedule: '0 9 * * *', expectedWithinHours: 36 },
  { name: 'weekly-recap', label: 'Weekly recap', purpose: 'The Sunday recap email, for everyone who opted in.', schedule: '0 14 * * 0', expectedWithinHours: 24 * 7 + 36 },
];

export interface JobRun {
  job: JobName;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  ok: boolean;
  /** The function's own summary of what it did, as it returned it. */
  summary: Record<string, unknown> | null;
  error: string | null;
}

export type JobState = 'ok' | 'failed' | 'late' | 'never';

/**
 * How a job is doing, from its last run and the clock.
 *
 * A failed last run is "failed" whatever the clock says; a run that is older than the job's
 * allowance is "late"; no run at all is "never" — which, until the first run after this ships,
 * is every job, and is said plainly rather than shown as a problem.
 */
export function jobState(spec: JobSpec, last: JobRun | null, now: number): JobState {
  if (!last) return 'never';
  if (!last.ok) return 'failed';
  const finished = Date.parse(last.finishedAt);
  if (!Number.isFinite(finished)) return 'late';
  return now - finished > spec.expectedWithinHours * 3_600_000 ? 'late' : 'ok';
}

export function jobSpec(name: string): JobSpec | undefined {
  return JOBS.find((j) => j.name === name);
}
