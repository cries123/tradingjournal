import { Crown, Gem, Medal, Notebook } from 'lucide-react';
import { TIER_PLANS, type Tier } from '../../config/tiers';
import { useEntitlement } from '../../context/EntitlementContext';
import { useAuth } from '../../context/AuthContext';
import { goToPricing } from '../../utils/navigateToPath';

const TIER_ICON: Record<Tier, typeof Notebook> = {
  free: Notebook,
  silver: Medal,
  gold: Crown,
  diamond: Gem,
};

const TIER_TEXT: Record<Tier, string> = {
  free: 'text-text-secondary',
  silver: 'text-slate-300',
  gold: 'text-amber-300',
  diamond: 'text-sky-300',
};

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const remaining = Math.max(0, limit - used);
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const spent = remaining === 0;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="text-text-secondary">{label}</span>
        <span className={`tabular-nums font-medium ${spent ? 'text-loss-bright' : 'text-text-primary'}`}>
          {remaining} left
        </span>
      </div>
      <div className="mt-1 h-1 rounded-full bg-bg-tertiary overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] ${spent ? 'bg-loss' : 'bg-emerald-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * The plan strip in the sidebar: what you're on, and what's left of today.
 *
 * Both counters reset at midnight UTC and are the same numbers the server enforces, so this is
 * the honest answer to "why did my sync just get refused" rather than a guess the UI keeps
 * locally.
 */
export function PlanBadge() {
  const { user } = useAuth();
  const { tier, limits, usage, loaded, source, status } = useEntitlement();

  if (!user || !loaded) return null;

  const plan = TIER_PLANS[tier];
  const Icon = TIER_ICON[tier];
  const showSyncs = limits.syncsPerDay > 0;
  const showAi = limits.aiMessagesPerDay > 0;

  return (
    <div className="rounded-xl border border-border/70 bg-bg-tertiary/40 px-3 py-2.5 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${TIER_TEXT[tier]}`}>
          <Icon size={13} aria-hidden />
          {plan.name}
        </span>
        {tier !== 'diamond' && (
          <button
            type="button"
            onClick={goToPricing}
            className="text-[11px] font-medium text-emerald-400 hover:text-emerald-300 transition-colors focus-ring rounded"
          >
            Upgrade
          </button>
        )}
      </div>

      {status === 'past_due' && (
        <p className="text-[11px] text-loss-bright leading-snug">
          Your last payment didn&apos;t go through, so paid features are paused.
        </p>
      )}

      {showSyncs || showAi ? (
        <div className="space-y-2">
          {showSyncs && <Meter label="Broker syncs today" used={usage.syncsUsed} limit={limits.syncsPerDay} />}
          {showAi && <Meter label="AI messages today" used={usage.aiMessagesUsed} limit={limits.aiMessagesPerDay} />}
        </div>
      ) : (
        <p className="text-[11px] text-text-secondary leading-snug">
          Manual logging, unlimited. Add broker sync from $5/month.
        </p>
      )}

      {source === 'admin' && (
        <p className="text-[11px] text-text-secondary leading-snug">Granted to your account — nothing to pay.</p>
      )}
    </div>
  );
}
