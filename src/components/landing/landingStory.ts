import type { Trade } from '../../types';
import { demoJournal } from './landingDemo';

/*
 * The one sample month the landing page tells its story with.
 *
 * The hero's calendar, the phone's day sheet, the day played back trade by trade and the rule
 * simulator's line all come from demoJournal(), the same sample the simulator demo and the assistant
 * example used. One sample, so no two figures on the page can disagree — the hero says June closed
 * red and the story says which day did it, from the same trades.
 *
 * SAMPLE data, labelled as such wherever it is shown. It describes no real trader.
 */

/** The month on show. demoJournal() runs from June 1 to July 10, 2026; June is its one whole month. */
export const STORY_MONTH = '2026-06';

/**
 * The cap the story is told against: three trades a day.
 *
 * Three because that is the cap the app itself recommends for this sample. The Performance screen
 * picks its own cut-off from where a day's trades turn unprofitable, and on demoJournal() it says
 * "Stop after three": the 4th and later trades lost money. The landing page shows that screen, so a
 * story told at four would contradict its own screenshot.
 */
export const STORY_CAP = 3;

/** The day the story plays back: three winners, then five losers past the cap. */
export const STORY_DAY = '2026-06-26';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A day's trades in the order they were taken. demoJournal() ids sort in that order. */
function inOrder(trades: Trade[]): Trade[] {
  return [...trades].sort((a, b) => a.id.localeCompare(b.id));
}

function byDay(trades: Trade[]): Map<string, Trade[]> {
  const days = new Map<string, Trade[]>();
  for (const t of trades) days.set(t.date, [...(days.get(t.date) ?? []), t]);
  for (const [date, list] of days) days.set(date, inOrder(list));
  return days;
}

export interface StoryCalendarDay {
  day: number;
  date: string;
  /** Null for a weekday with no trades, a weekend, or a cell outside the month. */
  pnl: number | null;
  /** The same day stopped at the cap; null when there were no trades. */
  capped: number | null;
  trades: number;
  /** More trades than the cap: the amber dot. */
  brokeCap: boolean;
}

export interface StoryMonth {
  label: string;
  /** Blank cells before the 1st, Sunday first like the app's calendar. */
  leading: number;
  days: StoryCalendarDay[];
  net: number;
  /** What the month would have closed at had every day stopped at the cap. */
  cappedNet: number;
  /** What the trades past the cap cost: net minus cappedNet. */
  pastCapCost: number;
  trades: number;
  greenDays: number;
  redDays: number;
  /** Days that went past the cap. */
  capDays: number;
}

/** June as the app's Overview would show it, plus the cap's verdict on it. */
export function storyMonth(trades: Trade[] = demoJournal(), month = STORY_MONTH): StoryMonth {
  const [y, m] = month.split('-').map(Number);
  const leading = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const length = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const days = byDay(trades.filter((t) => t.date.startsWith(month)));

  let net = 0;
  let cappedNet = 0;
  let count = 0;
  const cells: StoryCalendarDay[] = [];
  for (let day = 1; day <= length; day++) {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    const list = days.get(date) ?? [];
    const pnl = list.length > 0 ? round2(list.reduce((s, t) => s + t.pnl, 0)) : null;
    const capped = list.length > 0 ? round2(list.slice(0, STORY_CAP).reduce((s, t) => s + t.pnl, 0)) : null;
    net += pnl ?? 0;
    cappedNet += capped ?? 0;
    count += list.length;
    cells.push({ day, date, pnl, capped, trades: list.length, brokeCap: list.length > STORY_CAP });
  }

  const traded = cells.filter((d): d is StoryCalendarDay & { pnl: number } => d.pnl !== null);
  return {
    label: new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    leading,
    days: cells,
    net: round2(net),
    cappedNet: round2(cappedNet),
    pastCapCost: round2(net - cappedNet),
    trades: count,
    greenDays: traded.filter((d) => d.pnl > 0).length,
    redDays: traded.filter((d) => d.pnl < 0).length,
    capDays: cells.filter((d) => d.brokeCap).length,
  };
}

export interface StoryTrade {
  /** 1-based position in the day. */
  n: number;
  pnl: number;
  /** The day so far after this trade. */
  running: number;
  pastCap: boolean;
}

export interface StoryDay {
  date: string;
  /** "Friday, June 26". */
  label: string;
  trades: StoryTrade[];
  total: number;
  /** The day so far after the cap's last trade: what stopping there would have kept. */
  atCap: number;
  /** What the trades after the cap cost. */
  afterCap: number;
}

/** One day, trade by trade, for the story and the phone's day sheet. */
export function storyDay(trades: Trade[] = demoJournal(), date = STORY_DAY): StoryDay {
  const list = byDay(trades).get(date) ?? [];
  let running = 0;
  const steps = list.map((t, i) => {
    running = round2(running + t.pnl);
    return { n: i + 1, pnl: t.pnl, running, pastCap: i >= STORY_CAP };
  });
  const atCap = steps.length > 0 ? steps[Math.min(STORY_CAP, steps.length) - 1].running : 0;
  const total = steps.length > 0 ? steps[steps.length - 1].running : 0;
  return {
    date,
    label: new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }),
    trades: steps,
    total,
    atCap,
    afterCap: round2(total - atCap),
  };
}

/** The month's running total day by day, as it was and as it would have been at the cap. */
export function monthCurves(month: StoryMonth): { actual: number[]; capped: number[] } {
  let a = 0;
  let c = 0;
  const actual: number[] = [];
  const capped: number[] = [];
  for (const d of month.days) {
    if (d.pnl === null || d.capped === null) continue;
    actual.push(round2((a += d.pnl)));
    capped.push(round2((c += d.capped)));
  }
  return { actual, capped };
}

/** "+$1,234.56" / "-$1,234.56", the app's money. */
export function signedMoney(n: number): string {
  return `${n < 0 ? '-' : '+'}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "$1,235" / "-$1,235", for calendar cells where cents do not fit. */
export function wholeMoney(n: number): string {
  return `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
}

/** "four" for 4: the cap is written as a word in prose ("stopped at four"). Digits past ten. */
export function numberWord(n: number): string {
  return ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] ?? String(n);
}

/** "1st", "2nd", "3rd", "4th" … for a trade's place in its day. */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}
