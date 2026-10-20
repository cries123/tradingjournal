import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, CircleAlert, Eye, Mail, Megaphone, Send, ShieldAlert } from 'lucide-react';
import { BROADCAST_LIMITS } from '../../config/adminMessage';
import {
  countAudience,
  createBroadcast,
  fetchBroadcastStatus,
  previewBroadcast,
  sendBroadcastChunks,
  sendBroadcastTest,
  type AudienceCounts,
  type BroadcastAudience,
  type BroadcastForm,
  type BroadcastKind,
  type BroadcastRecord,
  type BroadcastStatus,
} from '../../services/adminBroadcast';
import { relativeTime } from '../../utils/relativeTime';
import { SegmentedControl } from '../ui/SegmentedControl';
import { AUDIENCE_LABELS, KIND_HELP, KIND_LABELS, audienceSummary, progressLabel, sendButtonLabel } from './broadcastCopy';

const EMPTY: BroadcastForm = {
  kind: 'news',
  audience: 'all',
  subject: '',
  heading: '',
  body: '',
  preheader: '',
  ctaLabel: '',
  ctaUrl: '',
  noticeConfirmed: false,
};

const KINDS = (['news', 'notice'] as const).map((id) => ({ id, label: KIND_LABELS[id] }));
const AUDIENCES = Object.keys(AUDIENCE_LABELS) as BroadcastAudience[];

/** A pause between calls while the provider is rate-limiting, rather than asking again at once. */
const WAIT_MS = 4_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The Email tab: one email to every account, or to one plan.
 *
 * Write it, see exactly who it reaches, preview the real template, send yourself a test, then send.
 * Sending runs from this tab, a few hundred people per call, because the server only gets ten
 * seconds a call; if the tab closes partway, the history row says how far it got and Resume carries
 * on without sending anybody a second copy (server/broadcast.ts).
 */
export function EmailBroadcastPanel() {
  const [now] = useState(() => Date.now());
  const [status, setStatus] = useState<BroadcastStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<BroadcastForm>(EMPTY);
  const [counts, setCounts] = useState<AudienceCounts | null>(null);
  const [counting, setCounting] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<'preview' | 'test' | 'create' | null>(null);
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [active, setActive] = useState<BroadcastRecord | null>(null);
  const alive = useRef(true);
  const running = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const loadStatus = useCallback(() => {
    fetchBroadcastStatus()
      .then((s) => alive.current && setStatus(s))
      .catch((err) => alive.current && setLoadError(err instanceof Error ? err.message : 'Could not load the Email tab'));
  }, []);

  useEffect(loadStatus, [loadStatus]);

  // The count follows the audience and the kind, a beat after they change.
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      setCounting(true);
      countAudience(form.audience, form.kind)
        .then((c) => current && setCounts(c))
        .catch(() => current && setCounts(null))
        .finally(() => current && setCounting(false));
    }, 300);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [form.audience, form.kind]);

  const set = <K extends keyof BroadcastForm>(key: K, value: BroadcastForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setConfirming(false);
    setNote(null);
  };

  const problem = status?.problems[form.kind] ?? null;
  const filled = form.subject.trim().length > 0 && form.body.trim().length > 0;
  const canSend =
    filled && !problem && !busy && !active && (counts?.recipients ?? 0) > 0 && (form.kind === 'news' || form.noticeConfirmed);

  const run = async (label: 'preview' | 'test', action: () => Promise<void>) => {
    setBusy(label);
    setNote(null);
    try {
      await action();
    } catch (err) {
      setNote({ tone: 'error', text: err instanceof Error ? err.message : 'That did not work' });
    } finally {
      setBusy(null);
    }
  };

  /** Calls the server until the broadcast is done, keeping the progress line and history current. */
  const drive = async (start: BroadcastRecord) => {
    if (running.current) return;
    running.current = true;
    setActive(start);
    let record = start;
    try {
      for (;;) {
        const { broadcast, waiting } = await sendBroadcastChunks(record.id);
        record = broadcast;
        if (!alive.current) return;
        setActive(broadcast);
        if (broadcast.status === 'done') break;
        if (waiting) await sleep(WAIT_MS);
      }
      setNote({ tone: 'ok', text: progressLabel(record) });
    } catch (err) {
      if (alive.current) {
        setNote({
          tone: 'error',
          text: `Stopped: ${err instanceof Error ? err.message : 'the send failed'}. Resume picks up where it stopped, and nobody gets it twice.`,
        });
      }
    } finally {
      running.current = false;
      if (alive.current) {
        setActive(null);
        loadStatus();
      }
    }
  };

  const send = async () => {
    setBusy('create');
    setNote(null);
    setConfirming(false);
    try {
      const created = await createBroadcast(form);
      setForm(EMPTY);
      setPreview(null);
      setBusy(null);
      await drive(created);
    } catch (err) {
      setNote({ tone: 'error', text: err instanceof Error ? err.message : 'Could not start the send' });
    } finally {
      setBusy(null);
    }
  };

  const input = 'input-field text-sm w-full';
  const limit = BROADCAST_LIMITS;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold mb-1">Email</h2>
        <p className="text-xs text-text-secondary">
          One email to every account, or to one plan. Preview it, send yourself a test, then send. Replies go to the support inbox.
        </p>
      </div>

      {loadError && <p className="text-sm text-amber-300 rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2">{loadError}</p>}

      {status && (
        <section aria-label="Sending setup" className="grid gap-2 sm:grid-cols-3">
          {[
            { ok: status.readiness.mail, label: 'Mail provider', missing: 'RESEND_API_KEY is not set' },
            { ok: status.readiness.unsubscribe, label: 'Unsubscribe links', missing: 'EMAIL_TOKEN_SECRET is not set' },
            {
              ok: Boolean(status.readiness.postalAddress),
              label: 'Postal address for news',
              missing: 'MAIL_POSTAL_ADDRESS is not set',
              value: status.readiness.postalAddress,
            },
          ].map((item) => (
            <div key={item.label} className="flex items-start gap-2 rounded-lg border border-border/50 px-3 py-2">
              {item.ok ? (
                <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden />
              ) : (
                <CircleAlert size={15} className="mt-0.5 shrink-0 text-amber-300" aria-hidden />
              )}
              <div className="min-w-0">
                <p className="text-xs font-medium text-text-primary">{item.label}</p>
                <p className="truncate text-[11px] text-text-secondary" title={item.value ?? undefined}>
                  {item.ok ? (item.value ?? 'Ready') : item.missing}
                </p>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="panel-card rounded-xl p-5 md:p-6 space-y-4" aria-label="Write an email">
        <div className="flex items-center gap-2">
          <Megaphone size={16} className="text-accent" aria-hidden />
          <h3 className="text-sm font-semibold text-text-primary">Write it</h3>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-text-secondary">Kind</p>
            <SegmentedControl options={KINDS} value={form.kind} onChange={(k: BroadcastKind) => set('kind', k)} label="Kind of email" />
            <p className="text-[11px] leading-relaxed text-text-secondary">{KIND_HELP[form.kind]}</p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="broadcast-audience" className="text-xs font-medium text-text-secondary">
              Goes to
            </label>
            <select
              id="broadcast-audience"
              value={form.audience}
              onChange={(e) => set('audience', e.target.value as BroadcastAudience)}
              className="input-field text-sm w-full"
            >
              {AUDIENCES.map((a) => (
                <option key={a} value={a}>
                  {AUDIENCE_LABELS[a]}
                </option>
              ))}
            </select>
            <p className="text-[11px] leading-relaxed text-text-secondary" aria-live="polite">
              {counting && !counts ? 'Counting…' : counts ? audienceSummary(counts) : 'Could not count this audience.'}
            </p>
          </div>
        </div>

        <div className="grid gap-3">
          <input className={input} aria-label="Subject" placeholder="Subject" value={form.subject} maxLength={limit.subject} onChange={(e) => set('subject', e.target.value)} />
          <input
            className={input}
            aria-label="Preview line"
            placeholder="Inbox preview line (optional)"
            value={form.preheader}
            maxLength={limit.preheader}
            onChange={(e) => set('preheader', e.target.value)}
          />
          <input
            className={input}
            aria-label="Heading"
            placeholder="Heading (optional, else the subject)"
            value={form.heading}
            maxLength={limit.heading}
            onChange={(e) => set('heading', e.target.value)}
          />
          <textarea
            className={`${input} min-h-[180px] resize-y`}
            aria-label="Message"
            placeholder="Write it like a person. Blank lines make paragraphs, **two asterisks** make bold, and https:// links become links."
            value={form.body}
            maxLength={limit.body}
            rows={9}
            onChange={(e) => set('body', e.target.value)}
          />
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <input
              className={input}
              aria-label="Button label"
              placeholder="Button label (optional)"
              value={form.ctaLabel}
              maxLength={limit.ctaLabel}
              onChange={(e) => set('ctaLabel', e.target.value)}
            />
            <input
              className={input}
              aria-label="Button link"
              placeholder="Button link, https:// (optional)"
              value={form.ctaUrl}
              onChange={(e) => set('ctaUrl', e.target.value)}
            />
          </div>
          <p className="-mt-1 text-[11px] text-text-secondary">With both left empty, the button reads Open Trend Chasers and opens the journal.</p>
        </div>

        {form.kind === 'notice' && (
          <label className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-xs text-text-primary">
            <input type="checkbox" className="mt-0.5" checked={form.noticeConfirmed} onChange={(e) => set('noticeConfirmed', e.target.checked)} />
            <span>This is about their account or the service, not a promotion. It will reach people who unsubscribed from news.</span>
          </label>
        )}

        {problem && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-xs text-amber-200">
            <ShieldAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
            {problem}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!filled || Boolean(busy)}
            onClick={() => void run('preview', async () => setPreview((await previewBroadcast(form)).html))}
            className="inline-flex items-center gap-1.5 btn-secondary px-3 py-1.5 text-xs disabled:opacity-50"
          >
            <Eye size={13} aria-hidden />
            {busy === 'preview' ? 'Rendering…' : 'Preview'}
          </button>
          <button
            type="button"
            disabled={!filled || Boolean(busy) || !status?.readiness.mail}
            onClick={() => void run('test', async () => setNote({ tone: 'ok', text: await sendBroadcastTest(form) }))}
            className="inline-flex items-center gap-1.5 btn-secondary px-3 py-1.5 text-xs disabled:opacity-50"
          >
            <Mail size={13} aria-hidden />
            {busy === 'test' ? 'Sending the test…' : 'Send me a test'}
          </button>
          <button
            type="button"
            disabled={!canSend}
            onClick={() => setConfirming(true)}
            className="ml-auto inline-flex items-center gap-1.5 btn-primary px-3.5 py-1.5 text-xs disabled:opacity-50"
          >
            <Send size={13} aria-hidden />
            {sendButtonLabel(counts?.recipients ?? null)}
          </button>
        </div>

        {confirming && counts && (
          <div role="alertdialog" aria-label="Confirm the send" className="rounded-lg border border-accent/40 bg-accent/5 p-3 space-y-2">
            <p className="text-sm text-text-primary">
              Send “{form.subject.trim()}” to {counts.recipients.toLocaleString('en-US')} {counts.recipients === 1 ? 'person' : 'people'} ({AUDIENCE_LABELS[form.audience]},{' '}
              {KIND_LABELS[form.kind].toLowerCase()})? Once it starts it cannot be called back.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirming(false)} className="btn-secondary px-3 py-1.5 text-xs">
                Cancel
              </button>
              <button type="button" onClick={() => void send()} className="btn-primary px-3 py-1.5 text-xs">
                {busy === 'create' ? 'Starting…' : 'Send it now'}
              </button>
            </div>
          </div>
        )}

        {note && (
          <p role="status" className={`text-xs ${note.tone === 'ok' ? 'text-accent' : 'text-red-400'}`}>
            {note.text}
          </p>
        )}
      </section>

      {active && (
        <section className="panel-card rounded-xl p-5 md:p-6 space-y-2" aria-label="Sending">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold text-text-primary truncate">Sending “{active.subject}”</h3>
            <span className="text-xs tabular-nums text-text-secondary">{progressLabel(active)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-bg-tertiary">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-500"
              style={{ width: `${Math.round(((active.sent + active.failed) / Math.max(1, active.total)) * 100)}%` }}
            />
          </div>
          <p className="text-[11px] text-text-secondary">
            Keep this tab open until it finishes. If it closes, Resume below carries on from where it stopped, and nobody gets it twice.
          </p>
        </section>
      )}

      {preview && (
        <section className="panel-card rounded-xl p-5 md:p-6" aria-label="Preview">
          <h3 className="text-sm font-semibold text-text-primary mb-3">Preview, as you would get it</h3>
          {/* sandbox with nothing allowed: the template has no scripts, and this keeps it that way. */}
          <iframe title="Email preview" sandbox="" srcDoc={preview} className="h-[640px] w-full rounded-lg border border-border/50 bg-white" />
        </section>
      )}

      <section className="panel-card rounded-xl p-5 md:p-6" aria-label="Sent emails">
        <h3 className="text-sm font-semibold text-text-primary mb-1">Sent</h3>
        <p className="text-xs text-text-secondary mb-3">Every email sent from this tab, newest first.</p>
        {!status ? (
          <p className="text-xs text-text-secondary">Loading…</p>
        ) : status.broadcasts.length === 0 ? (
          <p className="text-xs text-text-secondary">Nothing sent from here yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {status.broadcasts.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border/40 px-3 py-2">
                {/* Its own line on a phone: beside the status and Resume, the subject was cut to a word. */}
                <div className="min-w-0 flex-1 basis-full sm:basis-0">
                  <p className="truncate text-xs font-medium text-text-primary" title={b.subject}>
                    {b.subject}
                  </p>
                  <p className="text-[11px] text-text-secondary">
                    {relativeTime(b.createdAt, now)} · {KIND_LABELS[b.kind]} · {AUDIENCE_LABELS[b.audience]}
                  </p>
                </div>
                <span className={`text-[11px] tabular-nums ${b.status === 'done' ? 'text-text-secondary' : 'text-amber-300'}`}>{progressLabel(b)}</span>
                {b.status !== 'done' && (
                  <button
                    type="button"
                    disabled={Boolean(active) || Boolean(status.problems[b.kind])}
                    onClick={() => void drive(b)}
                    className="btn-secondary px-2.5 py-1 text-[11px] disabled:opacity-50"
                  >
                    Resume
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
