import type { RoundTrip } from '../../types';
import { useSettings } from '../../context/SettingsContext';
import { formatCurrency } from '../../utils/format';

export function RoundTripsPanel({ trips }: { trips: RoundTrip[] }) {
  const { settings } = useSettings();

  if (trips.length === 0) {
    return <p className="text-xs text-text-secondary">No round trips to show.</p>;
  }

  return (
    <div className="space-y-2 max-h-64 overflow-y-auto">
      {trips.slice(0, 20).map((trip) => (
        <div key={trip.id} className="rounded-lg border border-border/50 bg-bg-tertiary/30 px-3 py-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">{trip.symbol}</span>
            <span className={trip.netPnl >= 0 ? 'text-profit-bright' : 'text-loss-bright'}>
              {formatCurrency(trip.netPnl, settings.currency)}
            </span>
          </div>
          <p className="text-text-secondary mt-1">
            {trip.openDate === trip.closeDate ? trip.openDate : `${trip.openDate} → ${trip.closeDate}`}
            {trip.holdMinutes != null && ` · ${trip.holdMinutes}m hold`}
            {trip.rMultiple != null && ` · ${trip.rMultiple.toFixed(1)}R`}
          </p>
          {(trip.mae != null || trip.mfe != null) && (
            <p className="text-[10px] text-text-secondary mt-0.5">
              {trip.mae != null && `MAE ${formatCurrency(trip.mae, settings.currency)}`}
              {trip.mae != null && trip.mfe != null && ' · '}
              {trip.mfe != null && `MFE ${formatCurrency(trip.mfe, settings.currency)}`}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
