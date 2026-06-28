import { useSettings } from '../../context/SettingsContext';
import type { TagStat } from '../../utils/advancedStats';
import { formatCurrency } from '../../utils/format';

export function TagAnalyticsTable({ stats }: { stats: TagStat[] }) {
  const { settings } = useSettings();

  if (stats.length === 0) {
    return <p className="text-xs text-text-secondary">Add tags to trades to see which setups make money.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-text-secondary border-b border-border/50">
            <th className="text-left py-2 pr-2 font-medium">Tag</th>
            <th className="text-right py-2 px-2 font-medium">Trades</th>
            <th className="text-right py-2 px-2 font-medium">Net P&L</th>
            <th className="text-right py-2 px-2 font-medium">Win %</th>
            <th className="text-right py-2 pl-2 font-medium">Avg</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((row) => (
            <tr key={row.tag} className="border-b border-border/30">
              <td className="py-2 pr-2 font-medium text-emerald-300/90">{row.tag}</td>
              <td className="py-2 px-2 text-right">{row.trades}</td>
              <td className={`py-2 px-2 text-right font-semibold ${row.netPnl >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>
                {formatCurrency(row.netPnl, settings.currency)}
              </td>
              <td className="py-2 px-2 text-right">{row.winRate.toFixed(0)}%</td>
              <td className="py-2 pl-2 text-right">{formatCurrency(row.avgPnl, settings.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
