import { useSettings } from '../../context/SettingsContext';
import type { SessionStat } from '../../utils/advancedStats';
import { formatCurrency } from '../../utils/format';

export function TimeOfDayChart({ data }: { data: SessionStat[] }) {
  const { settings } = useSettings();

  if (data.length === 0) {
    return (
      <p className="text-xs text-text-secondary">
        Add entry times on trades (e.g. 09:35) to see performance by session.
      </p>
    );
  }

  const maxAbs = Math.max(...data.map((d) => Math.abs(d.netPnl)), 1);

  return (
    <div className="space-y-2">
      {data.map((row) => {
        const width = (Math.abs(row.netPnl) / maxAbs) * 100;
        const positive = row.netPnl >= 0;
        return (
          <div key={row.session} className="flex items-center gap-2 text-xs">
            <span className="w-20 shrink-0 text-text-secondary">{row.session}</span>
            <div className="flex-1 h-4 bg-bg-tertiary rounded overflow-hidden">
              <div
                className={`h-full chart-bar-h ${positive ? 'bg-profit-bright' : 'bg-loss-bright'}`}
                style={{ width: `${Math.max(width, 4)}%` }}
              />
            </div>
            <span className={`w-16 text-right shrink-0 ${positive ? 'text-profit-bright' : 'text-loss-bright'}`}>
              {formatCurrency(row.netPnl, settings.currency)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
