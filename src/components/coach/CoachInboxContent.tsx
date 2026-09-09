import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Send, UserRoundCheck } from 'lucide-react';
import type { Trade } from '../../types';
import { formatCurrency } from '../../utils/format';
import { pnlClass } from '../../utils/pnlTone';
import {
  fetchCoachedJournal,
  fetchCoaching,
  postCoachNote,
  type CoachNote,
  type CoachedJournal,
  type CoachedJournalView,
} from '../../services/coachSeat';

/**
 * The coach's side: whose journals they can see, and where they write back.
 *
 * A day at a time rather than a trade at a time, because that is the unit a review actually
 * happens in — "you took nine trades on Tuesday and the last four were revenge" is the note worth
 * leaving, and it does not belong on any one of those trades.
 *
 * No live listeners: the whole feature is server-mediated (see server/coachSeat.ts) and a coach
 * opens this weekly, not continuously. Reloading is the refresh.
 */

function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

interface Day {
  date: string;
  trades: Trade[];
  pnl: number;
  notes: CoachNote[];
}

function groupDays(view: CoachedJournalView): Day[] {
  const byDate = new Map<string, Trade[]>();
  for (const trade of view.trades) {
    const list = byDate.get(trade.date) ?? [];
    list.push(trade);
    byDate.set(trade.date, list);
  }

  return [...byDate.entries()]
    .map(([date, trades]) => ({
      date,
      trades,
      pnl: trades.reduce((sum, t) => sum + t.pnl, 0),
      notes: view.notes.filter((n) => n.date === date),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function DayCard({
  day,
  ownerUid,
  onNoteAdded,
}: {
  day: Day;
  ownerUid: string;
  onNoteAdded: (note: CoachNote) => void;
}) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      onNoteAdded(await postCoachNote({ ownerUid, date: day.date, body: draft }));
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that note.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel-card p-3 md:p-4">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <p className="text-sm font-semibold">{dayLabel(day.date)}</p>
        <p className={`text-sm font-semibold tabular-nums ${pnlClass(day.pnl)}`}>
          {formatCurrency(day.pnl, 'USD')}
          <span className="text-text-secondary font-normal text-xs"> · {day.trades.length}t</span>
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <tbody>
            {day.trades.map((trade) => (
              <tr key={trade.id} className="border-t border-border/30">
                <td className="py-1 pr-2 font-medium">{trade.symbol}</td>
                <td className="py-1 pr-2 text-text-secondary">{trade.side ?? ''}</td>
                <td className="py-1 pr-2 text-text-secondary tabular-nums">
                  {trade.quantity != null ? `${trade.quantity}` : ''}
                </td>
                <td className={`py-1 text-right font-semibold tabular-nums ${pnlClass(trade.pnl)}`}>
                  {formatCurrency(trade.pnl, 'USD')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {day.notes.length > 0 && (
        <ul className="mt-2.5 space-y-1.5">
          {day.notes.map((note) => (
            <li key={note.id} className="rounded-lg bg-accent/10 px-2.5 py-2">
              <p className="text-[11px] text-text-secondary mb-0.5">{note.coachName}</p>
              <p className="text-xs leading-relaxed whitespace-pre-wrap break-words">{note.body}</p>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) void send();
        }}
        className="mt-2.5 flex items-end gap-2"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder={`Leave a note on ${dayLabel(day.date)}…`}
          aria-label={`Note on ${dayLabel(day.date)}`}
          className="input-field flex-1 resize-y min-h-[44px] max-h-40 text-sm"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          aria-label="Save note"
          className="btn-primary px-3.5 py-2.5 shrink-0 disabled:opacity-50"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        </button>
      </form>

      {error && (
        <p className="mt-1.5 text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function CoachInboxContent({ onBack }: { onBack: () => void }) {
  const [journals, setJournals] = useState<CoachedJournal[] | null>(null);
  const [openUid, setOpenUid] = useState<string | null>(null);
  /* Stored with the uid it belongs to rather than cleared when the selection changes. Nothing is
     reset inside an effect (which would cascade a render), and one trader's journal can never be
     rendered under another's name — a mismatched uid simply reads as "not loaded yet". */
  const [loaded, setLoaded] = useState<{ uid: string; view: CoachedJournalView } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const view = loaded && loaded.uid === openUid ? loaded.view : null;

  useEffect(() => {
    let cancelled = false;
    void fetchCoaching()
      .then(({ journals: next }) => {
        if (cancelled) return;
        setJournals(next);
        // One journal is the overwhelmingly common case; making the coach click through a list of
        // one is a step that exists only because the list exists.
        if (next.length === 1) setOpenUid(next[0].ownerUid);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load your journals.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!openUid) return;
    let cancelled = false;
    const uid = openUid;
    void fetchCoachedJournal(uid)
      .then((next) => {
        if (!cancelled) setLoaded({ uid, view: next });
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load that journal.');
      });
    return () => {
      cancelled = true;
    };
  }, [openUid]);

  const days = useMemo(() => (view ? groupDays(view) : []), [view]);
  const open = journals?.find((j) => j.ownerUid === openUid) ?? null;

  return (
    <div className="pb-6">
      <div className="max-w-3xl mx-auto p-4 md:p-6">
        <button
          type="button"
          onClick={openUid && (journals?.length ?? 0) > 1 ? () => setOpenUid(null) : onBack}
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-accent transition-colors mb-6 focus-ring rounded-lg px-1 py-1"
        >
          <ArrowLeft size={16} />
          {openUid && (journals?.length ?? 0) > 1 ? 'All journals' : 'Back to dashboard'}
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-accent/10 text-accent">
            <UserRoundCheck size={22} />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            {open ? (open.username ? `@${open.username}` : (open.email ?? 'Journal')) : 'Coaching'}
          </h1>
        </div>
        <p className="text-text-secondary mb-6 leading-relaxed max-w-2xl">
          {open
            ? 'The last 90 days of their trading. Anything you write here shows up in their journal.'
            : 'Traders who invited you to read their journal and leave notes on it.'}
        </p>

        {error && (
          <p className="panel-card p-4 text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        {!error && journals === null && (
          <p className="panel-card p-8 text-center text-sm text-text-secondary">Loading…</p>
        )}

        {!error && journals?.length === 0 && (
          <p className="panel-card p-8 text-center text-sm text-text-secondary">
            Nobody has invited you yet. A trader adds you from their Settings, using the address you
            signed in with.
          </p>
        )}

        {!openUid && (journals?.length ?? 0) > 1 && (
          <div className="space-y-2">
            {journals?.map((journal) => (
              <button
                key={journal.ownerUid}
                type="button"
                onClick={() => setOpenUid(journal.ownerUid)}
                className="w-full text-left panel-card p-4 hover:border-accent/40 transition-colors focus-ring"
              >
                <p className="text-sm font-semibold">
                  {journal.username ? `@${journal.username}` : (journal.email ?? 'A trader')}
                </p>
                <p className="text-xs text-text-secondary mt-0.5">
                  Invited {new Date(journal.invitedAt).toLocaleDateString()}
                </p>
              </button>
            ))}
          </div>
        )}

        {openUid && view === null && !error && (
          <p className="panel-card p-8 text-center text-sm text-text-secondary">Loading the journal…</p>
        )}

        {openUid && view && days.length === 0 && (
          <p className="panel-card p-8 text-center text-sm text-text-secondary">
            No trades in the last 90 days.
          </p>
        )}

        {openUid && days.length > 0 && (
          <div className="space-y-3">
            {days.map((day) => (
              <DayCard
                key={day.date}
                day={day}
                ownerUid={openUid}
                onNoteAdded={(note) =>
                  setLoaded((prev) =>
                    prev && prev.uid === openUid
                      ? { ...prev, view: { ...prev.view, notes: [note, ...prev.view.notes] } }
                      : prev,
                  )
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
