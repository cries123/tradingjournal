import { useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronRight, EyeOff, RotateCcw } from 'lucide-react';
import type { ErrorEvent, ErrorStatus } from '../../services/errorEvents';

interface ErrorEventsPanelProps {
  events: ErrorEvent[];
  droppedToday: number;
  busyId: string | null;
  onStatusChange: (id: string, status: ErrorStatus) => void;
}

/**
 * What is currently broken in production, grouped.
 *
 * The list is ordered by when each bug last happened rather than by how often, because "still
 * happening" is the question this answers. A crash that fired 4,000 times last Tuesday and stopped
 * is history; one that fired twice in the last ten minutes is the one to look at.
 */
const KIND_LABELS: Record<string, string> = {
  render: 'Render crash',
  window: 'Uncaught',
  promise: 'Unhandled promise',
  server: 'Server',
};

const KIND_CLASSES: Record<string, string> = {
  render: 'bg-red-500/15 text-red-400',
  window: 'bg-amber-500/15 text-amber-400',
  promise: 'bg-amber-500/15 text-amber-400',
  server: 'bg-violet-500/15 text-violet-400',
};

function relativeTime(iso: string): string {
  if (!iso) return 'unknown';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'unknown';

  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Chrome/Firefox/Safari all announce themselves differently; this pulls out the part worth reading. */
function shortUserAgent(ua: string): string {
  if (!ua || ua === 'server') return '';
  const browser =
    /Edg\/[\d.]+/.exec(ua)?.[0].replace('Edg/', 'Edge ') ??
    /Firefox\/[\d.]+/.exec(ua)?.[0].replace('/', ' ') ??
    /Chrome\/([\d.]+)/.exec(ua)?.[0].replace('/', ' ') ??
    /Version\/([\d.]+).*Safari/.exec(ua)?.[1] ??
    '';
  const platform = /(iPhone|iPad|Android|Windows|Macintosh|Linux)/.exec(ua)?.[1] ?? '';
  return [browser, platform].filter(Boolean).join(' · ');
}

function ErrorRow({
  event,
  busy,
  onStatusChange,
}: {
  event: ErrorEvent;
  busy: boolean;
  onStatusChange: (id: string, status: ErrorStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const dimmed = event.status !== 'open';

  return (
    <article
      className={`glass-card rounded-xl overflow-hidden transition-opacity ${dimmed ? 'opacity-55' : ''}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full text-left p-4 md:p-5 focus-ring"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-text-secondary shrink-0">
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span
                className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                  KIND_CLASSES[event.kind] ?? 'bg-bg-tertiary text-text-secondary'
                }`}
              >
                {KIND_LABELS[event.kind] ?? event.kind}
              </span>
              {event.scope && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg-tertiary/70 text-text-secondary">
                  {event.scope}
                </span>
              )}
              {event.status !== 'open' && (
                <span className="text-[10px] uppercase tracking-wide text-text-secondary">
                  {event.status}
                </span>
              )}
            </div>

            <p className="text-sm font-medium break-words leading-snug">
              {event.name}: {event.message}
            </p>

            <p className="text-xs text-text-secondary mt-1.5">
              <span className="tabular-nums font-semibold text-text-primary">{event.count}</span>
              {event.count === 1 ? ' time' : ' times'}
              {event.affectedUserCount > 0 && ` · ${event.affectedUserCount} signed-in user${event.affectedUserCount === 1 ? '' : 's'}`}
              {' · last '}
              {relativeTime(event.lastSeenAt)}
              {event.lastPath && ` · ${event.lastPath}`}
            </p>
          </div>
        </div>
      </button>

      {open && (
        <div className="px-4 md:px-5 pb-4 md:pb-5 -mt-1">
          <div className="pl-7 space-y-3">
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <dt className="text-text-secondary">First seen</dt>
                <dd className="font-medium">{relativeTime(event.firstSeenAt)}</dd>
              </div>
              <div>
                <dt className="text-text-secondary">Build</dt>
                <dd className="font-mono">{event.lastRelease}</dd>
              </div>
              <div>
                <dt className="text-text-secondary">Browser</dt>
                <dd className="font-medium">{shortUserAgent(event.lastUserAgent) || '—'}</dd>
              </div>
              <div>
                <dt className="text-text-secondary">Fingerprint</dt>
                <dd className="font-mono">{event.fingerprint.slice(0, 8)}</dd>
              </div>
            </dl>

            {event.stack && (
              <pre className="text-[11px] leading-relaxed font-mono bg-bg-tertiary/50 rounded-lg p-3 overflow-x-auto max-h-64 whitespace-pre">
                {event.stack}
              </pre>
            )}

            {event.affectedUids.length > 0 && (
              <p className="text-xs text-text-secondary break-all">
                <span className="font-medium text-text-primary">Affected uids: </span>
                {event.affectedUids.join(', ')}
              </p>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              {event.status !== 'resolved' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onStatusChange(event.id, 'resolved')}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors disabled:opacity-50 focus-ring"
                >
                  <Check size={13} /> Mark fixed
                </button>
              )}
              {event.status !== 'ignored' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onStatusChange(event.id, 'ignored')}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-bg-tertiary text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50 focus-ring"
                >
                  <EyeOff size={13} /> Ignore
                </button>
              )}
              {event.status !== 'open' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onStatusChange(event.id, 'open')}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-bg-tertiary text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50 focus-ring"
                >
                  <RotateCcw size={13} /> Reopen
                </button>
              )}
            </div>

            <p className="text-[11px] text-text-secondary">
              Marking one fixed is not permanent — if it happens again it reopens itself.
            </p>
          </div>
        </div>
      )}
    </article>
  );
}

export function ErrorEventsPanel({
  events,
  droppedToday,
  busyId,
  onStatusChange,
}: ErrorEventsPanelProps) {
  const [showHandled, setShowHandled] = useState(false);

  const open = events.filter((e) => e.status === 'open');
  const handled = events.filter((e) => e.status !== 'open');
  const visible = showHandled ? events : open;

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h2 className="text-base font-semibold">Production errors</h2>
        {handled.length > 0 && (
          <button
            type="button"
            onClick={() => setShowHandled((v) => !v)}
            className="text-xs text-text-secondary hover:text-text-primary transition-colors focus-ring rounded px-2 py-1"
          >
            {showHandled ? 'Hide' : 'Show'} {handled.length} fixed/ignored
          </button>
        )}
      </div>
      <p className="text-xs text-text-secondary mb-4">
        Crashes and failed requests reported by real sessions, grouped so one bug is one row.
      </p>

      {droppedToday > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 mb-4 text-xs text-amber-300">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          <p>
            <span className="font-semibold tabular-nums">{droppedToday}</span> report
            {droppedToday === 1 ? '' : 's'} were dropped today after the daily cap was reached. The
            counts below are lower than what actually happened.
          </p>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="glass-card rounded-xl p-8 text-center text-text-secondary text-sm">
          {events.length === 0
            ? 'No errors reported. This is what it should say.'
            : 'Nothing open — everything reported has been fixed or ignored.'}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((event) => (
            <ErrorRow
              key={event.id}
              event={event}
              busy={busyId === event.id}
              onStatusChange={onStatusChange}
            />
          ))}
        </div>
      )}
    </section>
  );
}
