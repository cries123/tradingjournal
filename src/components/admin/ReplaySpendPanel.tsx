import { ChartCandlestick } from 'lucide-react';
import type { ReplayStats } from '../../../server/replayLedger';
import { TIER_PLANS } from '../../config/tiers';

/**
 * What market replay has bought from Databento, in Databento's own prices.
 *
 * The answer to "how much does replay cost to run", which nobody could give before it shipped:
 * every pull of new data is priced by Databento's cost endpoint and added up here, this month and
 * day by day. Days served from the cache cost nothing and are not in these numbers. A pull priced
 * from a rate because the cost endpoint did not answer is counted as estimated and said so.
 */

const usd = (n: number) => (n > 0 && n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);
const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(bytes > 0 && bytes < 100_000 ? 2 : 1)} MB`;

export function ReplaySpendPanel({ stats }: { stats: ReplayStats | null }) {
  const allowance = TIER_PLANS.diamond.limits.replayUsdPerMonth;
  const days = stats?.days.filter((d) => d.pulls > 0) ?? [];

  return (
    <section className="panel-card rounded-xl p-5 md:p-6">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ChartCandlestick size={16} className="text-accent" />
          <h2 className="text-sm font-semibold text-text-primary">Market replay data</h2>
        </div>
        <p className="text-xs text-text-secondary">
          {TIER_PLANS.diamond.name} allowance: ${allowance} per member a month, split evenly across its days
        </p>
      </div>
      <p className="mb-4 text-xs text-text-secondary">
        New data bought from Databento, at Databento&apos;s own price for each pull. Days already opened come from the cache and cost nothing.
      </p>

      {!stats ? (
        <p className="text-xs text-amber-300">Could not read the replay totals.</p>
      ) : (
        <>
          <dl className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['This month', usd(stats.month.usd)],
              ['Data', mb(stats.month.bytes)],
              ['New charts', String(stats.month.symbols)],
              ['Members', String(stats.month.members)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border/40 bg-bg-tertiary/30 px-3 py-2">
                <dt className="text-[11px] text-text-secondary">{label}</dt>
                <dd className="text-base font-semibold tabular-nums text-text-primary">{value}</dd>
              </div>
            ))}
          </dl>
          {stats.month.estimatedPulls > 0 && (
            <p className="mb-3 text-[11px] text-amber-300">
              {stats.month.estimatedPulls} pull{stats.month.estimatedPulls === 1 ? ' was' : 's were'} priced from a rate because Databento&apos;s
              cost endpoint did not answer, at a deliberately high rate, so this month&apos;s total may read a little high.
            </p>
          )}
          {days.length === 0 ? (
            <p className="text-xs text-text-secondary">No new data bought in the last fourteen days.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[11px] text-text-secondary">
                  <th className="py-1 font-medium">Day</th>
                  <th className="py-1 text-right font-medium">Cost</th>
                  <th className="py-1 text-right font-medium">Data</th>
                  <th className="py-1 text-right font-medium">Charts</th>
                  <th className="py-1 text-right font-medium">Members</th>
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.period} className="border-t border-border/30 tabular-nums">
                    <td className="py-1.5 text-text-primary">{d.period}</td>
                    <td className="py-1.5 text-right">{usd(d.usd)}</td>
                    <td className="py-1.5 text-right text-text-secondary">{mb(d.bytes)}</td>
                    <td className="py-1.5 text-right text-text-secondary">{d.symbols}</td>
                    <td className="py-1.5 text-right text-text-secondary">{d.members}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}
