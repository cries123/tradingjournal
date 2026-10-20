/**
 * Market replay: the pure half, shared by the server that buys the bars and the screen that plays
 * them back.
 *
 * Data is Databento's historical minute bars: OPRA for options, Databento US Equities Mini for the
 * underlying. Two rules here exist because of what that data costs and who is allowed to see it:
 *
 *  1. A day opens for replay only once it is HISTORICAL. OPRA charges nothing for options data at
 *     least one full trading day old (its redistributor fee and per-user fees apply to anything
 *     newer), and Databento's terms allow showing a dataset externally once it is 24 hours old.
 *     replayAvailableAt is the later of the two, and the server refuses anything earlier.
 *  2. Everything is a minute bar of one session. Seconds and ticks exist but cost more and add little
 *     for options that trade a few times a minute.
 */

export interface Bar {
  /** UTC epoch seconds of the minute's open. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/* ------------------------------------------------------------------ the market calendar */

/**
 * NYSE full-day closures. Early closes are ordinary days with fewer bars.
 *
 * A list rather than a rule because the exchange changes its mind (2025-01-09, a national day of
 * mourning, was announced two weeks ahead). Past the last year here the calendar falls back to
 * weekends only, which errs towards opening a holiday's "next day" early by one session; extend
 * the list each December.
 */
const NYSE_HOLIDAYS = new Set([
  '2024-01-01', '2024-01-15', '2024-02-19', '2024-03-29', '2024-05-27', '2024-06-19', '2024-07-04', '2024-09-02', '2024-11-28', '2024-12-25',
  '2025-01-01', '2025-01-09', '2025-01-20', '2025-02-17', '2025-04-18', '2025-05-26', '2025-06-19', '2025-07-04', '2025-09-01', '2025-11-27', '2025-12-25',
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
]);

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isTradingDay(date: string): boolean {
  if (!DATE.test(date)) return false;
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day !== 0 && day !== 6 && !NYSE_HOLIDAYS.has(date);
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function nextTradingDay(date: string): string {
  let d = addDays(date, 1);
  while (!isTradingDay(d)) d = addDays(d, 1);
  return d;
}

export function previousTradingDay(date: string): string {
  let d = addDays(date, -1);
  while (!isTradingDay(d)) d = addDays(d, -1);
  return d;
}

/**
 * The UTC instant of a wall-clock time in New York on a date, DST included.
 *
 * Intl gives the zone's offset for that date; the guess is corrected once, which is exact for
 * every time this file asks about (none fall inside the 2 a.m. changeover hour).
 */
export function easternToUtc(date: string, hh: number, mm: number): Date {
  const guess = new Date(`${date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`);
  const offset = easternOffsetMinutes(guess);
  return new Date(guess.getTime() - offset * 60_000);
}

/** New York's offset from UTC at an instant, in minutes: -240 in summer, -300 in winter. */
function easternOffsetMinutes(at: Date): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-5';
  const m = name.match(/GMT([+-]\d+)(?::(\d+))?/);
  if (!m) return -300;
  const hours = Number(m[1]);
  return hours * 60 + Math.sign(hours) * Number(m[2] ?? 0);
}

/**
 * The session a replay draws: 9:30 to 16:15 New York time.
 *
 * 16:15, not 16:00, because SPX and SPXW options trade until a quarter past. An equity simply has
 * no bars in the last fifteen minutes.
 */
export function sessionWindow(date: string): { start: Date; end: Date } {
  return { start: easternToUtc(date, 9, 30), end: easternToUtc(date, 16, 15) };
}

/**
 * When a day's replay opens: the later of the next session's open (OPRA's line between current and
 * historical) and 24 hours after this session ends (Databento's line for showing data externally).
 *
 * So a Friday opens Monday at 9:30, and a Monday opens Tuesday at 4:15 p.m.
 */
export function replayAvailableAt(date: string): Date {
  const nextOpen = easternToUtc(nextTradingDay(date), 9, 30);
  const dayAfterClose = new Date(sessionWindow(date).end.getTime() + 24 * 3600_000);
  return nextOpen > dayAfterClose ? nextOpen : dayAfterClose;
}

export function replayAvailable(date: string, now: Date): boolean {
  return isTradingDay(date) && now.getTime() >= replayAvailableAt(date).getTime();
}

/** The latest day that can be replayed at this moment. */
export function latestReplayDay(now: Date): string {
  let d = now.toISOString().slice(0, 10);
  if (!isTradingDay(d)) d = previousTradingDay(d);
  while (!replayAvailable(d, now)) d = previousTradingDay(d);
  return d;
}

/* ------------------------------------------------------------------ contract symbols */

export type Right = 'C' | 'P';

/**
 * An option's OSI symbol, the 21-character form OPRA and Databento use as the raw symbol:
 * the root padded to six, YYMMDD, C or P, and the strike in thousandths padded to eight.
 * "SPY   261016C00560000" is SPY's Oct 16 2026 560 call.
 */
export function osiSymbol(root: string, expiration: string, right: Right, strike: number): string | null {
  if (!/^[A-Z]{1,6}$/.test(root) || !DATE.test(expiration) || !(strike > 0) || strike >= 100_000) return null;
  const thousandths = Math.round(strike * 1000);
  return `${root.padEnd(6, ' ')}${expiration.slice(2, 4)}${expiration.slice(5, 7)}${expiration.slice(8, 10)}${right}${String(thousandths).padStart(8, '0')}`;
}

/**
 * The roots an option on this underlying may trade under, most likely first.
 *
 * Index options list their weeklies and dailies under a second root (SPXW, NDXP, RUTW, VIXW) and
 * keep the plain root for the AM-settled monthly. A broker reports the underlying, not the root, so
 * a 0DTE SPX trade arrives as "SPX" and is nearly always SPXW. Both are asked for and the one whose
 * prices match the trader's fills wins (pickContract).
 */
const WEEKLY_ROOTS: Record<string, string[]> = {
  SPX: ['SPXW', 'SPX'],
  SPXW: ['SPXW'],
  NDX: ['NDXP', 'NDX'],
  RUT: ['RUTW', 'RUT'],
  VIX: ['VIXW', 'VIX'],
};

export function optionRoots(underlying: string): string[] {
  const u = underlying.trim().toUpperCase();
  return WEEKLY_ROOTS[u] ?? [u];
}

/**
 * The equity drawn under an option, and what it stands in for.
 *
 * An index is not an equity and its values carry their own licence, so SPX is drawn as SPY, which
 * tracks it at about a tenth of the price. The screen says so.
 */
const PROXIES: Record<string, string> = { SPX: 'SPY', SPXW: 'SPY', XSP: 'SPY', NDX: 'QQQ', NDXP: 'QQQ', RUT: 'IWM', RUTW: 'IWM' };

export function chartedUnderlying(underlying: string): { symbol: string; proxyFor: string | null } | null {
  const u = underlying.trim().toUpperCase();
  if (u === 'VIX' || u === 'VIXW') return null;
  if (PROXIES[u]) return { symbol: PROXIES[u], proxyFor: u === 'SPXW' ? 'SPX' : u };
  return /^[A-Z.]{1,6}$/.test(u) ? { symbol: u, proxyFor: null } : null;
}

/** A readable name for an OSI symbol, the way the trade log writes one: "SPXW 16 Oct 5800C". */
export function contractLabel(osi: string): string {
  const root = osi.slice(0, 6).trim();
  const mm = Number(osi.slice(8, 10));
  const dd = Number(osi.slice(10, 12));
  const right = osi.slice(12, 13);
  const strike = Number(osi.slice(13)) / 1000;
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][mm - 1] ?? '';
  return `${root} ${dd} ${mon} ${strike}${right}`;
}

/**
 * Which of the candidate contracts the trader actually traded: the one whose bars contain the most
 * of their fill prices. Ties, including no fills to go on, go to the earlier candidate, which is
 * the likelier root. A candidate with no bars did not trade that day and cannot be it.
 */
export function pickContract(candidates: { osi: string; bars: Bar[] }[], fills: number[]): string | null {
  let best: { osi: string; hits: number } | null = null;
  for (const c of candidates) {
    if (c.bars.length === 0) continue;
    const hits = fills.filter((p) => c.bars.some((b) => b.low <= p && p <= b.high)).length;
    if (!best || hits > best.hits) best = { osi: c.osi, hits };
  }
  return best?.osi ?? null;
}

/* ------------------------------------------------------------------ bars on screen */

/** Minute bars rolled up to a coarser timeframe, each bucket aligned to the session's minutes. */
export function aggregateBars(bars: Bar[], minutes: number): Bar[] {
  if (minutes <= 1) return bars;
  const size = minutes * 60;
  const out: Bar[] = [];
  for (const b of bars) {
    const bucket = Math.floor(b.time / size) * size;
    const last = out[out.length - 1];
    if (last && last.time === bucket) {
      last.high = Math.max(last.high, b.high);
      last.low = Math.min(last.low, b.low);
      last.close = b.close;
      last.volume += b.volume;
    } else {
      out.push({ ...b, time: bucket });
    }
  }
  return out;
}

/** Volume-weighted average price through each bar, from the typical price. Null before any volume. */
export function vwapLine(bars: Bar[]): { time: number; value: number }[] {
  let pv = 0;
  let v = 0;
  const out: { time: number; value: number }[] = [];
  for (const b of bars) {
    pv += ((b.high + b.low + b.close) / 3) * b.volume;
    v += b.volume;
    if (v > 0) out.push({ time: b.time, value: pv / v });
  }
  return out;
}

/**
 * The minutes in which a contract traded through a price: where a fill at that price COULD have
 * happened, for a broker that sends no fill time. An estimate, and every screen that draws it
 * labels it as one.
 */
export function possibleFillTimes(bars: Bar[], price: number | undefined): number[] {
  if (price == null || !Number.isFinite(price)) return [];
  return bars.filter((b) => b.low <= price && price <= b.high).map((b) => b.time);
}
