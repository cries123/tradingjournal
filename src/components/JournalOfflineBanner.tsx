import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Shown when the cloud journal has stopped working.
 *
 * The failure it describes used to be entirely invisible. A sync would pull a trader's fills,
 * report "Imported 47 trades", spend one of their daily syncs — and save nothing, because the
 * write had been fired without anyone waiting for it. The dashboard then went on rendering the
 * last snapshot it had, which looks exactly like a journal that is simply up to date.
 *
 * So it sits above the content rather than in a corner: a journal that is not saving is not a
 * detail, and a trader who is not told will conclude the product does not work — which is the
 * more expensive outcome for everyone.
 */
export function JournalOfflineBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-3 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3"
    >
      <AlertTriangle size={16} className="text-amber-300 mt-0.5 shrink-0" aria-hidden />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-100">Your journal is not saving right now</p>
        <p className="text-xs text-amber-100/80 mt-0.5 leading-relaxed">{message}</p>
      </div>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex items-center gap-1.5 shrink-0 rounded-lg border border-amber-400/40 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-500/15 transition-colors focus-ring"
      >
        <RefreshCw size={12} aria-hidden />
        Reload
      </button>
    </div>
  );
}
