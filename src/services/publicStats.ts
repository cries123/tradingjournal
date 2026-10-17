/** What /api/public-stats answers. A null figure was withheld or could not be counted. */
export interface PublicStats {
  trades: number | null;
  traders: number | null;
}

/**
 * The landing page's live figures, or null when they cannot be had.
 *
 * Plain fetch, not Firestore: this is read from the landing page, whose entry must not import the
 * Firestore SDK (src/lib/entryWeight.test.ts). Never throws — the strip falls back to fixed facts.
 */
export async function fetchPublicStats(): Promise<PublicStats | null> {
  try {
    const res = await fetch('/api/public-stats');
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<PublicStats>;
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
    return { trades: n(data.trades), traders: n(data.traders) };
  } catch {
    return null;
  }
}
