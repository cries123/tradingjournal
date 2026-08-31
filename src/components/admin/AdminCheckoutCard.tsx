import { useEffect, useState } from 'react';
import { AlertTriangle, CreditCard, Loader2 } from 'lucide-react';
import {
  DEFAULT_MAINTENANCE_MESSAGE,
  maintenanceMessage,
  OPEN_CHECKOUT,
  type CheckoutStatus,
} from '../../config/checkoutStatus';
import { fetchCheckoutStatus, saveCheckoutStatus } from '../../services/checkoutStatus';

interface AdminCheckoutCardProps {
  onAudit: (detail: string) => void;
}

/**
 * The maintenance switch for plan purchases.
 *
 * Turning it off stops new subscriptions *and* plan changes, because both take a card payment.
 * It deliberately does not touch anything else: existing subscribers keep the plan they paid for,
 * their journals and syncs carry on, and the billing portal stays open so anyone who wants to
 * cancel still can. Blocking cancellation while subscriptions keep renewing is the one
 * combination guaranteed to produce chargebacks.
 *
 * Enforcement is server-side — the checkout function reads the same document — so this is a real
 * switch, not a hidden button.
 */
export function AdminCheckoutCard({ onAudit }: AdminCheckoutCardProps) {
  const [saved, setSaved] = useState<CheckoutStatus>(OPEN_CHECKOUT);
  const [enabled, setEnabled] = useState(true);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // fresh: an admin must see what is actually stored, never a cached copy of it.
    void fetchCheckoutStatus({ fresh: true })
      .then((status) => {
        if (cancelled) return;
        setSaved(status);
        setEnabled(status.enabled);
        setMessage(status.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = enabled !== saved.enabled || message.trim() !== saved.message;

  const save = async () => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const next = await saveCheckoutStatus({ enabled, message });
      setSaved(next);
      setMessage(next.message);
      setNote(
        next.enabled
          ? 'Checkout is open. Plans can be bought and changed as normal.'
          : 'Checkout is paused. Nobody can buy or change a plan until you turn it back on.',
      );
      onAudit(next.enabled ? 'Re-opened plan checkout' : 'Paused plan checkout for maintenance');
    } catch (err) {
      setError(
        err instanceof Error && /permission/i.test(err.message)
          ? 'Firestore refused the write. The config/checkout rule may not be published yet.'
          : 'Could not save. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setEnabled(saved.enabled);
    setMessage(saved.message);
    setNote(null);
    setError(null);
  };

  return (
    <div className="glass-card rounded-xl p-5 md:p-6 mb-8">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <CreditCard size={16} className="text-emerald-400 shrink-0" aria-hidden />
          <h3 className="font-semibold text-text-primary">Plan checkout</h3>
        </div>
        {!loading && (
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${
              saved.enabled
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'bg-amber-500/15 text-amber-300'
            }`}
          >
            {saved.enabled ? 'Open' : 'Paused'}
          </span>
        )}
      </div>

      <p className="text-sm text-text-secondary leading-relaxed mb-4">
        Turn this off to stop selling while you fix something. New purchases and plan changes are
        both refused by the server, so it holds even if someone skips the pricing page. Existing
        subscribers keep their plan, and cancelling still works.
      </p>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-text-secondary">
          <Loader2 size={14} className="animate-spin" aria-hidden />
          Loading…
        </p>
      ) : (
        <>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled((v) => !v)}
            className="flex w-full items-center gap-3 rounded-lg border border-border/60 bg-bg-primary/40 p-3 text-left transition-colors hover:border-emerald-500/40 focus-ring"
          >
            <span
              aria-hidden
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                enabled ? 'bg-emerald-500' : 'bg-bg-tertiary border border-border/60'
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                  enabled ? 'left-[22px]' : 'left-0.5'
                }`}
              />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-text-primary">
                {enabled ? 'Selling plans' : 'Paused for maintenance'}
              </span>
              <span className="block text-xs text-text-secondary">
                {enabled
                  ? 'Everything works normally.'
                  : 'Buyers see the message below instead of a checkout.'}
              </span>
            </span>
          </button>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-xs font-medium text-text-secondary">
              Message shown while paused{' '}
              <span className="text-text-secondary/60">(optional)</span>
            </span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              maxLength={280}
              placeholder={DEFAULT_MAINTENANCE_MESSAGE}
              className="input-field w-full resize-y text-sm"
            />
          </label>

          {!enabled && (
            <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-300">
                Buyers will see
              </p>
              <p className="flex gap-2 text-sm text-text-secondary leading-relaxed">
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-400" aria-hidden />
                {maintenanceMessage({ enabled, message, updatedAt: '' })}
              </p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || !dirty}
              className="btn-primary text-sm px-4 py-2 disabled:opacity-50"
            >
              {busy ? 'Saving…' : enabled ? 'Save' : 'Pause checkout'}
            </button>
            {dirty && (
              <button
                type="button"
                onClick={reset}
                disabled={busy}
                className="btn-secondary text-sm px-4 py-2"
              >
                Discard
              </button>
            )}
            {saved.updatedAt && (
              <span className="ml-auto text-[11px] text-text-secondary">
                Last changed {new Date(saved.updatedAt).toLocaleString()}
              </span>
            )}
          </div>

          {note && <p className="mt-3 text-sm text-emerald-400">{note}</p>}
          {error && <p className="mt-3 text-sm text-loss-bright">{error}</p>}

          <p className="mt-3 text-[11px] text-text-secondary/70 leading-relaxed">
            Takes effect within about 30 seconds everywhere — the server caches this briefly so a
            checkout doesn&apos;t cost an extra database read.
          </p>
        </>
      )}
    </div>
  );
}
