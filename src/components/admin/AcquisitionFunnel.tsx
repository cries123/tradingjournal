import { Building2, Eye, MonitorSmartphone, UserPlus } from 'lucide-react';
import type { AdminServerStats } from '../../services/adminStats';
import type { VisitorStats } from '../../services/visitorAnalytics';

interface AcquisitionFunnelProps {
  visitors: VisitorStats;
  serverStats: AdminServerStats | null;
  /** Accounts created inside the same 12-month window, so every stage measures one period. */
  annualSignups: number;
  visitorError: string | null;
  serverError: string | null;
}

interface Stage {
  key: string;
  label: string;
  hint: string;
  value: number;
  icon: React.ReactNode;
  accent: string;
  bar: string;
  /** Rendered instead of a percentage when the stage can't be measured. */
  unavailable?: string;
}

function pct(value: number, total: number): string {
  if (total <= 0) return '—';
  return `${((value / total) * 100).toFixed(1)}%`;
}

/**
 * The acquisition funnel: everyone who showed up, and how far each group got.
 *
 * Read left to right, each stage is a subset of the one before it, so the drop-off between two
 * bars is the thing worth looking at. The percentages are all relative to total visitors rather
 * than to the previous stage — stage-relative numbers look flattering and make it easy to lose
 * track of how few people made it through the whole thing.
 */
export function AcquisitionFunnel({
  visitors,
  serverStats,
  annualSignups,
  visitorError,
  serverError,
}: AcquisitionFunnelProps) {

  const stages: Stage[] = [
    {
      key: 'visitors',
      label: 'Visitors',
      hint: 'Unique logged-out browsers seen in the last 12 months',
      value: visitors.uniqueVisitors,
      icon: <Eye size={16} />,
      accent: 'text-cyan-400 bg-cyan-500/10',
      bar: 'bg-cyan-500/50',
    },
    {
      key: 'opened',
      label: 'Opened the journal',
      hint: 'Reached /app instead of only reading the marketing pages',
      value: visitors.openedApp,
      icon: <MonitorSmartphone size={16} />,
      accent: 'text-sky-400 bg-sky-500/10',
      bar: 'bg-sky-500/50',
    },
    {
      key: 'signups',
      label: 'Signed up',
      hint: 'Accounts created in the last 12 months',
      value: annualSignups,
      icon: <UserPlus size={16} />,
      accent: 'text-emerald-400 bg-emerald-500/10',
      bar: 'bg-emerald-500/50',
    },
    {
      key: 'broker',
      label: 'Connected a broker',
      hint: 'At least one linked brokerage account, right now',
      value: serverStats?.brokerConnectedCount ?? 0,
      icon: <Building2 size={16} />,
      accent: 'text-amber-400 bg-amber-500/10',
      bar: 'bg-amber-500/50',
      unavailable: serverStats ? undefined : 'Needs server stats',
    },
  ];

  const widthBase = Math.max(1, visitors.uniqueVisitors, annualSignups);

  return (
    <div className="glass-card rounded-xl p-5 md:p-6 mb-8">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
        <div>
          <h2 className="text-sm font-semibold">Acquisition funnel</h2>
          <p className="text-[10px] text-text-secondary mt-0.5">
            Rolling 12 months · percentages are of total visitors, not of the previous stage
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-text-secondary">Visitor → signup</p>
          <p className="text-sm font-semibold text-emerald-300">
            {pct(visitors.converted, visitors.uniqueVisitors)}
          </p>
        </div>
      </div>

      {(visitorError || serverError) && (
        <div className="mt-3 mb-1 space-y-1">
          {visitorError && <p className="text-xs text-amber-400">{visitorError}</p>}
          {serverError && <p className="text-xs text-amber-400">{serverError}</p>}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {stages.map((stage) => (
          <div key={stage.key}>
            <div className="flex items-center gap-2.5">
              <span className={`p-1.5 rounded-md shrink-0 ${stage.accent}`}>{stage.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xs font-medium text-text-primary">{stage.label}</span>
                  <span className="flex items-baseline gap-2 shrink-0">
                    <span className="text-sm font-bold tabular-nums">
                      {stage.unavailable ? '—' : stage.value.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-text-secondary tabular-nums w-12 text-right">
                      {stage.unavailable ?? pct(stage.value, visitors.uniqueVisitors)}
                    </span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-bg-primary/80 overflow-hidden mt-1">
                  <div
                    className={`h-full rounded-full ${stage.bar}`}
                    style={{ width: `${Math.min(100, (stage.value / widthBase) * 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-text-secondary mt-1">{stage.hint}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 pt-4 border-t border-border/50 grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-text-secondary">Using it locally</p>
          <p className="text-lg font-bold tabular-nums text-sky-300">
            {visitors.localOnlyUsers.toLocaleString()}
          </p>
          <p className="text-[10px] text-text-secondary mt-0.5">
            Opened the journal, never made an account
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-text-secondary">Visits · 12 months</p>
          <p className="text-lg font-bold tabular-nums text-text-primary">
            {visitors.visits.toLocaleString()}
          </p>
          <p className="text-[10px] text-text-secondary mt-0.5">
            One per browser per day, so returns count too
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-text-secondary">Last 7 days</p>
          <p className="text-lg font-bold tabular-nums text-cyan-300">
            {visitors.last7DaysVisitors.toLocaleString()}
          </p>
          <p className="text-[10px] text-text-secondary mt-0.5">
            {visitors.last7DaysSignups} signup{visitors.last7DaysSignups === 1 ? '' : 's'} ·{' '}
            {visitors.last7DaysConversionRate.toFixed(1)}% converted
          </p>
        </div>
      </div>
    </div>
  );
}
