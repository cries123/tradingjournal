import { useEffect, useState } from 'react';
import { AlertTriangle, Check, CircleCheck, CircleSlash, Loader2 } from 'lucide-react';
import { BROKER_REGISTRY } from '../../data/brokerRegistry';
import {
  resolveBrokerStatus,
  type BrokerStatusKind,
  type BrokerStatusOverrides,
} from '../../data/brokerStatusOverrides';
import { setBrokerStatus, subscribeToBrokerStatus } from '../../services/brokerStatus';

interface BrokerStatusPanelProps {
  adminUid: string;
}

const KINDS: { id: BrokerStatusKind; label: string; hint: string }[] = [
  { id: 'ok', label: 'Working', hint: 'Connectable, no notice shown.' },
  { id: 'degraded', label: 'Degraded', hint: 'Notice shown, but people can still try.' },
  { id: 'down', label: 'Down', hint: 'Connect blocked, here and on the server.' },
];

/**
 * Turn a broker off, or back on, without a deploy.
 *
 * Schwab's outage notice used to be a hardcoded block in the registry, so every flip meant a code
 * change and a paid Netlify build — and testing whether a broker had recovered meant shipping a
 * release to find out. The registry still holds the defaults; this writes an override that beats
 * them in both directions, including switching a broker the registry declares broken back on.
 *
 * 'Down' is enforced by the connect endpoint too, not just hidden in the UI, so a stale tab cannot
 * start a connection that is certain to fail.
 */
export function BrokerStatusPanel({ adminUid }: BrokerStatusPanelProps) {
  const [overrides, setOverrides] = useState<BrokerStatusOverrides>({});
  const [drafts, setDrafts] = useState<Record<string, { kind: BrokerStatusKind; message: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeToBrokerStatus(setOverrides), []);

  const draftFor = (key: string) => {
    const entry = BROKER_REGISTRY.find((b) => b.key === key)!;
    const live = resolveBrokerStatus(entry, overrides);
    return (
      drafts[key] ?? {
        kind: (live?.kind ?? 'ok') as BrokerStatusKind,
        message: live?.message ?? '',
      }
    );
  };

  const save = async (key: string) => {
    const draft = draftFor(key);
    if (draft.kind !== 'ok' && !draft.message.trim()) {
      setError('Give a reason — it is shown to users verbatim.');
      return;
    }

    setSaving(key);
    setError(null);
    try {
      await setBrokerStatus(key, draft, adminUid);
      setDrafts((d) => {
        const next = { ...d };
        delete next[key];
        return next;
      });
      setSaved(key);
      window.setTimeout(() => setSaved((s) => (s === key ? null : s)), 2500);
    } catch {
      setError('Could not save. Check that the rules allow an admin write to config/brokerStatus.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <section>
      <h2 className="text-base font-semibold mb-1">Broker availability</h2>
      <p className="text-xs text-text-secondary mb-4">
        Takes effect immediately, for everyone, with no deploy. &ldquo;Down&rdquo; blocks the
        connect button and is enforced by the server as well.
      </p>

      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 mb-4 text-xs text-red-300">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      <div className="space-y-3">
        {BROKER_REGISTRY.map((entry) => {
          const draft = draftFor(entry.key);
          const live = resolveBrokerStatus(entry, overrides);
          const dirty = Boolean(drafts[entry.key]);
          const overridden = Boolean(overrides[entry.key]);

          return (
            <article key={entry.key} className="glass-card rounded-xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  {live?.kind === 'down' ? (
                    <CircleSlash size={15} className="text-red-400" />
                  ) : live?.kind === 'degraded' ? (
                    <AlertTriangle size={15} className="text-amber-400" />
                  ) : (
                    <CircleCheck size={15} className="text-emerald-400" />
                  )}
                  <p className="text-sm font-semibold">{entry.name}</p>
                  {overridden && (
                    <span className="text-[10px] uppercase tracking-wide text-text-secondary">
                      overridden
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 rounded-lg bg-bg-tertiary/60 p-0.5">
                  {KINDS.map((k) => (
                    <button
                      key={k.id}
                      type="button"
                      title={k.hint}
                      aria-pressed={draft.kind === k.id}
                      onClick={() =>
                        setDrafts((d) => ({ ...d, [entry.key]: { ...draft, kind: k.id } }))
                      }
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors focus-ring ${
                        draft.kind === k.id
                          ? k.id === 'down'
                            ? 'bg-red-500/20 text-red-300'
                            : k.id === 'degraded'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-emerald-500/20 text-emerald-300'
                          : 'text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
              </div>

              {draft.kind !== 'ok' && (
                <label className="block mb-3">
                  <span className="text-xs text-text-secondary mb-1 block">
                    Reason — shown to users word for word
                  </span>
                  <textarea
                    value={draft.message}
                    onChange={(e) =>
                      setDrafts((d) => ({
                        ...d,
                        [entry.key]: { ...draft, message: e.target.value.slice(0, 500) },
                      }))
                    }
                    rows={2}
                    placeholder="Schwab is finishing its review of our connection — it should open in about a week. Trades you have already imported are unaffected."
                    className="input-field w-full text-sm resize-y"
                  />
                </label>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={!dirty || saving === entry.key}
                  onClick={() => void save(entry.key)}
                  className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40 inline-flex items-center gap-1.5"
                >
                  {saving === entry.key ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : saved === entry.key ? (
                    <Check size={13} className="text-emerald-400" />
                  ) : null}
                  {saved === entry.key ? 'Saved' : 'Save'}
                </button>
                {!dirty && live?.since && (
                  <span className="text-[11px] text-text-secondary">since {live.since}</span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
