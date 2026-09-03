import { Crown, Gem, Medal, Notebook } from 'lucide-react';
import { TIER_PLANS, type Tier } from '../../config/tiers';
import { useEntitlement } from '../../context/useEntitlement';
import { useAuth } from '../../context/useAuth';
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

function Meter({ label, used, limit, bonus = 0 }: { label: string; used: number; limit: number; bonus?: number }) {
  const remaining = Math.max(0, limit - used);
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  // Bonus units are spent only once the day's allowance is gone, so the day is not "spent" while
  // any remain — but the bar still shows the plan's own allowance, which is what resets tonight.
  const spent = remaining === 0 && bonus === 0;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="text-text-secondary">{label}</span>
        <span className={`tabular-nums font-medium ${spent ? 'text-loss-bright' : 'text-text-primary'}`}>
          {remaining} left
          {bonus > 0 && <span className="text-emerald-400 font-normal"> +{bonus} bonus</span>}
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
 * Says when the counters go back to full, in the reader's own clock.
 *
 * "3 left" with no reset time is how someone spends two syncs in the evening, finds three again an
 * hour later, and reasonably concludes the counter is broken. Formatted locally rather than as a
 * fixed "midnight ET" string, so a trader in Denver reads 10pm and one in London reads 5am.
 */
function resetLabel(resetsAt: string | undefined): string | null {
  if (!resetsAt) return null;
  const at = new Date(resetsAt);
  if (Number.isNaN(at.getTime())) return null;
  const time = at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const today = at.toDateString() === new Date().toDateString();
  return today ? `Resets at ${time}` : `Resets tomorrow at ${time}`;
}

/**
 * The plan strip in the sidebar: what you're on, and what's left of today.
 *
 * Both counters reset at midnight US Eastern — the market day, not the UTC day, which used to roll
 * over at 8pm in New York — and they are the same numbers the server enforces, so this is the
 * honest answer to "why did my sync just get refused" rather than a guess the UI keeps locally.
 */
export function PlanBadge() {
  const { user } = useAuth();
  const { tier, limits, usage, loaded, source, status, complimentaryUntil } = useEntitlement();

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
          {showSyncs && (
            <Meter label="Broker syncs today" used={usage.syncsUsed} limit={limits.syncsPerDay} bonus={usage.syncCredits ?? 0} />
          )}
          {showAi && (
            <Meter label="AI messages today" used={usage.aiMessagesUsed} limit={limits.aiMessagesPerDay} bonus={usage.aiCredits ?? 0} />
          )}
          {/* Only once something has actually been spent — on a full allowance the reset time is
              noise, and this strip is already the densest thing in the sidebar. */}
          {resetLabel(usage.resetsAt) && (usage.syncsUsed > 0 || usage.aiMessagesUsed > 0) && (
            <p className="text-[10px] text-text-secondary/70 leading-snug pt-0.5">
              {resetLabel(usage.resetsAt)}
            </p>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-text-secondary leading-snug">
          Manual logging, unlimited. Add broker sync from $5/month.
        </p>
      )}

      {source === 'admin' && (
        <p className="text-[11px] text-text-secondary leading-snug">Granted to your account — nothing to pay.</p>
      )}
      {source === 'comp' && complimentaryUntil && (
        <p className="text-[11px] text-text-secondary leading-snug">
          On us until {new Date(complimentaryUntil).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} — nothing to pay.
        </p>
      )}
    </div>
  );
}
