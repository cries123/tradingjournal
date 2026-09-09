import { useEffect, useState } from 'react';
import { MessageSquareQuote } from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { useEntitlement } from '../../context/useEntitlement';
import { fetchMyCoachNotes, markCoachNotesRead, type CoachNote } from '../../services/coachSeat';

/** "Mar 4" — the day a note is about, not the day it was written. */
function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * What the trader's coach has written, on the screen the trader actually opens.
 *
 * The read-only share link that existed before this could show a coach the journal but gave them
 * nowhere to answer, so the answer happened in Discord or a text message and never came back to
 * the trade it was about. These notes live next to the calendar instead.
 *
 * Renders nothing at all when there is no coach or nothing written — an empty "your coach has not
 * said anything" card is a reminder that you are paying for something you are not using, which is
 * a strange thing to put above somebody's P&L every morning.
 */
export function CoachNotesPanel() {
  const { user } = useAuth();
  const { has } = useEntitlement();
  const [notes, setNotes] = useState<CoachNote[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!user || !has('coachSeat')) return;
    let cancelled = false;

    void fetchMyCoachNotes()
      .then(({ notes: next }) => {
        if (cancelled) return;
        setNotes(next);
        // Marked read only once there was something to read, and only after it is on screen.
        if (next.some((n) => n.unreadForOwner)) void markCoachNotesRead().catch(() => undefined);
      })
      .catch(() => {
        // No coach, or the endpoint is unreachable. Either way there is nothing to show and
        // nothing the trader can do about it from here.
      });

    return () => {
      cancelled = true;
    };
  }, [user, has]);

  if (notes.length === 0) return null;

  const unread = notes.filter((n) => n.unreadForOwner).length;
  const shown = expanded ? notes : notes.slice(0, 3);

  return (
    <div className="mb-3 rounded-xl border border-accent/25 bg-accent/5 p-3 md:p-3.5">
      <div className="flex items-center gap-2 mb-2">
        <MessageSquareQuote size={16} className="text-accent shrink-0" />
        <p className="text-sm font-semibold">From your coach</p>
        {unread > 0 && (
          <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-accent/20 text-accent">
            {unread} new
          </span>
        )}
      </div>

      <ul className="space-y-2">
        {shown.map((note) => (
          <li key={note.id} className="rounded-lg bg-bg-primary/50 px-2.5 py-2">
            <p className="text-[11px] text-text-secondary mb-0.5">
              <span className="text-text-primary font-medium">{note.coachName}</span> on{' '}
              {dayLabel(note.date)}
              {note.tradeId && ' · about one trade'}
            </p>
            <p className="text-xs leading-relaxed whitespace-pre-wrap break-words">{note.body}</p>
          </li>
        ))}
      </ul>

      {notes.length > 3 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-[11px] text-accent hover:text-accent/80 transition-colors focus-ring rounded"
        >
          {expanded ? 'Show fewer' : `Show all ${notes.length}`}
        </button>
      )}
    </div>
  );
}
