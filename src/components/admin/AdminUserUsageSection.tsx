import { useState } from 'react';
import { Coins, TimerReset } from 'lucide-react';
import { TIER_PLANS } from '../../config/tiers';
import {
  adminAdjustCredits,
  adminResetUsageToday,
  type CreditKind,
  type UserUsage,
} from '../../services/adminUserManagement';

type UsageAudit = 'user.usage-reset' | 'user.credits-adjusted';

interface AdminUserUsageSectionProps {
  uid: string;
  usage: UserUsage | null;
  onChanged: () => Promise<void>;
  onDone: (message: string) => void;
  onError: (message: string) => void;
  onAudit: (action: UsageAudit, detail: string) => void;
}

const KINDS: { kind: CreditKind; label: string; plural: string }[] = [
  { kind: 'sync', label: 'Broker syncs', plural: 'syncs' },
  { kind: 'ai', label: 'AI messages', plural: 'messages' },
];

const QUICK_ADDS = [1, 3, 5, 10];

/**
 * Today's meters and the credit bank, with the two things an admin can do about them.
 *
 * "Give back today's" is for the person whose syncs were eaten by a bug: it forgives what was
 * spent, and the record of the calls stays for the cost report. Credits are for "have a few on
 * us": they sit outside the daily cap and are only spent once it is reached, so they never
 * expire at midnight.
 */
export function AdminUserUsageSection({ uid, usage, onChanged, onDone, onError, onAudit }: AdminUserUsageSectionProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [custom, setCustom] = useState<Record<CreditKind, string>>({ sync: '', ai: '' });

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'That did not go through');
    } finally {
      setBusy(null);
    }
  };

  const giveBack = (kind: CreditKind, plural: string) =>
    run(`reset-${kind}`, async () => {
      const { message, given } = await adminResetUsageToday(uid, kind);
      onDone(message);
      if (given > 0) onAudit('user.usage-reset', `${given} ${plural}`);
    });

  const adjust = (kind: CreditKind, delta: number, plural: string) =>
    run(`credits-${kind}-${delta}`, async () => {
      const { message, balance } = await adminAdjustCredits(uid, kind, delta);
      onDone(message);
      onAudit('user.credits-adjusted', `${delta > 0 ? '+' : ''}${delta} ${plural} (now ${balance} banked)`);
      setCustom((prev) => ({ ...prev, [kind]: '' }));
    });

  return (
    <div className="border-t border-border/50 pt-5 space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">Today &amp; credits</p>

      {usage === null ? (
        <p className="text-sm text-text-secondary">Loading…</p>
      ) : (
        KINDS.map(({ kind, label, plural }) => {
          const today = usage.today[kind];
          const banked = usage.credits[kind];
          const included = today.limit > 0;
          const customValue = Number.parseInt(custom[kind], 10);
          const customOk = Number.isInteger(customValue) && customValue !== 0;

          return (
            <div key={kind} className="rounded-lg border border-border/60 bg-bg-tertiary/30 p-3 space-y-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium text-text-primary">{label}</p>
                <p className="text-xs text-text-secondary tabular-nums">
                  {included ? (
                    <>
                      <span className={today.used >= today.limit ? 'text-loss-bright' : 'text-text-primary'}>
                        {today.used} of {today.limit}
                      </span>{' '}
                      used today
                      {today.bonus > 0 && <> · {today.bonus} from credits</>}
                      {today.forgiven > 0 && <> · {today.forgiven} given back</>}
                    </>
                  ) : (
                    <>Not in {TIER_PLANS[usage.tier].name}</>
                  )}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy !== null || !included || today.used === 0}
                  onClick={() => void giveBack(kind, plural)}
                  title={today.used === 0 ? 'Nothing spent today' : `Forgive today's ${today.used} ${plural}`}
                  className="inline-flex items-center gap-1.5 btn-secondary px-2.5 py-1.5 text-xs disabled:opacity-50"
                >
                  <TimerReset size={13} aria-hidden />
                  {busy === `reset-${kind}` ? 'Giving back…' : "Give back today's"}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-xs text-text-secondary mr-1">
                  <Coins size={13} className="text-amber-300" aria-hidden />
                  <span className="text-text-primary font-medium tabular-nums">{banked}</span> banked
                </span>
                {QUICK_ADDS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={busy !== null || !included}
                    onClick={() => void adjust(kind, n, plural)}
                    className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-text-secondary hover:text-text-primary hover:border-slate-500 transition-colors disabled:opacity-50"
                  >
                    +{n}
                  </button>
                ))}
                <input
                  type="number"
                  inputMode="numeric"
                  value={custom[kind]}
                  onChange={(e) => setCustom((prev) => ({ ...prev, [kind]: e.target.value }))}
                  placeholder="±n"
                  disabled={busy !== null || !included}
                  className="input-field text-xs py-1 px-2 w-16"
                  aria-label={`Custom ${plural} credits`}
                />
                <button
                  type="button"
                  disabled={busy !== null || !included || !customOk}
                  onClick={() => void adjust(kind, customValue, plural)}
                  className="btn-secondary px-2.5 py-1 text-[11px] disabled:opacity-50"
                >
                  {customOk && customValue < 0 ? 'Remove' : 'Add'}
                </button>
              </div>

              {!included && (
                <p className="text-[11px] text-text-secondary/80 leading-relaxed">
                  Credits only work for plans that include this. Extend or grant a plan first.
                </p>
              )}
            </div>
          );
        })
      )}

      <p className="text-[11px] text-text-secondary/80 leading-relaxed">
        Giving back today&apos;s allowance forgives what they spent; the calls still count in costs.
        Credits sit outside the daily cap, are spent only once it&apos;s reached, and never expire.
      </p>
    </div>
  );
}
