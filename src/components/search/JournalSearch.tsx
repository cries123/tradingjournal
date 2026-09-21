import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { Trade } from '../../types';
import { useAuth } from '../../context/useAuth';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { fetchAllDayNotes, type DayNote } from '../../services/dayNotes';
import { formatCurrency } from '../../utils/format';
import { countMatches, searchJournal, type SearchHit } from '../../utils/searchJournal';

interface JournalSearchProps {
  trades: Trade[];
  onClose: () => void;
  /** Opens the day a hit belongs to — the calendar already knows how to show one. */
  onOpenDay: (date: string) => void;
}

/**
 * Search, over everything the trader has written.
 *
 * Deliberately not gated. Getting back to your own notes is not a premium analytic — a journal you
 * cannot search is a journal nobody rereads, and the people most likely to give up early are the
 * ones on the free tier with a handful of entries they can no longer find.
 *
 * An overlay rather than a screen, because search is something you do on the way to somewhere
 * else. Every result opens the day it belongs to, which is the view that already exists for
 * reading a trade or a note in context.
 */
export function JournalSearch({ trades, onClose, onOpenDay }: JournalSearchProps) {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState<DayNote[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEscapeToClose(onClose);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    /*
     * Fetched once when the panel opens, not on app start.
     *
     * Day notes live one document per day and are otherwise read individually by the calendar, so
     * searching them needs the whole subcollection — a cost worth paying for somebody who searches
     * and worth not paying for everybody else. A failure leaves notes empty and trades still
     * searchable, which is most of the value.
     */
    let live = true;
    void fetchAllDayNotes(user?.uid ?? null)
      .then((all) => {
        if (live) setNotes(all);
      })
      .catch(() => {
        if (live) setNotes([]);
      });
    return () => {
      live = false;
    };
  }, [user?.uid]);

  const input = useMemo(
    () => ({ trades, notes: notes ?? [], query }),
    [trades, notes, query],
  );
  const hits = useMemo(() => searchJournal(input), [input]);
  const total = useMemo(() => (hits.length >= 60 ? countMatches(input) : hits.length), [hits, input]);

  const ready = query.trim().length >= 2;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[10vh] bg-black/70"
      role="dialog"
      aria-modal="true"
      aria-label="Search your journal"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-border bg-bg-secondary shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
          <Search size={18} className="text-text-secondary shrink-0" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Symbol, tag, or anything you wrote…"
            aria-label="Search your journal"
            className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-text-secondary"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="p-1 rounded-lg text-text-secondary hover:text-text-primary focus-ring shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {!ready && (
            <p className="px-4 py-6 text-sm text-text-secondary">
              Searches your trades and your day notes — symbols, setups, tags, grades and anything
              you typed.
            </p>
          )}

          {ready && hits.length === 0 && (
            <p className="px-4 py-6 text-sm text-text-secondary">
              Nothing matches “{query.trim()}”.
              {notes === null && ' Still loading your notes…'}
            </p>
          )}

          {hits.map((hit) => (
            <Result key={`${hit.kind}-${hit.id ?? hit.date}`} hit={hit} onOpenDay={onOpenDay} onClose={onClose} />
          ))}
        </div>

        {ready && hits.length > 0 && (
          <div className="border-t border-border/60 px-4 py-2 text-[11px] text-text-secondary">
            {total > hits.length
              ? `Showing the ${hits.length} most recent of ${total} matches.`
              : `${hits.length} match${hits.length === 1 ? '' : 'es'}.`}
          </div>
        )}
      </div>
    </div>
  );
}

function Result({
  hit,
  onOpenDay,
  onClose,
}: {
  hit: SearchHit;
  onOpenDay: (date: string) => void;
  onClose: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        onOpenDay(hit.date);
        onClose();
      }}
      className="flex w-full items-start gap-3 border-b border-border/40 px-4 py-3 text-left transition-colors hover:bg-bg-tertiary/50 focus-ring"
    >
      <span className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide bg-bg-tertiary text-text-secondary">
        {hit.kind}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-medium">{hit.title}</span>
          <span className="text-[11px] text-text-secondary">{hit.date}</span>
          {hit.pnl != null && (
            <span
              className={`text-[11px] tabular-nums ${hit.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
            >
              {formatCurrency(hit.pnl)}
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-xs text-text-secondary">{hit.excerpt}</span>
      </span>
    </button>
  );
}
