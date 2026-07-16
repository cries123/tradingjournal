import { useMemo } from 'react';
import { CalendarCheck } from 'lucide-react';
import type { Trade } from '../types';
import { useSettings } from '../context/SettingsContext';
import { formatCurrency } from '../utils/format';
import { computeWeeklyRecap } from '../utils/insights';

function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short' });
}

export function WeeklyRecapCard({ trades }: { trades: Trade[] }) {
  const { settings } = useSettings();
  const recap = useMemo(() => computeWeeklyRecap(trades), [trades]);

  if (!recap) return null;

  const fmt = (n: number) => formatCurrency(n, settings.currency);
  const trend =
    recap.prevNet != null ? (recap.net >= recap.prevNet ? 'up' : 'down') : null;

  return (
    <div className="panel-card p-3 md:p-4 shrink-0">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 shrink-0">
            <CalendarCheck size={15} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-emerald-400/80 font-medium">
              Your week
            </p>
            <p className="text-sm md:text-base font-semibold truncate">
              <span className={recap.net >= 0 ? 'text-profit-bright' : 'text-loss-bright'}>
                {fmt(recap.net)}
              </span>
              <span className="text-text-secondary font-normal">
                {' '}· {recap.greenDays} green / {recap.redDays} red · {recap.tradeCount} trade
                {recap.tradeCount === 1 ? '' : 's'}
              </span>
              {trend && (
                <span className={`ml-1.5 text-xs ${trend === 'up' ? 'text-profit-bright' : 'text-loss-bright'}`}>
                  {trend === 'up' ? '▲' : '▼'} vs last week
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] md:text-xs text-text-secondary">
          {recap.bestDay && (
            <span>
              Best {dayLabel(recap.bestDay.date)}{' '}
              <span className="text-profit-bright font-semibold">{fmt(recap.bestDay.pnl)}</span>
            </span>
          )}
          {recap.worstDay && (
            <span>
              Worst {dayLabel(recap.worstDay.date)}{' '}
              <span className="text-loss-bright font-semibold">{fmt(recap.worstDay.pnl)}</span>
            </span>
          )}
          {recap.topSetup && (
            <span>
              Top setup <span className="text-text-primary font-semibold">{recap.topSetup.setup}</span>{' '}
              <span className={recap.topSetup.pnl >= 0 ? 'text-profit-bright' : 'text-loss-bright'}>
                {fmt(recap.topSetup.pnl)}
              </span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
