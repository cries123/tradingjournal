import type { Bar } from './marketReplay';
import { bollinger, ema, macd, openingRange, points, rsi, sma, vwap } from './indicators';

/**
 * Which studies are on, and what they draw.
 *
 * A short list a 0DTE trader actually uses, rather than a hundred: two EMAs, an SMA, Bollinger
 * Bands, VWAP and the opening range on the price; RSI and MACD in panes under it. Choices are kept
 * per browser, like a TradingView layout, because they are how someone likes to look at a chart
 * rather than anything about a trade.
 */

export interface StudySettings {
  ema1: { on: boolean; length: number };
  ema2: { on: boolean; length: number };
  sma: { on: boolean; length: number };
  bb: { on: boolean; length: number; mult: number };
  vwap: { on: boolean };
  or: { on: boolean; minutes: number };
  rsi: { on: boolean; length: number };
  macd: { on: boolean; fast: number; slow: number; signal: number };
}

export type StudyId = keyof StudySettings;

export const DEFAULT_STUDIES: StudySettings = {
  ema1: { on: true, length: 9 },
  ema2: { on: true, length: 21 },
  sma: { on: false, length: 50 },
  bb: { on: false, length: 20, mult: 2 },
  vwap: { on: true },
  or: { on: false, minutes: 15 },
  rsi: { on: false, length: 14 },
  macd: { on: false, fast: 12, slow: 26, signal: 9 },
};

/** Fixed colours per study, chosen to stay apart from the green and red candles. */
export const STUDY_COLORS: Record<StudyId, string> = {
  ema1: '#f5c542',
  ema2: '#c084fc',
  sma: '#38bdf8',
  bb: '#94a3b8',
  vwap: '#60a5fa',
  or: '#fb923c',
  rsi: '#c084fc',
  macd: '#38bdf8',
};

export const STUDY_NAMES: Record<StudyId, string> = {
  ema1: 'EMA',
  ema2: 'EMA',
  sma: 'SMA',
  bb: 'Bollinger Bands',
  vwap: 'VWAP',
  or: 'Opening range',
  rsi: 'RSI',
  macd: 'MACD',
};

export interface StudyLine {
  id: string;
  label: string;
  color: string;
  points: { time: number; value: number }[];
  dashed?: boolean;
}

export interface StudyPane {
  id: 'rsi' | 'macd';
  lines: StudyLine[];
  histogram: { time: number; value: number; color: string }[] | null;
  /** Horizontal guides: 30 and 70 for RSI, zero for MACD. */
  guides: number[];
}

export interface ChartStudies {
  overlays: StudyLine[];
  levels: { id: string; price: number; color: string; title: string }[];
  panes: StudyPane[];
}

const clampLength = (n: number, fallback: number) => (Number.isFinite(n) && n >= 1 && n <= 500 ? Math.round(n) : fallback);

export function buildStudies(bars: Bar[], sessionStart: number, s: StudySettings): ChartStudies {
  const closes = bars.map((b) => b.close);
  const overlays: StudyLine[] = [];
  const levels: ChartStudies['levels'] = [];
  const panes: StudyPane[] = [];

  for (const id of ['ema1', 'ema2'] as const) {
    if (!s[id].on) continue;
    const length = clampLength(s[id].length, DEFAULT_STUDIES[id].length);
    overlays.push({ id, label: `EMA ${length}`, color: STUDY_COLORS[id], points: points(bars, ema(closes, length)) });
  }
  if (s.sma.on) {
    const length = clampLength(s.sma.length, 50);
    overlays.push({ id: 'sma', label: `SMA ${length}`, color: STUDY_COLORS.sma, points: points(bars, sma(closes, length)) });
  }
  if (s.bb.on) {
    const length = clampLength(s.bb.length, 20);
    const bands = bollinger(closes, length, s.bb.mult > 0 ? s.bb.mult : 2);
    overlays.push({ id: 'bb-upper', label: `BB ${length} upper`, color: STUDY_COLORS.bb, points: points(bars, bands.upper) });
    overlays.push({ id: 'bb-mid', label: `BB ${length}`, color: STUDY_COLORS.bb, points: points(bars, bands.mid), dashed: true });
    overlays.push({ id: 'bb-lower', label: `BB ${length} lower`, color: STUDY_COLORS.bb, points: points(bars, bands.lower) });
  }
  if (s.vwap.on) overlays.push({ id: 'vwap', label: 'VWAP', color: STUDY_COLORS.vwap, points: points(bars, vwap(bars)) });
  if (s.or.on) {
    const minutes = clampLength(s.or.minutes, 15);
    const range = openingRange(bars, sessionStart, minutes);
    if (range) {
      levels.push({ id: 'or-high', price: range.high, color: STUDY_COLORS.or, title: `OR${minutes} high` });
      levels.push({ id: 'or-low', price: range.low, color: STUDY_COLORS.or, title: `OR${minutes} low` });
    }
  }
  if (s.rsi.on) {
    const length = clampLength(s.rsi.length, 14);
    panes.push({ id: 'rsi', lines: [{ id: 'rsi', label: `RSI ${length}`, color: STUDY_COLORS.rsi, points: points(bars, rsi(closes, length)) }], histogram: null, guides: [30, 70] });
  }
  if (s.macd.on) {
    const m = macd(closes, clampLength(s.macd.fast, 12), clampLength(s.macd.slow, 26), clampLength(s.macd.signal, 9));
    panes.push({
      id: 'macd',
      lines: [
        { id: 'macd', label: 'MACD', color: STUDY_COLORS.macd, points: points(bars, m.macd) },
        { id: 'macd-signal', label: 'Signal', color: '#fb923c', points: points(bars, m.signal) },
      ],
      histogram: points(bars, m.hist).map((p) => ({ ...p, color: p.value >= 0 ? 'rgba(74,222,128,0.5)' : 'rgba(248,113,113,0.5)' })),
      guides: [0],
    });
  }
  return { overlays, levels, panes };
}

const KEY = 'tc-replay-studies';

/** Saved choices over the defaults, so a study added later starts at its default. */
export function readStudies(raw: string | null): StudySettings {
  if (!raw) return DEFAULT_STUDIES;
  try {
    const saved = JSON.parse(raw) as Partial<Record<StudyId, Record<string, unknown>>>;
    const out = { ...DEFAULT_STUDIES } as Record<StudyId, Record<string, unknown>>;
    for (const id of Object.keys(DEFAULT_STUDIES) as StudyId[]) {
      const s = saved?.[id];
      if (s && typeof s === 'object') {
        out[id] = { ...out[id] };
        for (const [k, v] of Object.entries(DEFAULT_STUDIES[id])) {
          if (typeof s[k] === typeof v) out[id][k] = s[k];
        }
      }
    }
    return out as unknown as StudySettings;
  } catch {
    return DEFAULT_STUDIES;
  }
}

export function loadStudies(): StudySettings {
  try {
    return readStudies(localStorage.getItem(KEY));
  } catch {
    return DEFAULT_STUDIES;
  }
}

export function saveStudies(s: StudySettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Not remembered next time; this visit keeps them.
  }
}
