import { Sparkles } from 'lucide-react';
import { TRIAL_DAYS, TRIAL_TIER } from '../../config/trial';
import { TIER_PLANS } from '../../config/tiers';
import type { TrialStats } from '../../utils/adminRisk';

interface TrialFunnelPanelProps {
  stats: TrialStats;
  /** False while the entitlement map is still loading — a zero funnel would be a claim, not a count. */
  loaded: boolean;
}

/**
 * What fraction of trials turn into customers.
 *
 * The acquisition funnel beside this one runs Visitors → Opened → Signed up → Connected a broker and
 * stops there, one stage short of the only transition that earns anything. The number was not merely
 * missing, it was uncomputable: a trialling subscription is `status: active` on a paid tier, exactly
 * like a paying one, until the webhook started writing the trial's dates down.
 *
 * Which is also the caveat this panel has to carry on its face. It can only see trials that started
 * after that shipped, so for the first few weeks a small "started" is the instrumentation catching
 * up, not a collapse in signups.
 */
export function TrialFunnelPanel({ stats, loaded }: TrialFunnelPanelProps) {
  const plan = TIER_PLANS[TRIAL_TIER];

  return (
    <div className="panel-card rounded-xl p-5 md:p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
          <Sparkles size={18} />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          Trial conversion
        </p>
      </div>

      {!loaded ? (
        <>
          <div className="h-9 w-24 animate-pulse rounded bg-bg-tertiary/60" />
          <div className="mt-2 h-3 w-40 animate-pulse rounded bg-bg-tertiary/40" />
        </>
      ) : (
        <>
          <p className="text-3xl font-bold tracking-tight tabular-nums">
            {/* Null, not zero. A 0% on the day the first trial starts reads as "nobody ever
                converts", which is a different and much worse claim than "nothing has finished". */}
            {stats.conversionRate === null ? '—' : `${Math.round(stats.conversionRate)}%`}
          </p>
          <p className="mt-2 text-xs text-text-secondary">
            {stats.conversionRate === null
              ? `No trial has finished yet. ${stats.live} running.`
              : `${stats.converted} of ${stats.converted + stats.lapsed} finished trials went on to pay`}
          </p>

          <dl className="mt-3 space-y-0.5 border-t border-border/40 pt-2.5 text-[11px] tabular-nums text-text-secondary">
            <div className="flex justify-between">
              <dt>Started</dt>
              <dd>{stats.started}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Running now</dt>
              <dd className="text-text-primary">{stats.live}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Converted</dt>
              <dd className="text-emerald-400">{stats.converted}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Ended without paying</dt>
              <dd>{stats.lapsed}</dd>
            </div>
          </dl>

          <p className="mt-2.5 text-[10px] leading-relaxed text-text-secondary/80">
            {TRIAL_DAYS}-day {plan.name} trial, card taken at checkout. Counts trials recorded since
            the webhook started storing their dates; anything older is invisible to this.
          </p>
        </>
      )}
    </div>
  );
}
