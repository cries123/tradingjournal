import { Check, X } from 'lucide-react';

interface DuplicateCleanupNoticeProps {
  count: number;
  onDismiss?: () => void;
}

/**
 * Receipt for the automatic duplicate cleanup.
 *
 * The cleanup itself doesn't ask permission — a duplicate here is provable rather than guessed
 * (see utils/duplicateTrades.ts) — but a journal that silently rewrites someone's trading record
 * isn't one they can trust. So it removes them, then says so.
 */
export function DuplicateCleanupNotice({ count, onDismiss }: DuplicateCleanupNoticeProps) {
  return (
    <div className="relative flex items-start gap-2.5 rounded-xl border border-profit-bright/30 bg-profit-bright/5 pl-4 pr-9 py-3 shrink-0">
      <Check size={15} className="text-profit-bright shrink-0 mt-0.5" />
      <p className="text-xs md:text-sm text-text-primary leading-relaxed">
        <span className="font-semibold">
          Removed {count} duplicate {count === 1 ? 'trade' : 'trades'}.
        </span>{' '}
        <span className="text-text-secondary">
          A sync bug on our side imported some broker trades twice, so your totals were counting
          them double. The copies are gone and your numbers are correct again — nothing you logged
          or wrote yourself was touched.
        </span>
      </p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="absolute top-2.5 right-2.5 p-1 rounded text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60 transition-colors focus-ring"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
