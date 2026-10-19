import { useMemo, useState } from 'react';
import type { Trade } from '../types';
import {
  aggregateTradesByDay,
  buildCalendarWeeks,
  getMonthTotalPnl,
  monthHasTrades,
  previousMonth,
  weekShares,
} from '../utils/calendar';
import { formatCurrency, formatMonthYear } from '../utils/format';
import { useSettings } from '../context/useSettings';
import { DashboardDayCell } from './DashboardDayCell';
import { DashboardWeekTotalCell } from './DashboardWeekTotalCell';
import { CountUp } from './motion/CountUp';
import { filledDays, nextDaySeen, type DaySeen } from '../utils/freshDays';

interface DashboardCalendarProps {
  year: number;
  month: number;
  trades: Trade[];
  onDayClick: (date: string) => void;
  /** Days on which one of the trader's rules was broken — marked on the grid. */
  ruleDates?: ReadonlySet<string>;
  /** Opens the month's report. The link is left off when there is no report to open. */
  onOpenReport?: () => void;
}

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const PHONE_WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
/**
 * All seven days are shown.
 *
 * Saturday used to be dropped as "almost never a trading day", but the week total is summed over
 * the full seven — so a Saturday trade counted toward the week and month totals while having no
 * cell to appear in, and the numbers on screen didn't add up to the ones beside them. A calendar
 * that can hide a trade is worse than one with a mostly-quiet column.
 */
const DAYS_PER_WEEK = 7;

const NO_DATES: ReadonlySet<string> = new Set();

/** "2026-07-04" for a day of a 0-based month — the key trades and summaries are filed under. */
function dayKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** "Sep 6 – 12" for the days of a week that fall in the month. */
function weekRange(days: { date: Date | null }[]): string {
  const dates = days.map((d) => d.date).filter((d): d is Date => d !== null);
  if (dates.length === 0) return '';
  const first = dates[0];
  const last = dates[dates.length - 1];
  const mon = first.toLocaleDateString('en-US', { month: 'short' });
  return first.getDate() === last.getDate() ? `${mon} ${first.getDate()}` : `${mon} ${first.getDate()} – ${last.getDate()}`;
}

/**
 * The month as a calendar, in the two shapes the approved designs give it.
 *
 * Desktop: seven day columns and a fixed week column, the month's total and last month beside the
 * title, and the report one click away. The period itself is stepped in the Overview's toolbar,
 * which every part of the page shares.
 *
 * Phone: the same seven-column grid Jay asked to keep, with whole-dollar amounts that fit a 50px cell
 * and a dot on days a rule broke, a legend for the two marks, and the week totals as a list under
 * it — an eighth column squeezed every day cell to the point the amounts truncated.
 */
export function DashboardCalendar({ year, month, trades, onDayClick, ruleDates = NO_DATES, onOpenReport }: DashboardCalendarProps) {
  const { settings } = useSettings();
  const summaries = useMemo(() => aggregateTradesByDay(trades), [trades]);
  const weeks = useMemo(() => buildCalendarWeeks(year, month, summaries), [year, month, summaries]);
  const monthTotal = useMemo(() => getMonthTotalPnl(summaries, year, month), [summaries, year, month]);
  const shares = useMemo(() => weekShares(weeks), [weeks]);

  /*
   * Last month beside this one. The total on its own says how the month went; against the month
   * before it says whether things are getting better. Only when there was a last month to compare
   * with — "vs $0.00" for a trader who started this month is not a comparison.
   */
  const prior = useMemo(() => {
    const p = previousMonth(year, month);
    return monthHasTrades(summaries, p.year, p.month) ? getMonthTotalPnl(summaries, p.year, p.month) : null;
  }, [summaries, year, month]);

  /*
   * Days that just gained their first trade while this month is on screen pop into the grid — the
   * moment a sync lands, which is the moment this product exists for. Derived during render from
   * the previous record (React's "store information from previous renders" pattern) rather than in
   * an effect, so the pop starts on the same frame as the day's figure rather than one after it.
   */
  const monthKey = `${year}-${month}`;
  const days = useMemo(() => filledDays(summaries, year, month), [summaries, year, month]);
  const [seen, setSeen] = useState<DaySeen>(() => nextDaySeen(null, monthKey, days));
  const nextSeen = nextDaySeen(seen, monthKey, days);
  if (nextSeen !== seen) setSeen(nextSeen);
  const fresh = nextSeen.fresh;

  const [today] = useState(() => new Date());
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const fmt = (n: number) => formatCurrency(n, settings.currency);
  const monthName = new Date(year, month, 15).toLocaleDateString('en-US', { month: 'long' });

  const cell = (day: (typeof weeks)[number]['days'][number], wi: number, di: number, size: 'desktop' | 'phone') => (
    <DashboardDayCell
      key={day.date?.toISOString() ?? `e-${wi}-${di}`}
      size={size}
      dayNumber={day.date?.getDate() ?? null}
      summary={day.summary}
      isToday={isCurrentMonth && day.date?.getDate() === today.getDate()}
      fresh={day.date ? fresh.has(dayKey(year, month, day.date.getDate())) : false}
      ruleBroken={day.date ? ruleDates.has(dayKey(year, month, day.date.getDate())) : false}
      onClick={day.date ? () => onDayClick(dayKey(year, month, day.date!.getDate())) : undefined}
    />
  );

  return (
    <>
      {/* ── Desktop ── */}
      <section className="hidden md:block panel-card p-4">
        <div className="mb-3 flex items-center justify-between gap-2.5">
          <h2 className="flex flex-wrap items-baseline gap-2.5 text-sm font-semibold">
            Calendar
            <small key={monthKey} className="text-xs font-normal text-text-secondary tabular-nums animate-page-in">
              <span className={monthTotal >= 0 ? 'text-profit-bright' : 'text-loss-bright'}>
                <CountUp value={monthTotal} format={fmt} />
              </span>
              {prior !== null && (
                <>
                  {' '}· vs <span className={prior >= 0 ? 'text-profit-bright' : 'text-loss-bright'}>{prior >= 0 ? '+' : ''}{fmt(prior)}</span> last month
                </>
              )}
            </small>
          </h2>
          {onOpenReport && (
            <button type="button" onClick={onOpenReport} className="whitespace-nowrap text-xs text-accent hover:text-accent/80 focus-ring rounded">
              {monthName} report →
            </button>
          )}
        </div>

        <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_96px] gap-1.5">
          {WEEKDAYS.map((d) => (
            <div key={d} className="pb-1 pt-0.5 text-center text-[11px] tracking-[0.04em] text-text-secondary/70">
              {d}
            </div>
          ))}
          <div className="pb-1 pt-0.5 text-center text-[11px] tracking-[0.04em] text-text-secondary/70">WEEK</div>
          {weeks.flatMap((week, wi) => [
            ...week.days.slice(0, DAYS_PER_WEEK).map((day, di) => cell(day, wi, di, 'desktop')),
            <DashboardWeekTotalCell key={`week-total-${wi}`} summary={week.summary} share={shares[wi]} />,
          ])}
        </div>
      </section>

      {/* ── Phone ── */}
      <section className="md:hidden">
        <div className="mb-2 flex items-baseline justify-between">
          <b className="text-[15px]">{formatMonthYear(year, month)}</b>
          {onOpenReport && (
            <button type="button" onClick={onOpenReport} className="text-[13px] text-accent focus-ring rounded">
              Report →
            </button>
          )}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {PHONE_WEEKDAYS.map((d, i) => (
            <div key={`${d}-${i}`} className="pb-0.5 text-center text-[11px] text-text-secondary/70">
              {d}
            </div>
          ))}
          {weeks.flatMap((week, wi) => week.days.slice(0, DAYS_PER_WEEK).map((day, di) => cell(day, wi, di, 'phone')))}
        </div>
        <div className="mt-2.5 flex items-center gap-3.5 text-xs text-text-secondary">
          <span className="flex items-center gap-1.5">
            <span className="h-[7px] w-[7px] rounded-full bg-amber-400" aria-hidden />
            Broke a rule
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[4px] shadow-[inset_0_0_0_1.5px_var(--color-accent)]" aria-hidden />
            Today
          </span>
        </div>
        <div className="mt-3.5 border-t border-white/[0.06]">
          {weeks.map((week, wi) =>
            week.summary.tradeCount === 0 ? null : (
              <div key={`w-${wi}`} className="grid grid-cols-[96px_1fr_92px] items-center gap-2.5 border-b border-white/[0.06] py-2.5 text-[13px]">
                <span>
                  {weekRange(week.days.slice(0, DAYS_PER_WEEK))}
                  <small className="mt-px block text-[11px] text-text-secondary">
                    {week.summary.tradeCount} {week.summary.tradeCount === 1 ? 'trade' : 'trades'}
                  </small>
                </span>
                <span className="h-[5px] overflow-hidden rounded-full bg-[#222]" aria-hidden>
                  <span
                    className={`block h-full rounded-full ${week.summary.totalPnl >= 0 ? 'bg-accent' : 'bg-loss-bright'}`}
                    style={{ width: `${Math.round(Math.max(0.08, shares[wi]) * 100)}%` }}
                  />
                </span>
                <span className={`text-right font-bold tabular-nums ${week.summary.totalPnl >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>
                  {week.summary.totalPnl > 0 ? '+' : ''}
                  {fmt(week.summary.totalPnl)}
                </span>
              </div>
            ),
          )}
        </div>
      </section>
    </>
  );
}
