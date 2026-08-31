import { useEffect, useState } from 'react';
import { BadgeCheck } from 'lucide-react';
import { TIER_ORDER, TIER_PLANS, type Tier } from '../../config/tiers';
import { fetchUserEntitlement, type AdminEntitlementView } from '../../services/adminEntitlements';
import { adminClearUserTierGrant, adminSetUserTier } from '../../services/adminUserManagement';

interface AdminUserPlanSectionProps {
  uid: string;
  onDone: (message: string) => void;
  onError: (message: string) => void;
  onAudit: (action: 'user.tier-granted' | 'user.tier-grant-cleared', detail: string) => void;
}

function describe(record: AdminEntitlementView | null): string {
  if (!record) return 'Free — never paid, never granted.';
  const name = TIER_PLANS[record.tier].name;
  if (record.source === 'admin') return `${name}, granted by hand. Billing can't override it.`;
  if (record.status === 'active') return `${name}, paid subscription.`;
  if (record.status === 'canceled') {
    return record.currentPeriodEnd
      ? `${name}, cancelled — runs until ${new Date(record.currentPeriodEnd).toLocaleDateString()}.`
      : `${name}, cancelled.`;
  }
  return `${name}, ${record.status.replace('_', ' ')} — currently treated as Free.`;
}

/**
 * Grandfathering, from the admin panel.
 *
 * A grant is deliberately distinct from a purchase: it's written with source 'admin' and billing
 * webhooks refuse to touch it, so giving someone Diamond doesn't get quietly undone the next time
 * Creem sends an event about a subscription they don't have.
 */
export function AdminUserPlanSection({ uid, onDone, onError, onAudit }: AdminUserPlanSectionProps) {
  const [record, setRecord] = useState<AdminEntitlementView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Tier | 'clear' | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Clearing state before the fetch or subscription below. This is the external-system sync
    // the rule's own guidance describes as a legitimate effect; the alternative is tracking which
    // request each piece of state belongs to, through auth, settings and trades, to satisfy a lint
    // rule rather than to fix a bug.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    void fetchUserEntitlement(uid)
      .then((r) => {
        if (!cancelled) setRecord(r);
      })
      .catch(() => {
        if (!cancelled) setRecord(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const currentTier: Tier = record?.tier ?? 'free';

  const grant = async (tier: Tier) => {
    setBusy(tier);
    try {
      const { message } = await adminSetUserTier(uid, tier);
      setRecord(await fetchUserEntitlement(uid));
      onDone(message);
      onAudit('user.tier-granted', `${TIER_PLANS[tier].name} granted`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not change the plan');
    } finally {
      setBusy(null);
    }
  };

  const clear = async () => {
    setBusy('clear');
    try {
      const { message } = await adminClearUserTierGrant(uid);
      setRecord(await fetchUserEntitlement(uid));
      onDone(message);
      onAudit('user.tier-grant-cleared', message);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not remove the grant');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="border-t border-border/50 pt-5 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">Plan</p>

      <p className="text-sm text-text-secondary flex items-start gap-2">
        {record?.source === 'admin' && (
          <BadgeCheck size={15} className="mt-0.5 shrink-0 text-emerald-400" aria-hidden />
        )}
        <span>{loading ? 'Checking…' : describe(record)}</span>
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {TIER_ORDER.map((tier) => {
          const active = !loading && tier === currentTier;
          return (
            <button
              key={tier}
              type="button"
              disabled={loading || busy !== null || active}
              onClick={() => void grant(tier)}
              className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
                active
                  ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300'
                  : 'border-border text-text-secondary hover:text-text-primary hover:border-slate-500 disabled:opacity-50'
              }`}
            >
              {busy === tier ? '…' : TIER_PLANS[tier].name}
            </button>
          );
        })}
      </div>

      {record?.source === 'admin' && (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void clear()}
          className="text-xs text-text-secondary hover:text-loss-bright transition-colors disabled:opacity-50"
        >
          {busy === 'clear' ? 'Removing…' : 'Remove the manual grant'}
        </button>
      )}

      <p className="text-[11px] text-text-secondary/80 leading-relaxed">
        Granting a plan here overrides billing and survives webhooks — that&apos;s how someone gets
        grandfathered in. Remove the grant to hand the account back to whatever they actually pay for.
      </p>
    </div>
  );
}
