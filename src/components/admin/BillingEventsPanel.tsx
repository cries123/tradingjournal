import { useState } from 'react';
import { CreditCard, RotateCcw } from 'lucide-react';
import type { BillingEventRecord } from '../../../server/creemEventLog';
import { relativeTime } from '../../utils/relativeTime';
import { AdminUserRef } from './AdminUserRef';

/**
 * Every webhook Creem sent, and what became of it.
 *
 * Creem's events decide who is on what plan. When one did not apply — the panel has a "Missing
 * membership" ticket category because that happens — there was no way to see what Creem sent or
 * what the handler made of it. Each row is one event; Replay runs a stored one through the
 * entitlement logic again, without re-sending any customer email.
 */

const OUTCOME: Record<NonNullable<BillingEventRecord['outcome']> | 'pending', { label: string; cls: string }> = {
  applied: { label: 'Applied', cls: 'bg-accent/15 text-accent' },
  replayed: { label: 'Replayed', cls: 'bg-accent/15 text-accent' },
  skipped: { label: 'Not applied', cls: 'bg-amber-500/15 text-amber-300' },
  ignored: { label: 'Ignored', cls: 'bg-white/10 text-text-secondary' },
  failed: { label: 'Failed', cls: 'bg-red-500/15 text-red-400' },
  pending: { label: 'Received', cls: 'bg-white/10 text-text-secondary' },
};

export function BillingEventsPanel({
  events,
  now,
  labelFor,
  onReplay,
  onOpenUser,
  canOpenUser,
}: {
  events: BillingEventRecord[];
  now: number;
  labelFor: (uid: string) => string;
  /** Resolves to the server's sentence about what the replay did. */
  onReplay: (eventId: string) => Promise<string>;
  onOpenUser?: (uid: string) => void;
  canOpenUser?: (uid: string) => boolean;
}) {
  /** Two steps: the first press arms, the second replays. It changes a customer's plan. */
  const [armed, setArmed] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const replay = async (id: string) => {
    if (armed !== id) {
      setArmed(id);
      return;
    }
    setBusy(id);
    try {
      const message = await onReplay(id);
      setNotes((n) => ({ ...n, [id]: message }));
    } catch (err) {
      setNotes((n) => ({ ...n, [id]: err instanceof Error ? err.message : 'Replay failed' }));
    } finally {
      setBusy(null);
      setArmed(null);
    }
  };

  return (
    <section className="panel-card rounded-xl p-5 md:p-6">
      <div className="flex items-center gap-2 mb-1">
        <CreditCard size={16} className="text-accent" />
        <h2 className="text-sm font-semibold text-text-primary">Billing webhooks</h2>
      </div>
      <p className="text-xs text-text-secondary mb-3">
        What Creem sent and what the app did with it. Replay runs an event through the plan logic again — no
        customer email is re-sent.
      </p>

      {events.length === 0 ? (
        <p className="text-xs text-text-secondary">No events recorded yet. The log starts from the release that added it.</p>
      ) : (
        <ul className="space-y-1.5 max-h-[32rem] overflow-y-auto pr-1">
          {events.map((event) => {
            const outcome = OUTCOME[event.outcome ?? 'pending'];
            const id = event.id ?? '';
            return (
              <li key={id || event.receivedAt} className="rounded-lg border border-border/40 px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                  <span className="tabular-nums text-text-secondary">{relativeTime(event.receivedAt, now)}</span>
                  <span className="font-mono text-text-primary">{event.eventType ?? 'unknown event'}</span>
                  {event.uid && (
                    <AdminUserRef uid={event.uid} onOpen={onOpenUser} canOpen={canOpenUser} className="text-text-primary">
                      {labelFor(event.uid)}
                    </AdminUserRef>
                  )}
                  {event.tier && (
                    <span className="text-text-secondary">
                      {event.tier} · {event.status}{event.trialing ? ' · trial' : ''}
                    </span>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${outcome.cls}`}>{outcome.label}</span>
                  {event.replays > 0 && <span className="text-text-secondary">replayed ×{event.replays}</span>}
                  {event.payload && id && (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void replay(id)}
                      className={`ml-auto inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors focus-ring disabled:opacity-50 ${
                        armed === id ? 'border-accent bg-accent text-black' : 'border-border/60 text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      <RotateCcw size={10} aria-hidden />
                      {busy === id ? 'Replaying…' : armed === id ? 'Confirm replay' : 'Replay'}
                    </button>
                  )}
                </div>
                {event.reason && <p className="mt-1 text-[11px] text-text-secondary break-words">{event.reason}</p>}
                {notes[id] && <p className="mt-1 text-[11px] text-accent">{notes[id]}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
