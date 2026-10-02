import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Clock, Send, User } from 'lucide-react';
import { reportErrorSilently } from '../../services/errorReporting';
import { AdminUserRef } from './AdminUserRef';
import {
  markTicketRead,
  MAX_MESSAGE_LENGTH,
  notifyTicketReply,
  postTicketMessage,
  subscribeToTicketMessages,
  TICKET_CATEGORY_LABELS,
  type SupportTicket,
  type TicketMessage,
  type TicketStatus,
} from '../../services/supportTickets';

interface SupportTicketsPanelProps {
  tickets: SupportTicket[];
  adminUid: string;
  busyId: string | null;
  onStatusChange: (ticketId: string, status: TicketStatus, subject: string) => void;
  onReplied: (ticketId: string) => void;
  onOpenUser?: (uid: string) => void;
  canOpenUser?: (uid: string) => boolean;
}

/**
 * The support queue, and the thread for whichever ticket is open.
 *
 * Ordered by "who is waiting" rather than by date: a ticket where the user spoke last is one the
 * customer is sitting on, and those go first regardless of age. Everything else is history.
 */

function formatWhen(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  // No seconds and no year. toLocaleString() gives "9/30/2026, 3:00:00 AM", which is eleven
  // characters of noise on the line that has to fit an email address beside it on a phone.
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
}

function waitingHours(iso: string): number {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  return (Date.now() - then) / 3_600_000;
}

function AdminTicketThread({
  ticket,
  adminUid,
  onReplied,
}: {
  ticket: SupportTicket;
  adminUid: string;
  onReplied: (ticketId: string) => void;
}) {
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const unsub = subscribeToTicketMessages(ticket.id, setMessages, (err) => setError(err.message));
    return unsub;
  }, [ticket.id]);

  useEffect(() => {
    if (ticket.unreadForSupport) {
      void markTicketRead(ticket.id, 'support').catch((err: unknown) => {
        reportErrorSilently(err, 'promise', 'ticket-read-support');
      });
    }
  }, [ticket.id, ticket.unreadForSupport]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;

    setSending(true);
    setError(null);
    try {
      await postTicketMessage(ticket, 'support', body, { uid: adminUid, name: 'Trend Chasers support' });
      setDraft('');
      onReplied(ticket.id);
      // Not awaited: the reply is saved and on screen, and the email is a courtesy that must never
      // hold up the next one being typed.
      void notifyTicketReply(ticket.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that reply.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-border/50">
      <div className="space-y-3 max-h-96 overflow-y-auto pr-1 mb-3">
        {messages.map((m) => {
          const fromSupport = m.from === 'support';
          return (
            <div key={m.id} className={`flex ${fromSupport ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[85%] flex flex-col">
                <div
                  className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                    fromSupport
                      ? 'bg-emerald-500/15 rounded-br-sm'
                      : 'bg-bg-tertiary/70 rounded-bl-sm'
                  }`}
                >
                  {m.body}
                </div>
                <span
                  className={`text-[10px] text-text-secondary mt-1 px-1 ${fromSupport ? 'text-right' : ''}`}
                >
                  {fromSupport ? 'You' : m.authorName || 'User'} · {formatWhen(m.createdAt)}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
          rows={2}
          placeholder="Reply to this trader…"
          aria-label="Reply to ticket"
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

      {error && (
        <p className="text-xs text-red-400 mt-2" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function SupportTicketsPanel({
  tickets,
  adminUid,
  busyId,
  onStatusChange,
  onReplied,
  onOpenUser,
  canOpenUser,
}: SupportTicketsPanelProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  // Waiting on us, oldest first — then everything else by recency. Sorting the queue by "who is
  // blocked" is the difference between a list and a work order.
  const ordered = [...tickets].sort((a, b) => {
    if (a.unreadForSupport !== b.unreadForSupport) return a.unreadForSupport ? -1 : 1;
    if (a.unreadForSupport) return a.lastMessageAt.localeCompare(b.lastMessageAt);
    return b.lastMessageAt.localeCompare(a.lastMessageAt);
  });

  if (ordered.length === 0) {
    return (
      <div className="panel-card rounded-xl p-8 text-center text-text-secondary text-sm">
        No support tickets yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {ordered.map((ticket) => {
        const open = openId === ticket.id;
        const hours = waitingHours(ticket.lastMessageAt);
        const stale = ticket.unreadForSupport && hours > 24;

        return (
          <article
            key={ticket.id}
            className={`panel-card rounded-xl p-5 ${stale ? 'ring-1 ring-amber-500/40' : ''}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              {/*
                * The identity line is a sibling of the expand button rather than inside it: the
                * name is its own control now, and a button inside a button is invalid markup the
                * browser silently un-nests. Subject and preview stayed in the expand target, so the
                * metadata line moved below them.
                */}
              <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : ticket.id)}
                aria-expanded={open}
                className="text-left w-full focus-ring rounded"
              >
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  {ticket.unreadForSupport && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
                      <Clock size={10} /> Waiting on you
                    </span>
                  )}
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-bg-tertiary/70 text-text-secondary">
                    {TICKET_CATEGORY_LABELS[ticket.category]}
                  </span>
                  {ticket.plan && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 uppercase tracking-wide">
                      {ticket.plan}
                    </span>
                  )}
                  {ticket.status === 'resolved' && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
                      <CheckCircle2 size={11} /> Resolved
                    </span>
                  )}
                  {ticket.status === 'closed' && (
                    <span className="text-[10px] text-text-secondary">Closed</span>
                  )}
                </div>

                <p className="text-sm font-semibold truncate">{ticket.subject}</p>

                {!open && (
                  <p className="text-xs text-text-secondary mt-1.5 line-clamp-1">
                    {ticket.lastMessageFrom === 'support' ? 'You: ' : 'Them: '}
                    {ticket.lastMessagePreview}
                  </p>
                )}
              </button>

              {/*
                Two lines on a phone, one from sm up — and not a flex row of text nodes.

                Each ' · ' was its own flex item, so on a 390px screen the wrap put the icon alone on
                one line and a leading separator at the start of the next. The name is the part worth
                its own line; the counts are a plain sentence underneath that wraps like prose.
              */}
              <div className="mt-1.5 text-xs text-text-secondary">
                <p className="flex items-center gap-1.5">
                  <User size={11} className="shrink-0" />
                  <AdminUserRef
                    uid={ticket.uid}
                    onOpen={onOpenUser}
                    canOpen={canOpenUser}
                    className="truncate"
                  >
                    {ticket.email}
                    {ticket.username ? ` (@${ticket.username})` : ''}
                  </AdminUserRef>
                </p>
                <p className="mt-0.5">
                  {ticket.messageCount} message{ticket.messageCount === 1 ? '' : 's'} · last{' '}
                  {formatWhen(ticket.lastMessageAt)}
                </p>
              </div>
              </div>

              <select
                value={ticket.status}
                disabled={busyId === ticket.id}
                onChange={(e) => onStatusChange(ticket.id, e.target.value as TicketStatus, ticket.subject)}
                className="input-field text-sm py-1.5 px-2 min-w-[120px]"
                aria-label="Update ticket status"
              >
                <option value="open">Open</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            {open && <AdminTicketThread ticket={ticket} adminUid={adminUid} onReplied={onReplied} />}
          </article>
        );
      })}
    </div>
  );
}
