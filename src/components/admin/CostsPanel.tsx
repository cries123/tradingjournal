import { AlertTriangle, TrendingDown } from 'lucide-react';
import { TIER_PLANS, PAID_TIERS } from '../../config/tiers';
import { worstCaseMonthlyCost } from '../../config/costs';
import type { CostReport } from '../../services/adminCosts';

interface CostsPanelProps {
  report: CostReport | null;
  error: string | null;
}

function money(value: number): string {
  return value < 0.01 && value > 0 ? '<$0.01' : `$${value.toFixed(2)}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * What the product costs to run, month by month.
 *
 * Reconstructed from the daily usage counters, which were never deleted — so this reaches back to
 * whenever the meters started, without anything having been instrumented for it in advance.
 *
 * Everything is labelled as an estimate, everywhere, on purpose. These are published rates applied
 * to real counts, not a reconciliation of invoices, and the moment somebody forgets that they will
 * make a pricing decision against a number that was never a bill.
 */
export function CostsPanel({ report, error }: CostsPanelProps) {
  if (error || !report) {
    return (
      <div className="glass-card rounded-xl p-8 text-center text-sm text-text-secondary">
        {error ?? 'No cost data yet.'}
      </div>
    );
  }

  const current = report.months.find((m) => m.partial);
  const collected = current?.counts.revenue ?? 0;
  const spend = current?.breakdown.total ?? 0;
  const netNow = collected - spend;

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-base font-semibold mb-1">Running costs</h2>
        <p className="text-xs text-text-secondary">
          Real usage counts priced at published rates. Estimates for pricing decisions, not a
          reconciliation of what you were actually billed.
        </p>
      </div>

      {report.warning && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-300">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          <p>{report.warning}</p>
        </div>
      )}

      {/* Where things stand right now */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: 'Collected this month',
            value: money(collected),
            tone: 'text-emerald-400',
            note: `${current?.counts.charges ?? 0} payment${(current?.counts.charges ?? 0) === 1 ? '' : 's'}`,
          },
          { label: 'Spend this month', value: money(spend), tone: 'text-text-primary', note: 'estimated' },
          {
            label: 'Net this month',
            value: money(netNow),
            tone: netNow >= 0 ? 'text-emerald-400' : 'text-red-400',
            note: 'collected minus spend',
          },
          {
            label: 'Run rate',
            value: `${money(report.mrrNow)}/mo`,
            tone: 'text-text-primary',
            note: `${report.subscribers} paid subscriber${report.subscribers === 1 ? '' : 's'}`,
          },
        ].map((tile) => (
          <div key={tile.label} className="glass-card rounded-xl p-4">
            <p className="text-[10px] uppercase tracking-wider text-text-secondary">{tile.label}</p>
            <p className={`text-xl font-bold tabular-nums mt-1 ${tile.tone}`}>{tile.value}</p>
            <p className="text-[10px] text-text-secondary mt-0.5">{tile.note}</p>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-text-secondary -mt-3 leading-relaxed">
        Collected is money Creem actually charged, from the billing ledger. Run rate is what the
        live subscriptions bill per month — hand-granted tiers are excluded from both. Months
        before the ledger existed show no revenue, because nothing recorded it.{' '}
        {report.connectedNow} broker connection{report.connectedNow === 1 ? '' : 's'} live now;
        SnapTrade only bills for people who have actually connected one.
      </p>

      {/* Month by month */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-text-secondary border-b border-border/60">
                <th className="text-left font-medium px-4 py-2.5">Month</th>
                <th className="text-right font-medium px-3 py-2.5">AI msgs</th>
                <th className="text-right font-medium px-3 py-2.5">Syncs</th>
                <th className="text-right font-medium px-3 py-2.5">Users</th>
                <th className="text-right font-medium px-3 py-2.5">AI</th>
                <th className="text-right font-medium px-3 py-2.5">Syncs</th>
                <th className="text-right font-medium px-3 py-2.5">SnapTrade</th>
                <th className="text-right font-medium px-3 py-2.5">Fees</th>
                <th className="text-right font-medium px-3 py-2.5">Spend</th>
                <th className="text-right font-medium px-4 py-2.5">Collected</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {report.months.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-text-secondary text-sm">
                    No usage recorded yet.
                  </td>
                </tr>
              )}
              {report.months.map((m) => (
                <tr key={m.month} className="border-b border-border/30 last:border-0">
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {monthLabel(m.month)}
                    {m.partial && (
                      <span className="ml-1.5 text-[10px] text-text-secondary">so far</span>
                    )}
                  </td>
                  <td className="text-right px-3 py-2.5 text-text-secondary">
                    {m.counts.aiMessages.toLocaleString()}
                  </td>
                  <td className="text-right px-3 py-2.5 text-text-secondary">
                    {m.counts.syncs.toLocaleString()}
                  </td>
                  <td className="text-right px-3 py-2.5 text-text-secondary">
                    {m.counts.syncingUsers}
                  </td>
                  <td className="text-right px-3 py-2.5">{money(m.breakdown.ai)}</td>
                  <td className="text-right px-3 py-2.5">{money(m.breakdown.syncs)}</td>
                  <td className="text-right px-3 py-2.5">{money(m.breakdown.connectedUsers)}</td>
                  <td className="text-right px-3 py-2.5">{money(m.breakdown.processor)}</td>
                  <td className="text-right px-3 py-2.5 font-semibold">
                    {money(m.breakdown.total)}
                  </td>
                  <td className="text-right px-4 py-2.5 font-semibold text-emerald-400">
                    {m.counts.revenue > 0 ? money(m.counts.revenue) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* The number that decides a discount */}
      <div>
        <h3 className="text-sm font-semibold mb-1">Worst case per user</h3>
        <p className="text-xs text-text-secondary mb-3">
          If one person hit every daily cap every day of a 31-day month. Price below this and a
          heavy customer costs you money.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {PAID_TIERS.map((tier) => {
            const plan = TIER_PLANS[tier];
            const worst = worstCaseMonthlyCost(plan, report.rates);
            const margin = plan.price - worst.total;
            return (
              <div key={tier} className="glass-card rounded-xl p-4">
                <div className="flex items-baseline justify-between mb-2">
                  <p className="text-sm font-semibold">{plan.name}</p>
                  <p className="text-xs text-text-secondary tabular-nums">${plan.price}/mo</p>
                </div>
                <p className="text-lg font-bold tabular-nums">{money(worst.total)}</p>
                <p className="text-[10px] uppercase tracking-wider text-text-secondary mb-2.5">
                  worst-case cost
                </p>
                <dl className="space-y-0.5 text-[11px] text-text-secondary tabular-nums">
                  <div className="flex justify-between">
                    <dt>AI</dt>
                    <dd>{money(worst.ai)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Syncs</dt>
                    <dd>{money(worst.syncs)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>SnapTrade</dt>
                    <dd>{money(worst.connectedUsers)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Processor</dt>
                    <dd>{money(worst.processor)}</dd>
                  </div>
                </dl>
                <p
                  className={`text-xs font-semibold mt-2.5 pt-2.5 border-t border-border/40 tabular-nums ${
                    margin > 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {margin > 0 ? 'Floor margin ' : 'Loses '}
                  {money(Math.abs(margin))}
                  {margin > 0 && ` · ${Math.round((margin / plan.price) * 100)}%`}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Who is expensive */}
      {report.topUsers.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-1">Most expensive users</h3>
          <p className="text-xs text-text-secondary mb-3">
            Across every month read live this visit. Cached months are not included, so this is
            recent activity rather than all time.
          </p>
          <div className="glass-card rounded-xl divide-y divide-border/30">
            {report.topUsers.map((u) => (
              <div key={u.uid} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                <TrendingDown size={13} className="text-text-secondary shrink-0" />
                <span className="font-mono text-text-secondary truncate flex-1">{u.uid}</span>
                <span className="text-text-secondary tabular-nums shrink-0">
                  {u.aiMessages} msgs · {u.syncs} syncs
                </span>
                <span className="font-semibold tabular-nums w-16 text-right shrink-0">
                  {money(u.cost)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-text-secondary leading-relaxed">
        Rates in use: ${report.rates.connectedUserMonth.toFixed(2)} per connected user/month, $
        {report.rates.syncCall.toFixed(2)} per sync, ${report.rates.aiMessage.toFixed(4)} per
        assistant message, ${report.rates.takeaway.toFixed(4)} per takeaway,{' '}
        {(report.rates.creemPercent * 100).toFixed(1)}% + ${report.rates.creemFlat.toFixed(2)} per
        charge. Change any of them with the COST_* environment variables — no deploy needed.
      </p>
    </section>
  );
}
