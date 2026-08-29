import { Link2 } from 'lucide-react';
import type { AdminServerStats } from '../../services/adminStats';

interface BrokerAdoptionPanelProps {
  serverStats: AdminServerStats | null;
  serverError: string | null;
}

/**
 * Who actually linked a brokerage, and to whom.
 *
 * The three numbers are a funnel of their own: opening the connect flow issues SnapTrade
 * credentials (registered), completing it links accounts (connected), and the gap between them
 * is people who bailed partway through — usually the most actionable number on this panel,
 * since it's the step where a broker-specific bug would show up.
 */
export function BrokerAdoptionPanel({ serverStats, serverError }: BrokerAdoptionPanelProps) {
  if (!serverStats) {
    return (
      <div className="glass-card rounded-xl p-5 md:p-6">
        <div className="flex items-center gap-2 mb-3">
          <Link2 size={16} className="text-amber-400" />
          <h2 className="text-sm font-semibold">Broker connections</h2>
        </div>
        <p className="text-xs text-text-secondary">
          {serverError ??
            'Set FIREBASE_SERVICE_ACCOUNT_JSON on Netlify to read broker connection stats.'}
        </p>
      </div>
    );
  }

  const {
    brokerRegisteredCount,
    brokerConnectedCount,
    brokerAccountCount,
    brokerAbandonedCount,
    brokerInstitutions,
    authUserCount,
  } = serverStats;

  const share = authUserCount > 0 ? (brokerConnectedCount / authUserCount) * 100 : 0;
  const maxInstitution = Math.max(1, ...brokerInstitutions.map((b) => b.users));

  return (
    <div className="glass-card rounded-xl p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Link2 size={16} className="text-amber-400" />
          <div>
            <h2 className="text-sm font-semibold">Broker connections</h2>
            <p className="text-[10px] text-text-secondary mt-0.5">
              Recorded whenever a user&apos;s connection status is checked
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold tabular-nums text-amber-300">{share.toFixed(1)}%</p>
          <p className="text-[10px] text-text-secondary">of signed-up users</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-bg-tertiary/50 border border-border/40 px-3 py-2.5">
          <p className="text-[9px] uppercase tracking-wide text-text-secondary">Connected</p>
          <p className="text-xl font-bold tabular-nums text-emerald-400 mt-0.5">
            {brokerConnectedCount.toLocaleString()}
          </p>
          <p className="text-[10px] text-text-secondary mt-0.5">
            {brokerAccountCount} account{brokerAccountCount === 1 ? '' : 's'} total
          </p>
        </div>
        <div className="rounded-lg bg-bg-tertiary/50 border border-border/40 px-3 py-2.5">
          <p className="text-[9px] uppercase tracking-wide text-text-secondary">Started setup</p>
          <p className="text-xl font-bold tabular-nums mt-0.5">
            {brokerRegisteredCount.toLocaleString()}
          </p>
          <p className="text-[10px] text-text-secondary mt-0.5">Opened the connect flow</p>
        </div>
        <div className="rounded-lg bg-bg-tertiary/50 border border-border/40 px-3 py-2.5">
          <p className="text-[9px] uppercase tracking-wide text-text-secondary">Dropped off</p>
          <p
            className={`text-xl font-bold tabular-nums mt-0.5 ${
              brokerAbandonedCount > 0 ? 'text-amber-400' : 'text-text-primary'
            }`}
          >
            {brokerAbandonedCount.toLocaleString()}
          </p>
          <p className="text-[10px] text-text-secondary mt-0.5">Started, never linked</p>
        </div>
      </div>

      {brokerInstitutions.length > 0 ? (
        <div className="mt-5 pt-4 border-t border-border/50">
          <p className="text-[10px] uppercase tracking-wider text-text-secondary mb-2.5">
            Which brokers they use
          </p>
          <ul className="space-y-2">
            {brokerInstitutions.slice(0, 8).map((broker) => (
              <li key={broker.name} className="flex items-center gap-2.5">
                <span className="text-xs text-text-primary w-32 shrink-0 truncate">
                  {broker.name}
                </span>
                <div className="flex-1 h-1.5 rounded-full bg-bg-primary/80 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-500/50"
                    style={{ width: `${(broker.users / maxInstitution) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-medium tabular-nums w-8 text-right shrink-0">
                  {broker.users}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-[11px] text-text-secondary mt-4 pt-4 border-t border-border/50">
          No linked brokerages recorded yet. This fills in as users open the Connect Broker page —
          it reflects connection checks, so a user who linked before this tracking shipped appears
          the next time they load that page.
        </p>
      )}
    </div>
  );
}
