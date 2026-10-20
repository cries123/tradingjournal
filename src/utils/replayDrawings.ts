/**
 * Lines and zones drawn on the replay chart.
 *
 * Kept per instrument and day in this browser: a level drawn on Friday's 5815 call belongs to that
 * chart, not to Monday's. localStorage, because drawings are a viewing convenience. Losing them in a
 * private window costs a redraw, never a trade.
 */

export type DrawingTool = 'cursor' | 'trend' | 'hline' | 'rect';

export interface ChartPoint {
  /** Epoch seconds of the minute the point was placed on. */
  time: number;
  price: number;
}

export interface Drawing {
  id: string;
  kind: Exclude<DrawingTool, 'cursor'>;
  a: ChartPoint;
  /** The second corner or end. A horizontal line has none. */
  b?: ChartPoint;
}

/** Clicks a tool needs: a horizontal line is one, a trend line or zone two. */
export function pointsFor(tool: Exclude<DrawingTool, 'cursor'>): 1 | 2 {
  return tool === 'hline' ? 1 : 2;
}

/**
 * A point's time on a coarser timeframe: the start of the candle it falls in, so a line drawn on
 * one-minute candles still lands on a candle at five.
 */
export function snapTime(time: number, timeframeMinutes: number): number {
  const size = timeframeMinutes * 60;
  return Math.floor(time / size) * size;
}

const KEY = 'tc-replay-drawings';

export function drawingsKey(date: string, instrument: string): string {
  return `${KEY}:${date}:${instrument.replace(/\s+/g, '_')}`;
}

function isPoint(v: unknown): v is ChartPoint {
  const p = v as ChartPoint;
  return typeof p?.time === 'number' && typeof p?.price === 'number' && Number.isFinite(p.time) && Number.isFinite(p.price);
}

/** What was saved, read defensively: anything malformed is dropped rather than drawn. */
export function readDrawings(raw: string | null): Drawing[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    return list.filter((d): d is Drawing => {
      const x = d as Drawing;
      if (typeof x?.id !== 'string' || !isPoint(x.a)) return false;
      if (x.kind === 'hline') return true;
      return (x.kind === 'trend' || x.kind === 'rect') && isPoint(x.b);
    });
  } catch {
    return [];
  }
}

export function loadDrawings(date: string, instrument: string): Drawing[] {
  try {
    return readDrawings(localStorage.getItem(drawingsKey(date, instrument)));
  } catch {
    return [];
  }
}

export function saveDrawings(date: string, instrument: string, drawings: Drawing[]): void {
  try {
    localStorage.setItem(drawingsKey(date, instrument), JSON.stringify(drawings));
  } catch {
    // Storage blocked or full: the drawings stay for this visit.
  }
}
