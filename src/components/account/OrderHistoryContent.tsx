import { useEffect, useState } from 'react';
import { Receipt } from 'lucide-react';
import { fetchOrderHistory, type OrderHistory } from '../../services/account';
import { AccountPanel, AccountScreen } from './AccountScreen';

interface OrderHistoryContentProps {
  onBack: () => void;
}

function formatDate(iso: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return '—';
  return new Date(parsed).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Every charge, read from the ledger the payment webhook writes.
 *
 * Not fetched from Creem on demand. The ledger is written once per payment event as it happens, so
 * this list survives a Creem outage, does not depend on their API staying the shape it is, and
 * costs nothing to open. It also means the number here is what we actually recorded taking, which
 * is the number worth showing somebody who is asking because they think we charged them twice.
 */
export function OrderHistoryContent({ onBack }: OrderHistoryContentProps) {
  const [history, setHistory] = useState<OrderHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchOrderHistory()
      .then((result) => {
        if (live) setHistory(result);
      })
      .catch((err: unknown) => {
        if (live) setError(err instanceof Error ? err.message : 'Could not load your orders.');
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <AccountScreen
      title="Order history"
      subtitle="Every payment we have taken, newest first."
      onBack={onBack}
    >
      <AccountPanel title="Payments">
        {error && <p className="text-sm text-red-400">{error}</p>}

        {!error && !history && <p className="text-sm text-text-secondary">Loading…</p>}

        {history && history.entries.length === 0 && (
          <div className="flex items-start gap-3 text-sm text-text-secondary">
            <Receipt size={18} className="mt-0.5 shrink-0" aria-hidden />
            <p>
              Nothing here yet — we have never charged you. Anything you paid for will appear on
              this page the moment it goes through.
            </p>
          </div>
        )}

        {history && history.entries.length > 0 && (
          <>
            {/* Scrolls inside its own box: a year of Diamond is twelve rows, but a long-running
                account with plan changes will eventually be longer than the panel. */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-text-secondary">
                    <th className="pb-2 font-medium">Date</th>
                    <th className="pb-2 font-medium">Plan</th>
                    <th className="pb-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {history.entries.map((entry) => (
                    <tr key={entry.id} className="border-t border-border/50">
                      <td className="py-2.5 whitespace-nowrap">{formatDate(entry.at)}</td>
                      <td className="py-2.5">{entry.planName}</td>
                      <td className="py-2.5 text-right tabular-nums">${entry.amount}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border">
                    <td className="pt-2.5 font-medium" colSpan={2}>
                      Total paid
                    </td>
                    <td className="pt-2.5 text-right font-semibold tabular-nums">
                      ${history.total}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <p className="text-xs text-text-secondary">
              Need an invoice or a receipt? They live on your billing page, under Subscription.
            </p>
          </>
        )}
      </AccountPanel>
    </AccountScreen>
  );
}
