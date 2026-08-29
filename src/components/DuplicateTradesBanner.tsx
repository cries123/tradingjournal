import { useMemo, useState } from 'react';
import { Check, ChevronDown, CopyX, Download, X } from 'lucide-react';
import type { Trade } from '../types';
import { findDuplicateTrades } from '../utils/duplicateTrades';
import { formatCurrency } from '../utils/format';

const DISMISS_KEY = 'trend-chasers-duplicate-cleanup-dismissed';
const PREVIEW_LIMIT = 40;

function dismissedCount(): number {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    const value = raw ? Number(raw) : 0;
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

/** Writes the exact rows about to be deleted to a file first, so nothing here is one-way. */
function downloadRemovedTrades(trades: Trade[]): void {
  const blob = new Blob([JSON.stringify({ removedAt: new Date().toISOString(), trades }, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `trend-chasers-removed-duplicates-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

interface DuplicateTradesBannerProps {
  /** Every trade in every journal — duplicates shouldn't hide in a journal you aren't looking at. */
  trades: Trade[];
  onRemove: (ids: string[]) => Promise<void>;
}

/**
 * Offers to clean up broker trades that were imported twice.
 *
 * This asks rather than acting. It ran automatically for about an hour and was changed back
 * deliberately: an unattended deleter is only as safe as your confidence in the surrounding
 * system, and while trades were going missing for reasons nobody had explained yet, that
 * confidence didn't exist. Detection being provable is not the same as the moment being right.
 *
 * Two safeguards on top of the confirmation. The trader can read the exact list before agreeing,
 * and the rows are written to a downloaded file before a single delete is issued — so even a
 * mistaken cleanup is recoverable from the trader's own downloads folder.
 */
export function DuplicateTradesBanner({ trades, onRemove }: DuplicateTradesBannerProps) {
  const [dismissedAt, setDismissedAt] = useState(dismissedCount);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [removed, setRemoved] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const report = useMemo(() => findDuplicateTrades(trades), [trades]);

  if (removed !== null) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-profit-bright/30 bg-profit-bright/5 px-4 py-3 shrink-0">
        <Check size={15} className="text-profit-bright shrink-0" />
        <p className="text-sm text-text-primary">
          Removed {removed} duplicate {removed === 1 ? 'trade' : 'trades'}. Your totals are correct
          again, and a copy of everything removed was saved to your downloads.
        </p>
      </div>
    );
  }

  if (report.duplicates.length === 0) return null;
  if (report.affectedTrades <= dismissedAt) return null;

  const dismiss = () => {
    setDismissedAt(report.affectedTrades);
    try {
      localStorage.setItem(DISMISS_KEY, String(report.affectedTrades));
    } catch {
      // Best effort — worst case they're offered the cleanup again next visit.
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      // Backup first, delete second. If the download fails we don't delete at all.
      downloadRemovedTrades(report.duplicates);
      await onRemove(report.duplicates.map((t) => t.id));
      setRemoved(report.duplicates.length);
    } catch {
      setError("Couldn't remove them just now — nothing was changed. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  const count = report.duplicates.length;
  const preview = report.duplicates.slice(0, PREVIEW_LIMIT);

  return (
    <div className="relative rounded-xl border border-amber-400/30 bg-amber-400/5 pl-4 pr-9 py-3.5 shrink-0">
      <div className="flex flex-wrap items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-amber-400/15 border border-amber-400/30 flex items-center justify-center shrink-0 text-amber-400">
          <CopyX size={16} />
        </div>

        <div className="flex-1 min-w-[220px]">
          <p className="text-sm font-semibold text-text-primary">
            {count} duplicate {count === 1 ? 'trade' : 'trades'} in your journal
          </p>
          <p className="text-xs text-text-secondary leading-relaxed mt-0.5 max-w-2xl">
            A sync bug on our side imported some of your broker trades a second time, so your totals
            are counting them twice
            {report.duplicatedPnl !== 0 && (
              <>
                {' '}
                — by{' '}
                <span className="font-semibold tabular-nums text-text-primary">
                  {formatCurrency(report.duplicatedPnl)}
                </span>
              </>
            )}
            . Only trades your broker sent twice are removed — never anything you logged yourself —
            and where a trade exists twice, the copy with your notes and screenshots is the one kept.
          </p>
          <p className="text-[11px] text-text-secondary/80 mt-1.5 flex items-center gap-1.5">
            <Download size={11} className="shrink-0" />
            A copy of every removed row downloads first, so this is reversible.
          </p>

          <div className="flex flex-wrap items-center gap-2 mt-2.5">
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy}
              className="btn-primary text-xs px-3 py-1.5 disabled:opacity-60"
            >
              {busy ? 'Removing…' : `Remove ${count} duplicate${count === 1 ? '' : 's'}`}
            </button>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary transition-colors focus-ring rounded px-1.5 py-1"
            >
              <ChevronDown
                size={13}
                className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
              />
              {expanded ? 'Hide' : 'Show what will be removed'}
            </button>
          </div>

          {error && <p className="text-xs text-amber-400 mt-2">{error}</p>}

          {expanded && (
            <ul className="mt-2.5 max-h-56 overflow-y-auto rounded-lg border border-border/50 bg-bg-primary/40 divide-y divide-border/40">
              {preview.map((trade) => (
                <li
                  key={trade.id}
                  className="flex items-center justify-between gap-3 px-3 py-1.5 text-[11px]"
                >
                  <span className="text-text-secondary tabular-nums shrink-0">{trade.date}</span>
                  <span className="font-medium text-text-primary truncate">{trade.symbol}</span>
                  <span
                    className={`tabular-nums shrink-0 ${
                      trade.pnl >= 0 ? 'text-profit-bright' : 'text-loss-bright'
                    }`}
                  >
                    {formatCurrency(trade.pnl)}
                  </span>
                </li>
              ))}
              {count > PREVIEW_LIMIT && (
                <li className="px-3 py-1.5 text-[11px] text-text-secondary">
                  + {count - PREVIEW_LIMIT} more
                </li>
              )}
            </ul>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute top-2.5 right-2.5 p-1 rounded text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60 transition-colors focus-ring"
      >
        <X size={14} />
      </button>
    </div>
  );
}
