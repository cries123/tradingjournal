import type { Trade } from '../types';
import type { DayNote } from '../services/dayNotes';
import { effectivePnl } from './tradeHelpers';

/**
 * Finding the trade you half remember.
 *
 * A journal is only worth keeping if you can get back into it, and there was no way to find
 * anything: the calendar answers "what happened on the 14th" and nothing answered "that ES trade
 * where I sized up" or "which days did I write about revenge trading". Notes in particular were
 * write-only — typed once and never read again, because reaching them meant remembering the date.
 *
 * Entirely client-side over trades that are already loaded plus one read of the day notes, so it
 * costs nothing per search and works offline. No index, no server, no per-keystroke request.
 */

export type SearchHitKind = 'trade' | 'note';

export interface SearchHit {
  kind: SearchHitKind;
  /** YYYY-MM-DD — what the caller needs to open the day. */
  date: string;
  /** Trade id, for a trade hit. */
  id?: string;
  title: string;
  /** The matching text, trimmed around the match so the reason for the hit is visible. */
  excerpt: string;
  /** Trades only. Lets the list colour a result without the caller re-deriving it. */
  pnl?: number;
}

/**
 * Every term has to match, anywhere in the record.
 *
 * AND rather than OR: "ES revenge" should find the trade that is both, not every trade mentioning
 * either. Order does not matter, and neither does which field each term matched — "SPY oversized"
 * works when SPY is the symbol and oversized is in the note.
 */
function terms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

/** The matching span with a little room either side, so a hit in a long note is readable. */
function excerpt(text: string, needle: string, radius = 45): string {
  const at = text.toLowerCase().indexOf(needle);
  if (at === -1) return text.slice(0, radius * 2).trim();

  const start = Math.max(0, at - radius);
  const end = Math.min(text.length, at + needle.length + radius);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

function tradeHaystack(trade: Trade): string {
  return [
    trade.symbol,
    trade.setup,
    trade.notes,
    trade.grade,
    trade.side,
    trade.assetType,
    ...(trade.tags ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export interface SearchInput {
  trades: Trade[];
  notes: DayNote[];
  query: string;
  limit?: number;
}

export function searchJournal({ trades, notes, query, limit = 60 }: SearchInput): SearchHit[] {
  const words = terms(query);
  // One character matches most of a journal, which is not a search result, it is the whole list.
  if (words.length === 0 || query.trim().length < 2) return [];

  const hits: SearchHit[] = [];

  for (const trade of trades) {
    const haystack = tradeHaystack(trade);
    if (!words.every((w) => haystack.includes(w))) continue;

    const pnl = effectivePnl(trade);
    hits.push({
      kind: 'trade',
      date: trade.date,
      id: trade.id,
      title: [trade.symbol, trade.setup].filter(Boolean).join(' · ') || 'Trade',
      // Prefer the note, since that is what somebody is usually trying to find their way back to.
      excerpt: trade.notes ? excerpt(trade.notes, words[0]!) : haystack.slice(0, 90),
      pnl,
    });
  }

  for (const note of notes) {
    const text = (note.note ?? '').toLowerCase();
    if (!text || !words.every((w) => text.includes(w))) continue;

    hits.push({
      kind: 'note',
      date: note.date,
      title: 'Day note',
      excerpt: excerpt(note.note, words[0]!),
    });
  }

  /*
   * Newest first, and capped.
   *
   * Recency beats relevance for a journal: somebody searching their own notes is almost always
   * looking for something recent, and a scoring model would be guessing at which of two identical
   * substring matches mattered more. The cap keeps a two-letter query from rendering a thousand
   * rows — the count is reported separately so the UI can say the list was trimmed.
   */
  return hits.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}

/** Total matches, before the cap — so the UI can say "showing 60 of 214". */
export function countMatches(input: SearchInput): number {
  return searchJournal({ ...input, limit: Number.MAX_SAFE_INTEGER }).length;
}
