import { AlertTriangle, ChevronRight, Plus } from 'lucide-react';
import type { CalendarWeek } from '../utils/calendar';
import { useSettings } from '../context/useSettings';
import { formatCurrency } from '../utils/format';

interface DashboardCalendarListProps {
  weeks: CalendarWeek[];
  year: number;
  month: number;
  /** Today, when the month on screen is the current one. */
  today: Date | null;
  fresh: ReadonlySet<string>;
  ruleDates: ReadonlySet<string>;
  /** 0–1 per week, the week's size against the month's biggest. */
  shares: number[];
  dayKey: (year: number, month: number, day: number) => string;
  onDayClick: (date: string) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * The month on a phone: a list, not a grid.
 *
 * Eight columns in 375px is a day cell 40px wide with a 9px figure that truncates to "$2…" — the
 * landing page's two-week preview read better than the real thing. A trader on a phone wants to
 * know which days they traded and what each one did, in a size they can read with a thumb on the
 * way to the drawer. So: one row per week that had a trade, the week's figure on the right, and
 * under it one row per trading day with the day's P&L as the main figure, its trade count and
 * win/loss split, and the amber mark where a rule was broken. Days without trades are left out —
 * except today, which is the one empty day worth a tap. Desktop keeps the grid.
 */
export function DashboardCalendarList({
  weeks,
  year,
  month,
  today,
  fresh,
  ruleDates,
  shares,
  dayKey,
  onDayClick,
}: DashboardCalendarListProps) {
  const { settings } = useSettings();
  const fmt = (n: number) => formatCurrency(n, settings.currency);
  const isToday = (d: Date | null) => Boolean(today && d && d.getDate() === today.getDate());

  const rows = weeks
    .map((week, wi) => {
      const days = week.days.filter((d) => d.date && ((d.summary && d.summary.tradeCount > 0) || isToday(d.date)));
      return { week, wi, days };
    })
    .filter((r) => r.days.length > 0);

  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-text-secondary">No trades this month yet.</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map(({ week, wi, days }) => {
        const first = week.days.find((d) => d.date)?.date;
        const last = [...week.days].reverse().find((d) => d.date)?.date;
        const weekProfit = week.summary.totalPnl >= 0;
        const hasTrades = week.summary.tradeCount > 0;
        return (
          <section key={wi} aria-label={`Week ${wi + 1}`}>
            <div className="flex items-end justify-between px-1 pb-1.5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                  {first && last ? `${WEEKDAYS[first.getDay()]} ${first.getDate()} – ${WEEKDAYS[last.getDay()]} ${last.getDate()}` : `Week ${wi + 1}`}
                </p>
                {hasTrades && (
                  <p className="text-[11px] text-text-secondary">
                    {week.summary.tradeCount} {week.summary.tradeCount === 1 ? 'trade' : 'trades'}
                  </p>
                )}
              </div>
              {hasTrades && (
                <div className="text-right">
                  <p className={`text-base font-bold tabular-nums leading-none ${weekProfit ? 'text-profit-bright' : 'text-loss-bright'}`}>
                    {fmt(week.summary.totalPnl)}
                  </p>
                  <span className="mt-1.5 block h-[3px] w-24 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden>
                    <span
                      className={`block h-full rounded-full ${weekProfit ? 'bg-profit-bright' : 'bg-loss-bright'}`}
                      style={{ width: `${Math.round(Math.max(0.08, shares[wi] ?? 0) * 100)}%` }}
                    />
                  </span>
                </div>
              )}
            </div>

            <ul className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/5 bg-bg-card">
              {days.map((d) => {
                const date = d.date!;
                const key = dayKey(year, month, date.getDate());
                const s = d.summary;
                const traded = Boolean(s && s.tradeCount > 0);
                const profit = traded && s!.totalPnl >= 0;
                const wins = traded ? s!.trades.filter((t) => t.pnl > 0).length : 0;
                const losses = traded ? s!.trades.filter((t) => t.pnl < 0).length : 0;
                const broke = ruleDates.has(key);
                return (
                  <li key={key} className={fresh.has(key) ? 'animate-cell-pop' : ''}>
                    <button
                      type="button"
                      onClick={() => onDayClick(key)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04] focus-ring"
                    >
                      <span className="w-12 shrink-0">
                        <span className={`block text-[11px] uppercase tracking-wide ${isToday(date) ? 'text-accent' : 'text-text-secondary'}`}>
                          {WEEKDAYS[date.getDay()]}
                        </span>
                        <span className={`block text-lg font-semibold leading-none ${isToday(date) ? 'text-accent' : ''}`}>{date.getDate()}</span>
                      </span>
                      {traded ? (
                        <>
                          <span className="min-w-0 flex-1">
                            <span className={`block text-base font-bold tabular-nums leading-tight ${profit ? 'text-profit-bright' : 'text-loss-bright'}`}>
                              {fmt(s!.totalPnl)}
                            </span>
                            <span className="block text-[11px] text-text-secondary">
                              {s!.tradeCount} {s!.tradeCount === 1 ? 'trade' : 'trades'}
                              {' · '}
                              <span className="text-profit-bright">{wins}W</span> <span className="text-loss-bright">{losses}L</span>
                            </span>
                          </span>
                          {broke && (
                            <span
                              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300"
                              aria-label="Broke one of your rules"
                            >
                              <AlertTriangle size={10} aria-hidden />
                              Rule
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-text-secondary">
                          <Plus size={14} className="text-accent" aria-hidden />
                          Today — log a trade
                        </span>
                      )}
                      <ChevronRight size={16} className="shrink-0 text-text-secondary/60" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
