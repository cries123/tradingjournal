import { Check, Layers, Lock } from 'lucide-react';
import { useSettings } from '../context/useSettings';
import { lowestTierWith, TIER_PLANS } from '../config/tiers';
import { goToPricing } from '../utils/navigateToPath';

/**
 * "All journals" in a journal picker: every journal added together on every screen.
 *
 * Shown only with more than one journal — with one there is nothing to add up. On a plan without
 * it, it is still shown, locked and naming the plan that has it, because "can I see Schwab and
 * Robinhood together" is the question somebody with two journals is about to ask, and the answer
 * should be on the control rather than nowhere.
 *
 * Two shapes for the two pickers: a row in the desktop sidebar, a chip in the phone switcher.
 */
export function AllJournalsOption({ variant, onPicked }: { variant: 'row' | 'chip'; onPicked?: () => void }) {
  const { settings, viewingAllJournals, canViewAllJournals, setViewAllJournals } = useSettings();
  if (settings.accounts.length < 2) return null;

  const plan = lowestTierWith('combinedJournals');
  const row = variant === 'row';

  if (!canViewAllJournals) {
    return (
      <button
        type="button"
        onClick={goToPricing}
        title={plan ? `Adding your journals together is on ${TIER_PLANS[plan].name} and up` : undefined}
        className={
          row
            ? 'w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left text-xs font-medium text-text-secondary/70 hover:text-text-primary hover:bg-bg-tertiary/80 border border-transparent transition-colors focus-ring'
            : 'inline-flex items-center gap-1.5 px-3 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium bg-bg-tertiary/40 text-text-secondary/70 border border-dashed border-border/60 hover:text-text-primary transition-colors focus-ring'
        }
      >
        <Lock size={12} className="shrink-0" aria-hidden />
        <span className="truncate">All journals</span>
        {plan && (
          <span className="ml-auto rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider bg-accent/10 text-accent">
            {TIER_PLANS[plan].name}
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setViewAllJournals(true);
        onPicked?.();
      }}
      aria-pressed={viewingAllJournals}
      className={
        row
          ? `w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left text-xs font-medium transition-colors focus-ring ${
              viewingAllJournals
                ? 'bg-accent/15 text-accent border border-accent/30'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/80 border border-transparent'
            }`
          : `inline-flex items-center gap-1.5 px-3 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium transition-all focus-ring ${
              viewingAllJournals
                ? 'bg-accent/15 text-accent border border-accent/35 shadow-sm shadow-accent/10'
                : 'bg-bg-tertiary/60 text-text-secondary border border-border/50 hover:text-text-primary hover:border-border'
            }`
      }
    >
      {viewingAllJournals ? <Check size={12} className="shrink-0" /> : <Layers size={12} className="shrink-0" aria-hidden />}
      <span className="truncate">All journals</span>
    </button>
  );
}

/** Where new trades go while every journal is shown together — said, so it is never a surprise. */
export function AllJournalsNote({ className = '' }: { className?: string }) {
  const { settings, viewingAllJournals } = useSettings();
  if (!viewingAllJournals) return null;
  const name = settings.accounts.find((a) => a.id === settings.activeAccountId)?.name;
  if (!name) return null;
  return <p className={`text-[10px] text-text-secondary/70 leading-snug ${className}`}>New trades go to {name}</p>;
}
