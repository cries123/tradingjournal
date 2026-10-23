import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, CalendarPlus, Copy, ExternalLink, Gift } from 'lucide-react';
import { PAID_TIERS, TIER_ORDER, TIER_PLANS, type Tier } from '../../config/tiers';
import {
  compIsLive,
  EXTENSION_PRESET_DAYS,
  extensionEndsAt,
  higherTier,
  validCalendarDate,
} from '../../config/accessExtension';
import { billingTierOf, fetchUserEntitlement, type AdminEntitlementView } from '../../services/adminEntitlements';
import {
  adminClearAccessExtension,
  adminClearUserTierGrant,
  adminExtendAccess,
  adminSetUserTier,
} from '../../services/adminUserManagement';

type PlanAudit =
  | 'user.tier-granted'
  | 'user.tier-grant-cleared'
  | 'user.access-extended'
  | 'user.access-extension-ended';

interface AdminUserPlanSectionProps {
  uid: string;
  onDone: (message: string) => void;
  onError: (message: string) => void;
  onAudit: (action: PlanAudit, detail: string) => void;
}

/** A Creem id with a copy button: the dashboard search wants it pasted, not typed. */
function CopyId({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // No clipboard (an insecure context, or a browser that asks): the id is on screen to select.
    }
  };
  return (
    <button
      type="button"
      onClick={() => void copy()}
      title={`Copy the ${label} id`}
      className="inline-flex items-center gap-1 rounded px-1 font-mono text-[10px] hover:text-text-primary focus-ring"
    >
      <Copy size={10} aria-hidden />
      {label} {value}
      {copied && <span className="text-accent font-sans">copied</span>}
    </button>
  );
}

function day(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function describe(record: AdminEntitlementView | null, now: number): string {
  if (!record) return 'Free — never paid, never granted.';
  const name = TIER_PLANS[record.tier].name;
  if (record.source === 'admin' && record.tier === 'free') {
    // Set before Free stopped being grantable. It does nothing but mark the account, so say how to undo it.
    return 'Set to Free by hand. Remove the grant to hand the account back to billing.';
  }
  if (record.source === 'admin') return `${name}, granted by hand. Billing can't override it.`;
  if (record.tier === 'free') return 'Free — nothing paid for.';
  if (record.status === 'active') {
    /*
     * A trial reads as an ordinary active subscription — creemClient maps 'trialing' to active so
     * that a triallist passes every gate a subscriber passes — so without this line the panel said
     * "paid subscription — renews" about somebody who has never been charged, on the screen that
     * exists to answer exactly that question.
     */
    if (record.trialEndsAt && Date.parse(record.trialEndsAt) > now) {
      return `${name}, free trial — first charge ${day(record.trialEndsAt)}. Nothing collected yet.`;
    }
    return record.currentPeriodEnd
      ? `${name}, paid subscription — renews ${day(record.currentPeriodEnd)}.`
      : `${name}, paid subscription.`;
  }
  if (record.status === 'canceled') {
    return record.currentPeriodEnd
      ? `${name}, cancelled — runs until ${day(record.currentPeriodEnd)}.`
      : `${name}, cancelled.`;
  }
  return `${name}, ${record.status.replace('_', ' ')} — currently treated as Free.`;
}

/**
 * The plan, from the admin panel: what they have, a permanent grant, and time-limited extras.
 *
 * Two different tools on purpose. A grant is written with source 'admin' and billing webhooks
 * refuse to touch it — that's grandfathering, and it has no end date. An extension is
 * complimentary access until a date, on top of whatever billing says: a month for a bug that
 * cost someone their syncs, a trial for someone who asked nicely. Creem keeps its own billing
 * date either way, so "extend" never means "don't charge them" — it means "don't cut them off".
 */
export function AdminUserPlanSection({ uid, onDone, onError, onAudit }: AdminUserPlanSectionProps) {
  const [record, setRecord] = useState<AdminEntitlementView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Tier | 'clear' | 'extend' | 'end-comp' | null>(null);

  const [extendTier, setExtendTier] = useState<Tier | null>(null);
  const [days, setDays] = useState<number>(30);
  const [untilDate, setUntilDate] = useState('');
  const [reason, setReason] = useState('');
  // Read once when the section opens. The modal lives for seconds, and a clock that ticks during
  // render is exactly what the purity rule is there to stop.
  const [now] = useState(() => Date.now());

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

  /*
   * The plan to light: what the subscription or grant gives them TODAY (a grant is always active).
   *
   * This lit `record.tier`, which is the plan on the subscription whether or not it is still running —
   * so an expired Silver trial showed Silver lit beside "Silver, expired — currently treated as Free",
   * and read as somebody who still had Silver.
   */
  const currentTier: Tier = billingTierOf(record, now);
  const liveComp = record && compIsLive(record.comp, now) ? record.comp : null;
  const effective = higherTier(billingTierOf(record, now), liveComp?.tier ?? 'free');
  const permanent = record?.source === 'admin' && record.tier !== 'free';

  /* Defaults to the plan they already have, so "extend" extends rather than changes — and to
     the comp's own tier while one is running, since the server refuses to step it down. */
  const chosenTier: Tier = extendTier ?? (liveComp?.tier ?? (effective === 'free' ? 'silver' : effective));

  const preview = useMemo(() => {
    const date = validCalendarDate(untilDate);
    if (untilDate && !date) return null;
    if (date) return `${date}T23:59:59`;
    return extensionEndsAt(record, now, days);
  }, [record, days, untilDate, now]);

  const reload = async () => setRecord(await fetchUserEntitlement(uid));

  const grant = async (tier: Tier) => {
    setBusy(tier);
    try {
      const { message } = await adminSetUserTier(uid, tier);
      await reload();
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
      await reload();
      onDone(message);
      onAudit('user.tier-grant-cleared', message);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not remove the grant');
    } finally {
      setBusy(null);
    }
  };

  const extend = async () => {
    setBusy('extend');
    try {
      const date = untilDate ? validCalendarDate(untilDate) : null;
      if (untilDate && !date) {
        onError('The date has to be YYYY-MM-DD');
        return;
      }
      const { message } = await adminExtendAccess(uid, {
        tier: chosenTier,
        ...(date ? { until: date } : { days }),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      await reload();
      onDone(message);
      onAudit('user.access-extended', `${message}${reason.trim() ? ` — ${reason.trim()}` : ''}`);
      setReason('');
      setUntilDate('');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not extend their access');
    } finally {
      setBusy(null);
    }
  };

  const endComp = async () => {
    setBusy('end-comp');
    try {
      const { message } = await adminClearAccessExtension(uid);
      await reload();
      onDone(message);
      onAudit('user.access-extension-ended', message);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not end the complimentary access');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="border-t border-border/50 pt-5 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">Plan</p>

      <p className="text-sm text-text-secondary flex items-start gap-2">
        {record?.source === 'admin' && (
          <BadgeCheck size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden />
        )}
        <span>{loading ? 'Checking…' : describe(record, now)}</span>
      </p>

      {/* Creem's own ids, one click from a refund or a plan check in its dashboard. Creem has no
          deep link by id that this app can rely on, so the id is copied and the customers page
          opened — two actions, but no search. */}
      {(record?.creemCustomerId || record?.creemSubscriptionId) && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-secondary">
          <a
            href="https://www.creem.io/dashboard/customers"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-accent hover:underline focus-ring rounded"
          >
            <ExternalLink size={11} aria-hidden />
            Open in Creem
          </a>
          {record?.creemCustomerId && <CopyId label="customer" value={record.creemCustomerId} />}
          {record?.creemSubscriptionId && <CopyId label="subscription" value={record.creemSubscriptionId} />}
        </p>
      )}

      {liveComp && (
        <p className="text-sm text-accent flex items-start gap-2">
          <Gift size={15} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            Plus {TIER_PLANS[liveComp.tier].name} on the house until {day(liveComp.until)}
            {liveComp.reason ? ` — “${liveComp.reason}”` : ''}.
            {effective !== liveComp.tier && ` They already have ${TIER_PLANS[effective].name}, so this is standing by.`}
          </span>
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {TIER_ORDER.map((tier) => {
          const active = !loading && tier === currentTier;
          // Free is shown, never granted: see the note under the grid, and handleSetTier.
          const grantable = tier !== 'free';
          return (
            <button
              key={tier}
              type="button"
              disabled={loading || busy !== null || active || !grantable}
              title={grantable || active ? undefined : 'Free is not granted by hand'}
              onClick={() => void grant(tier)}
              className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
                active
                  ? 'border-accent/50 bg-accent/10 text-accent'
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
        The lit plan is what they can use today. Granting a paid plan here overrides billing and
        survives webhooks — that&apos;s how someone gets grandfathered in, with no end date. Remove the
        grant to hand the account back to whatever they actually pay for. Free is never granted by
        hand, because it would stop them buying later: to end a paid plan, cancel it in Creem.
      </p>

      {/* ---------------------------------------------------------------- extend */}
      <div className="rounded-lg border border-border/60 bg-bg-tertiary/30 p-3 space-y-3">
        <p className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
          <CalendarPlus size={13} className="text-accent" aria-hidden />
          Extend access
        </p>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Plan to extend">
          {PAID_TIERS.map((tier) => (
            <button
              key={tier}
              type="button"
              disabled={busy !== null || loading}
              onClick={() => setExtendTier(tier)}
              className={`rounded-md border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                chosenTier === tier
                  ? 'border-accent/50 bg-accent/10 text-accent'
                  : 'border-border text-text-secondary hover:text-text-primary'
              }`}
            >
              {TIER_PLANS[tier].name}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="How long">
          {EXTENSION_PRESET_DAYS.map((preset) => (
            <button
              key={preset}
              type="button"
              disabled={busy !== null || loading}
              onClick={() => {
                setDays(preset);
                setUntilDate('');
              }}
              className={`rounded-md border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                !untilDate && days === preset
                  ? 'border-accent/50 bg-accent/10 text-accent'
                  : 'border-border text-text-secondary hover:text-text-primary'
              }`}
            >
              +{preset} days
            </button>
          ))}
          <label className="flex items-center gap-1.5 text-[11px] text-text-secondary ml-auto">
            or until
            <input
              type="date"
              value={untilDate}
              onChange={(e) => setUntilDate(e.target.value)}
              className="input-field text-xs py-1 px-2 w-[9.5rem]"
              aria-label="Until date"
            />
          </label>
        </div>

        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={200}
          placeholder="Why (optional) — shows in the audit trail"
          className="input-field text-xs w-full"
          aria-label="Reason"
        />

        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-text-secondary leading-snug">
            {preview
              ? <>→ {TIER_PLANS[chosenTier].name} until <span className="text-text-primary">{day(preview)}</span></>
              : 'Pick a valid date.'}
            {permanent && ' (already granted for good — this changes nothing)'}
          </p>
          <button
            type="button"
            disabled={busy !== null || loading || !preview}
            onClick={() => void extend()}
            className="btn-secondary px-3 py-1.5 text-xs shrink-0 disabled:opacity-50"
          >
            {busy === 'extend' ? 'Saving…' : 'Extend'}
          </button>
        </div>

        {liveComp && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void endComp()}
            className="text-xs text-text-secondary hover:text-loss-bright transition-colors disabled:opacity-50"
          >
            {busy === 'end-comp' ? 'Ending…' : 'End the complimentary access now'}
          </button>
        )}

        <p className="text-[11px] text-text-secondary/80 leading-relaxed">
          Time is added on top of what they&apos;ve paid for, and the plan keeps working past the paid
          period even if the card fails or they cancel. It doesn&apos;t change what Creem bills — to
          actually skip a charge for a paying customer, do that in Creem.
        </p>
      </div>
    </div>
  );
}
