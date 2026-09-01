import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, LifeBuoy, MessageSquare, Plus, Send } from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { useEntitlement } from '../../context/useEntitlement';
import {
  createSupportTicket,
  markTicketRead,
  MAX_MESSAGE_LENGTH,
  MAX_SUBJECT_LENGTH,
  postTicketMessage,
  subscribeToMyTickets,
  subscribeToTicketMessages,
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  updateTicketStatus,
  type SupportTicket,
  type TicketCategory,
  type TicketMessage,
} from '../../services/supportTickets';

interface SupportTicketsContentProps {
  onBack: () => void;
  backLabel?: string;
  onSignIn?: () => void;
  /** Preselects a category — used by the "Report a bug" entry point. */
  initialCategory?: TicketCategory;
  heading?: string;
  intro?: string;
}

/** A stable empty array, so "no tickets" is the same reference every render. */
const EMPTY_TICKETS: SupportTicket[] = [];

function formatWhen(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const sameDay = new Date().toDateString() === d.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
        ' · ' +
        d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** The chat itself. Live on both sides — a reply appears without either person reloading. */
function TicketThread({
  ticket,
  onBack,
  onCloseTicket,
}: {
  ticket: SupportTicket;
  onBack: () => void;
  onCloseTicket: (id: string) => void;
}) {
  const { user, username } = useAuth();
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const unsub = subscribeToTicketMessages(
      ticket.id,
      setMessages,
      (err) => setError(err.message),
    );
    return unsub;
  }, [ticket.id]);

  // Opening the thread is what "read" means. Fired once per ticket, and only when there is
  // something to clear, so it isn't a write on every render.
  useEffect(() => {
    if (ticket.unreadForUser) void markTicketRead(ticket.id, 'user');
  }, [ticket.id, ticket.unreadForUser]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !user) return;

    setSending(true);
    setError(null);
    try {
      await postTicketMessage(ticket, 'user', body, {
        uid: user.uid,
        name: username ?? user.email ?? 'You',
      });
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that. Try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="panel-card overflow-hidden flex flex-col max-h-[70vh] min-h-[420px]">
      <header className="flex items-start gap-3 p-4 border-b border-border/50">
        <button
          type="button"
          onClick={onBack}
          className="mt-0.5 text-text-secondary hover:text-accent transition-colors focus-ring rounded p-1"
          aria-label="Back to all tickets"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{ticket.subject}</p>
          <p className="text-xs text-text-secondary mt-0.5">
            {TICKET_CATEGORY_LABELS[ticket.category]} · opened {formatWhen(ticket.createdAt)}
            {ticket.status !== 'open' && ` · ${ticket.status}`}
          </p>
        </div>
        {ticket.status === 'open' && (
          <button
            type="button"
            onClick={() => onCloseTicket(ticket.id)}
            className="text-xs text-text-secondary hover:text-text-primary transition-colors focus-ring rounded px-2 py-1 shrink-0"
          >
            Close ticket
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-text-secondary text-center py-8">Loading the conversation…</p>
        )}
        {messages.map((m) => {
          const mine = m.from === 'user';
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] sm:max-w-[75%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                <div
                  className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                    mine
                      ? 'bg-accent/15 text-text-primary rounded-br-sm'
                      : 'bg-bg-tertiary/70 text-text-primary rounded-bl-sm'
                  }`}
                >
                  {m.body}
                </div>
                <span className="text-[10px] text-text-secondary mt-1 px-1">
                  {mine ? 'You' : 'Trend Chasers support'} · {formatWhen(m.createdAt)}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {ticket.status === 'closed' ? (
        <div className="p-4 border-t border-border/50 text-xs text-text-secondary text-center">
          This ticket is closed. Open a new one if you need anything else.
        </div>
      ) : (
        <form onSubmit={send} className="p-3 border-t border-border/50 flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send(e as unknown as React.FormEvent);
            }}
            rows={2}
            placeholder="Write a reply…"
            aria-label="Reply"
            className="input-field flex-1 resize-y min-h-[46px] max-h-40 text-sm"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="btn-primary px-4 py-2.5 shrink-0 disabled:opacity-50"
            aria-label="Send reply"
          >
            <Send size={16} />
          </button>
        </form>
      )}

      {error && (
        <p className="px-4 pb-3 text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function NewTicketForm({
  initialCategory,
  onCreated,
  onCancel,
  hasExisting,
}: {
  initialCategory?: TicketCategory;
  onCreated: (id: string) => void;
  onCancel: () => void;
  hasExisting: boolean;
}) {
  const { user, username } = useAuth();
  const { tier } = useEntitlement();
  const [category, setCategory] = useState<TicketCategory>(initialCategory ?? 'billing');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (subject.trim().length < 3) {
      setError('Give the ticket a short subject so we can find it later.');
      return;
    }
    if (body.trim().length < 10) {
      setError('Tell us a little more — at least a sentence.');
      return;
    }
    if (!user) return;

    setBusy(true);
    try {
      const id = await createSupportTicket({
        uid: user.uid,
        email: user.email ?? '',
        username: username ?? null,
        subject,
        category,
        body,
        plan: tier,
      });
      onCreated(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the ticket. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="panel-card p-5 md:p-6 space-y-5">
      <fieldset>
        <legend className="block text-sm font-medium mb-2.5">What do you need help with?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {TICKET_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              aria-pressed={category === c.id}
              className={`text-left rounded-xl border p-3 transition-colors focus-ring ${
                category === c.id
                  ? 'border-accent/60 bg-accent/10'
                  : 'border-border/50 bg-bg-secondary/40 hover:border-accent/30'
              }`}
            >
              <p className="text-sm font-semibold">{c.label}</p>
              <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">{c.blurb}</p>
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="ticket-subject" className="block text-sm font-medium mb-2">
          Subject
        </label>
        <input
          id="ticket-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value.slice(0, MAX_SUBJECT_LENGTH))}
          required
          placeholder="Paid for Gold but still on Free"
          className="input-field w-full"
        />
      </div>

      <div>
        <label htmlFor="ticket-body" className="block text-sm font-medium mb-2">
          What happened?
        </label>
        <textarea
          id="ticket-body"
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
          rows={5}
          required
          placeholder="Include anything that helps — when it happened, what you saw, and what you expected."
          className="input-field w-full resize-y min-h-[140px]"
        />
        <p className="text-xs text-text-secondary mt-1.5">
          Your account and current plan are attached automatically. Never include a password or a
          card number — we will never ask for either.
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy} className="btn-primary px-6 py-2.5 disabled:opacity-50">
          {busy ? 'Opening…' : 'Open ticket'}
        </button>
        {hasExisting && (
          <button
            type="button"
            onClick={onCancel}
            className="text-sm text-text-secondary hover:text-text-primary transition-colors focus-ring rounded px-3 py-2.5"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

/**
 * The whole support surface for a signed-in trader: their tickets, one thread at a time.
 *
 * Rendered both on the public /support page and inside the journal, the same way the bug form is,
 * so someone who hits a problem mid-session never has to leave what they were doing.
 */
export function SupportTicketsContent({
  onBack,
  backLabel = 'Back to dashboard',
  onSignIn,
  initialCategory,
  heading = 'Support',
  intro = 'Open a ticket and talk to us directly. Replies land right here.',
}: SupportTicketsContentProps) {
  const { user, loading, firebaseEnabled } = useAuth();
  const uid = user?.uid ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  /* Stored with the uid they belong to rather than cleared on sign-out. Nothing is reset inside
     the effect (which would cascade a render), and one account's tickets can never be rendered
     for another — a mismatched uid simply reads as "nothing loaded yet". */
  const [feed, setFeed] = useState<{ uid: string; tickets: SupportTicket[] } | null>(null);

  useEffect(() => {
    if (!uid) return;

    const unsub = subscribeToMyTickets(
      uid,
      (next) => setFeed({ uid, tickets: next }),
      (err) => {
        setListError(err.message);
        setFeed({ uid, tickets: [] });
      },
    );
    return unsub;
  }, [uid]);

  // Memoised so the empty-array fallback isn't a fresh reference on every render, which would
  // re-run the lookup below each time.
  const tickets = useMemo(
    () => (feed && feed.uid === uid ? feed.tickets : EMPTY_TICKETS),
    [feed, uid],
  );
  const ticketsLoaded = !uid || feed?.uid === uid;

  const selected = useMemo(
    () => tickets.find((t) => t.id === selectedId) ?? null,
    [tickets, selectedId],
  );

  const closeTicket = useCallback((id: string) => {
    void updateTicketStatus(id, 'closed');
  }, []);

  const unansweredCount = tickets.filter((t) => t.unreadForUser).length;

  return (
    <div className="pb-6">
      <div className="max-w-2xl mx-auto p-4 md:p-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-accent transition-colors mb-8 focus-ring rounded-lg px-1 py-1"
        >
          <ArrowLeft size={16} />
          {backLabel}
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-accent/10 text-accent">
            <LifeBuoy size={22} />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{heading}</h1>
          {unansweredCount > 0 && (
            <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-accent/15 text-accent">
              {unansweredCount} new {unansweredCount === 1 ? 'reply' : 'replies'}
            </span>
          )}
        </div>
        <p className="text-text-secondary mb-8 leading-relaxed">{intro}</p>

        {!firebaseEnabled ? (
          <div className="panel-card p-6 text-sm text-text-secondary">
            Tickets need the app to be connected to our backend. Email{' '}
            <a href="mailto:support@trendchasers.net" className="text-accent hover:underline">
              support@trendchasers.net
            </a>{' '}
            and we will pick it up there.
          </div>
        ) : loading ? (
          <div className="panel-card p-8 text-center text-sm text-text-secondary">Checking your account…</div>
        ) : !user ? (
          <div className="panel-card p-8 text-center">
            <MessageSquare size={36} className="mx-auto text-accent mb-4" />
            <h2 className="text-lg font-semibold mb-2">Sign in to open a ticket</h2>
            <p className="text-sm text-text-secondary mb-6 max-w-sm mx-auto leading-relaxed">
              A ticket is a conversation tied to your account, so we can see your plan and your
              broker connections without asking you to describe them.
            </p>
            {onSignIn && (
              <button type="button" onClick={onSignIn} className="btn-primary text-sm px-5 py-2.5">
                Sign in
              </button>
            )}
            <p className="text-xs text-text-secondary mt-5">
              No account? Email{' '}
              <a href="mailto:support@trendchasers.net" className="text-accent hover:underline">
                support@trendchasers.net
              </a>
              .
            </p>
          </div>
        ) : selected ? (
          <TicketThread ticket={selected} onBack={() => setSelectedId(null)} onCloseTicket={closeTicket} />
        ) : composing || (ticketsLoaded && tickets.length === 0) ? (
          <NewTicketForm
            initialCategory={initialCategory}
            hasExisting={tickets.length > 0}
            onCancel={() => setComposing(false)}
            onCreated={(id) => {
              setComposing(false);
              setSelectedId(id);
            }}
          />
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setComposing(true)}
              className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm mb-2"
            >
              <Plus size={16} /> New ticket
            </button>

            {!ticketsLoaded && (
              <div className="panel-card p-8 text-center text-sm text-text-secondary">
                Loading your tickets…
              </div>
            )}

            {listError && (
              <p className="text-sm text-red-400" role="alert">
                {listError}
              </p>
            )}

            {tickets.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedId(t.id)}
                className="w-full text-left panel-card p-4 hover:border-accent/40 transition-colors focus-ring"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold truncate">{t.subject}</p>
                      {t.unreadForUser && (
                        <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-accent/15 text-accent shrink-0">
                          New reply
                        </span>
                      )}
                      {t.status === 'resolved' && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 shrink-0">
                          <CheckCircle2 size={11} /> Resolved
                        </span>
                      )}
                      {t.status === 'closed' && (
                        <span className="text-[10px] text-text-secondary shrink-0">Closed</span>
                      )}
                    </div>
                    <p className="text-xs text-text-secondary mt-1 line-clamp-1">
                      {t.lastMessageFrom === 'support' ? 'Support: ' : 'You: '}
                      {t.lastMessagePreview}
                    </p>
                  </div>
                  <span className="text-[11px] text-text-secondary shrink-0">
                    {formatWhen(t.lastMessageAt)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
