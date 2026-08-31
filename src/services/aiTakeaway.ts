import type { Trade } from '../types';
import type { JournalFacts } from '../utils/journalFacts';
import { requireIdToken } from './aiAssistant';
import { effectivePnl } from '../utils/tradeHelpers';

/**
 * Fetches the AI read of a period for the banner at the top of the dashboard.
 *
 * Everything here is best-effort. The dashboard already has a computed takeaway on screen before
 * this is called, so every failure path — no key configured, daily cap reached, provider down,
 * user offline — returns null and leaves that banner exactly where it is. Nothing about this
 * feature is allowed to put an error in front of someone who was looking at their calendar.
 */

/**
 * Identifies the trade set a takeaway was written about.
 *
 * The server caches on this, so it has to change when anything the model saw changes and stay
 * still otherwise. id and effective P&L cover an edit, a deletion, a broker sync filling in fees,
 * or a re-import; sorting keeps it stable against the order trades happen to arrive in. It is not
 * a security boundary — it is a cache key, and a collision costs one stale banner.
 */
export function hashTrades(trades: Trade[]): string {
  const canonical = trades
    .map((t) => `${t.id}:${effectivePnl(t).toFixed(2)}:${t.setup ?? ''}:${t.side ?? ''}`)
    .sort()
    .join('|');

  // FNV-1a. Small, dependency-free, and more than enough to notice a changed trade set.
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${(hash >>> 0).toString(36)}-${trades.length}`;
}

export async function fetchAiTakeaway(
  facts: JournalFacts,
  periodKey: string,
  factsHash: string,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const token = await requireIdToken();
    const res = await fetch('/api/ai-takeaway', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ facts, periodKey, factsHash }),
      signal,
    });

    // 204 is the deliberate "nothing to show" — not configured, capped, or the model failed. The
    // computed banner stays. Anything else non-OK is treated the same way on purpose.
    if (res.status === 204 || !res.ok) return null;

    const data = (await res.json()) as { text?: string };
    return typeof data.text === 'string' && data.text.trim() ? data.text.trim() : null;
  } catch {
    return null;
  }
}
