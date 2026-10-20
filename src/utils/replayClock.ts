import { easternToUtc } from './marketReplay';

const CLOCK = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: false });

/** "10:42", New York time, for an epoch second. The session's own clock, whatever the viewer's is. */
export function easternClock(seconds: number): string {
  return CLOCK.format(new Date(seconds * 1000)).replace(/^24:/, '00:');
}

/**
 * A trade's recorded time ("09:42:15" or "09:42") on a date, as the epoch second of its minute, or
 * null when it has none. Most Schwab imports have none.
 */
export function tradeMinute(date: string, time: string | undefined): number | null {
  const m = time?.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const at = easternToUtc(date, Number(m[1]), Number(m[2]));
  return Number.isFinite(at.getTime()) ? Math.floor(at.getTime() / 1000) : null;
}
