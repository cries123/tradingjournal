import type { Handler, HandlerEvent, HandlerContext, HandlerResponse } from '@netlify/functions';
import { getAdminFirestore } from './firebaseAdmin';
import { JOBS, type JobName, type JobRun } from '../src/utils/jobSchedule';

/**
 * A record of every scheduled run, so the admin panel can say when each job last ran and how it
 * went. See src/utils/jobSchedule.ts for why.
 *
 * `jobRuns/{job}` holds the latest run, which is what the panel reads — six documents, one each.
 * `jobRuns/{job}/history/{auto}` keeps the recent ones behind it. Never throws: a failure to write
 * the record must not fail the job it describes.
 */
export const JOB_RUNS = 'jobRuns';
const HISTORY_KEPT = 30;
/** A summary is a few counts. Anything bigger is a payload, and belongs in the function log. */
const MAX_SUMMARY_CHARS = 4_000;

function summaryOf(body: string | undefined): Record<string, unknown> | null {
  if (!body) return null;
  try {
    const parsed = JSON.parse(body.slice(0, MAX_SUMMARY_CHARS)) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function recordJobRun(run: JobRun): Promise<void> {
  try {
    const db = getAdminFirestore();
    const latest = db.doc(`${JOB_RUNS}/${run.job}`);
    const batch = db.batch();
    batch.set(latest, run);
    batch.set(latest.collection('history').doc(), run);
    await batch.commit();
    // Trim the history, best effort and outside the batch so a trim failure costs nothing.
    const old = await latest.collection('history').orderBy('startedAt', 'desc').offset(HISTORY_KEPT).get();
    if (!old.empty) {
      const trim = db.batch();
      for (const doc of old.docs) trim.delete(doc.ref);
      await trim.commit();
    }
  } catch (err) {
    console.error(`[job-runs] could not record the ${run.job} run:`, err);
  }
}

/** The latest run of every job, in the table's order. Null where a job has never recorded one. */
export async function readLatestJobRuns(): Promise<(JobRun | null)[]> {
  const db = getAdminFirestore();
  const snaps = await Promise.all(JOBS.map((job) => db.doc(`${JOB_RUNS}/${job.name}`).get()));
  return snaps.map((snap) => (snap.exists ? (snap.data() as JobRun) : null));
}

/**
 * Wraps a scheduled handler so each run is recorded: when it started, how long it took, whether
 * it answered 2xx, and the summary it returned. A handler that throws is recorded as failed and
 * the error is rethrown, so Netlify's own log still shows it.
 */
export function recordedJob(job: JobName, handler: Handler): Handler {
  return async (event: HandlerEvent, context: HandlerContext): Promise<HandlerResponse> => {
    const startedAt = new Date();
    try {
      // A handler that returns nothing answered 200 with no body, as far as Netlify is concerned.
      const result: HandlerResponse = (await handler(event, context)) ?? { statusCode: 200 };
      const finishedAt = new Date();
      const ok = result.statusCode < 400;
      await recordJobRun({
        job,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        ok,
        summary: summaryOf(result.body),
        error: ok ? null : `HTTP ${result.statusCode}: ${(result.body ?? '').slice(0, 300)}`,
      });
      return result;
    } catch (err) {
      const finishedAt = new Date();
      await recordJobRun({
        job,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        ok: false,
        summary: null,
        error: err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300),
      });
      throw err;
    }
  };
}
