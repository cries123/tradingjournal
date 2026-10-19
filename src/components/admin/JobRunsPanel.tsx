import { Clock } from 'lucide-react';
import { jobState, type JobRun, type JobSpec, type JobState } from '../../utils/jobSchedule';
import { formatDuration, relativeTime } from '../../utils/relativeTime';

/**
 * The six scheduled jobs: when each last ran, how long it took, what it did.
 *
 * Until this, a job that Netlify silently stopped running was invisible until a customer asked
 * why their trades had not arrived. "Late" is judged against each job's own allowance
 * (src/utils/jobSchedule.ts), and "never" is said plainly, because until the first run after this
 * ships every job reads that way.
 */

const STATE: Record<JobState, { label: string; dot: string; text: string }> = {
  ok: { label: 'Ran', dot: 'bg-accent', text: 'text-text-secondary' },
  late: { label: 'Late', dot: 'bg-amber-400', text: 'text-amber-300' },
  failed: { label: 'Failed', dot: 'bg-red-400', text: 'text-red-400' },
  never: { label: 'No run recorded yet', dot: 'bg-zinc-500', text: 'text-text-secondary' },
};

/** The first few numbers a summary carries — "ran 12 · imported 340 · failed 0". */
function summaryChips(summary: Record<string, unknown> | null): string[] {
  if (!summary) return [];
  return Object.entries(summary)
    .filter(([, v]) => typeof v === 'number' || typeof v === 'boolean')
    .slice(0, 5)
    .map(([k, v]) => `${k} ${String(v)}`);
}

export function JobRunsPanel({ jobs, now }: { jobs: { spec: JobSpec; last: JobRun | null }[]; now: number }) {
  const lateOrFailed = jobs.filter((j) => ['late', 'failed'].includes(jobState(j.spec, j.last, now))).length;

  return (
    <section className="panel-card rounded-xl p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-accent" />
          <h2 className="text-sm font-semibold text-text-primary">Scheduled jobs</h2>
        </div>
        <p className={`text-xs ${lateOrFailed > 0 ? 'text-amber-300' : 'text-text-secondary'}`}>
          {lateOrFailed > 0 ? `${lateOrFailed} need${lateOrFailed === 1 ? 's' : ''} a look` : 'All on time'}
        </p>
      </div>
      <p className="text-xs text-text-secondary mb-4">
        Six functions run on a timer. Each records its run here; a job past its allowance is late.
      </p>

      <ul className="space-y-2">
        {jobs.map(({ spec, last }) => {
          const state = jobState(spec, last, now);
          const look = STATE[state];
          return (
            <li key={spec.name} className="rounded-lg border border-border/40 bg-bg-tertiary/30 px-3 py-2.5">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="flex items-center gap-2 text-sm font-medium text-text-primary">
                  <span className={`inline-block h-2 w-2 rounded-full ${look.dot}`} aria-hidden />
                  {spec.label}
                </span>
                <span className={`text-xs ${look.text}`}>
                  {last ? `${look.label} ${relativeTime(last.finishedAt, now)} · ${formatDuration(last.durationMs)}` : look.label}
                </span>
                <span className="ml-auto font-mono text-[10px] text-text-secondary">{spec.schedule} UTC</span>
              </div>
              <p className="text-[11px] text-text-secondary mt-1">{spec.purpose}</p>
              {last && summaryChips(last.summary).length > 0 && (
                <p className="mt-1.5 flex flex-wrap gap-1.5">
                  {summaryChips(last.summary).map((chip) => (
                    <span key={chip} className="rounded-md bg-bg-primary/60 px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">
                      {chip}
                    </span>
                  ))}
                </p>
              )}
              {last?.error && <p className="mt-1.5 text-[11px] text-red-400 break-words">{last.error}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
