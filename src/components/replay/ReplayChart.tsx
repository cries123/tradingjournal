import { useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type MouseEventParams,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Bar } from '../../utils/marketReplay';
import type { ChartStudies } from '../../utils/replayStudies';
import { pointsFor, type ChartPoint, type Drawing, type DrawingTool } from '../../utils/replayDrawings';
import { easternClock } from '../../utils/replayClock';
import { DrawingLayer } from './drawingLayer';

export interface ChartMarker {
  time: number;
  side: 'buy' | 'sell';
  text: string;
  /** A practice fill, the trader's real fill that day, or the strategy tester's. */
  kind: 'practice' | 'actual' | 'strategy';
}

export interface ChartCommand {
  kind: 'in' | 'out' | 'fit';
  /** Bumped on every press, so the same command twice still runs twice. */
  n: number;
}

interface ReplayChartProps {
  /** What the replay has revealed so far, at the chosen timeframe and candle style. */
  bars: Bar[];
  studies: ChartStudies;
  markers: ChartMarker[];
  /** Bars where a fill without a time could have happened: shaded, and labelled as an estimate. */
  estimates: number[];
  /** Changes when the instrument, day or timeframe does, to refit the view; a replay step does not. */
  fitKey: string;
  /**
   * Replaying: keep candles at a readable width and follow the newest one, as TradingView's replay
   * does. Fitting instead would blow the first two revealed bars up to fill the chart.
   */
  following: boolean;
  timeframe: number;
  tool: DrawingTool;
  drawings: Drawing[];
  onDrawing: (d: Drawing) => void;
  /** A click on a candle with the cursor tool: start or move the replay there. */
  onPickTime?: (time: number) => void;
  command: ChartCommand | null;
}

interface Legend {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number | null;
}

function theme() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    up: v('--color-profit-bright', '#4ade80'),
    down: v('--color-loss-bright', '#f87171'),
    accent: v('--color-accent', '#7aff45'),
    text: v('--color-text-secondary', '#8a8a8a'),
  };
}

const asTime = (t: number) => t as UTCTimestamp;
/** Zoomed all the way out, a full 1-minute session (405 bars) still fits a 250px-wide phone chart. */
const MIN_SPACING = 0.6;
/** Zoomed all the way in, about a dozen candles fill a desktop chart; past that a bar is just a block. */
const MAX_SPACING = 60;
/** Each RSI or MACD pane's height against the price pane's 1: about a fifth of the chart for one, less each for two. */
const STUDY_PANE_SHARE = 0.28;
let nextId = 0;

/**
 * The replay's chart: TradingView's open-source Lightweight Charts, with what traders expect of a
 * TradingView chart on top. Candles and volume, studies on the price and in panes beneath it, a
 * legend that reads the candle under the crosshair, drag to pan and wheel to zoom, and trend lines,
 * horizontal levels and zones drawn on it.
 *
 * Its own file, loaded only when a replay opens, so the library is never in the bundle of a screen
 * that does not draw one. Times are New York time, the session's own clock.
 */
export default function ReplayChart(props: ReplayChartProps) {
  const { bars, studies, markers, estimates, fitKey, following, timeframe, tool, drawings, onDrawing, onPickTime, command } = props;
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const candles = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volume = useRef<ISeriesApi<'Histogram'> | null>(null);
  const shade = useRef<ISeriesApi<'Histogram'> | null>(null);
  const markerApi = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const layer = useRef<DrawingLayer | null>(null);
  const overlays = useRef(new Map<string, ISeriesApi<'Line'>>());
  const paneSeries = useRef<{ key: string; series: ISeriesApi<'Line' | 'Histogram'>[] }>({ key: '', series: [] });
  const levelLines = useRef<IPriceLine[]>([]);
  const hlines = useRef<IPriceLine[]>([]);
  const colors = useRef<ReturnType<typeof theme> | null>(null);
  const [legend, setLegend] = useState<Legend | null>(null);
  const [hoverValues, setHoverValues] = useState<{ label: string; color: string; value: number }[] | null>(null);

  // The latest props for the chart's own event handlers, which are subscribed once.
  const live = useRef({ tool, onDrawing, onPickTime, bars, studies });
  useEffect(() => {
    live.current = { tool, onDrawing, onPickTime, bars, studies };
  }, [tool, onDrawing, onPickTime, bars, studies]);
  const pending = useRef<ChartPoint | null>(null);
  const [preview, setPreview] = useState<Drawing | null>(null);

  useEffect(() => {
    if (!box.current) return;
    const c = theme();
    colors.current = c;
    const api = createChart(box.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: c.text,
        fontSize: 11,
        attributionLogo: true,
        panes: { separatorColor: 'rgba(255,255,255,0.08)', separatorHoverColor: 'rgba(255,255,255,0.18)' },
      },
      grid: { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.08)',
        timeVisible: true,
        secondsVisible: false,
        minBarSpacing: MIN_SPACING,
        tickMarkFormatter: (time: Time) => easternClock(Number(time)),
      },
      localization: { timeFormatter: (time: Time) => `${easternClock(Number(time))} ET` },
    });
    candles.current = api.addSeries(CandlestickSeries, {
      upColor: c.up,
      downColor: c.down,
      borderUpColor: c.up,
      borderDownColor: c.down,
      wickUpColor: c.up,
      wickDownColor: c.down,
    });
    volume.current = api.addSeries(HistogramSeries, { priceScaleId: 'volume', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
    api.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    shade.current = api.addSeries(HistogramSeries, { priceScaleId: 'shade', lastValueVisible: false, priceLineVisible: false, color: 'rgba(251,191,36,0.14)' });
    api.priceScale('shade').applyOptions({ scaleMargins: { top: 0, bottom: 0 }, visible: false });
    markerApi.current = createSeriesMarkers(candles.current, []);
    layer.current = new DrawingLayer();
    candles.current.attachPrimitive(layer.current);

    const pointAt = (param: MouseEventParams<Time>): ChartPoint | null => {
      const series = candles.current;
      if (!series || !param.point) return null;
      const price = series.coordinateToPrice(param.point.y);
      const shown = live.current.bars;
      const time = param.time !== undefined ? Number(param.time) : shown[shown.length - 1]?.time;
      return price === null || time === undefined ? null : { time, price: Number(price) };
    };

    // The cursor tool: a click on a candle starts or moves the replay there.
    api.subscribeClick((param) => {
      const { tool: t, onPickTime: pick } = live.current;
      if (t === 'cursor' && param.time !== undefined) pick?.(Number(param.time));
    });

    /*
     * The drawing tools listen to the browser's own clicks, not the chart's.
     *
     * The chart folds a second click within about half a second into a double-click, and when the
     * two are far apart it reports neither, so a trend line drawn at a natural pace lost its second
     * point. A DOM click arrives for every press; its position becomes a time (the candle under it,
     * or the nearest one) and a price, the same way the chart itself would.
     */
    const element = box.current;
    const onDomClick = (e: MouseEvent) => {
      const { tool: t, onDrawing: done } = live.current;
      const series = candles.current;
      if (t === 'cursor' || !series) return;
      const rect = element.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (y > (api.panes()[0]?.getHeight() ?? rect.height)) return; // a click in an indicator pane
      const price = series.coordinateToPrice(y);
      const time = timeAt(x);
      if (price === null || time === null) return;
      const p = { time, price: Number(price) };
      if (pointsFor(t) === 1) {
        done({ id: `d${Date.now()}${nextId++}`, kind: t, a: p });
      } else if (!pending.current) {
        pending.current = p;
      } else {
        done({ id: `d${Date.now()}${nextId++}`, kind: t, a: pending.current, b: p });
        pending.current = null;
        setPreview(null);
      }
    };
    /** The candle under an x position, or the nearest one when it falls between or past them. */
    const timeAt = (x: number): number | null => {
      const exact = api.timeScale().coordinateToTime(x);
      if (exact !== null) return Number(exact);
      const shown = live.current.bars;
      const logical = api.timeScale().coordinateToLogical(x);
      if (shown.length === 0) return null;
      const i = logical === null ? shown.length - 1 : Math.max(0, Math.min(shown.length - 1, Math.round(logical)));
      return shown[i].time;
    };
    element.addEventListener('click', onDomClick);

    api.subscribeCrosshairMove((param) => {
      const { tool: t } = live.current;
      if (pending.current && t !== 'cursor' && t !== 'hline') {
        const p = pointAt(param);
        if (p) setPreview({ id: 'preview', kind: t, a: pending.current, b: p });
      }
      const bar = candles.current ? (param.seriesData.get(candles.current) as { open?: number } | undefined) : undefined;
      if (param.time === undefined || !bar || bar.open === undefined) {
        setLegend(null);
        setHoverValues(null);
        return;
      }
      const shown = live.current.bars;
      const i = shown.findIndex((b) => b.time === Number(param.time));
      if (i >= 0) setLegend(legendFor(shown, i));
      setHoverValues(
        live.current.studies.overlays
          .map((o) => ({ label: o.label, color: o.color, value: o.points.find((p) => p.time === Number(param.time))?.value }))
          .filter((v): v is { label: string; color: string; value: number } => v.value !== undefined),
      );
    });

    chart.current = api;
    const overlayMap = overlays.current;
    return () => {
      element.removeEventListener('click', onDomClick);
      api.remove();
      chart.current = null;
      overlayMap.clear();
      paneSeries.current = { key: '', series: [] };
      levelLines.current = [];
      hlines.current = [];
    };
  }, []);

  // A half-drawn line is dropped when the tool changes.
  useEffect(() => {
    if (tool === 'cursor' || tool === 'hline') {
      pending.current = null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing a preview the chart drew, not deriving state
      setPreview(null);
    }
  }, [tool]);

  useEffect(() => {
    if (!candles.current || !volume.current) return;
    candles.current.setData(bars.map((b) => ({ time: asTime(b.time), open: b.open, high: b.high, low: b.low, close: b.close })));
    volume.current.setData(
      bars.map((b) => ({ time: asTime(b.time), value: b.volume, color: b.close >= b.open ? 'rgba(74,222,128,0.28)' : 'rgba(248,113,113,0.28)' })),
    );
    if (following) chart.current?.timeScale().scrollToRealTime();
  }, [bars, following]);

  // Studies on the price: one line series per study line, added and removed as they are switched.
  useEffect(() => {
    const api = chart.current;
    if (!api) return;
    const keep = new Set(studies.overlays.map((o) => o.id));
    for (const [id, series] of overlays.current) {
      if (!keep.has(id)) {
        api.removeSeries(series);
        overlays.current.delete(id);
      }
    }
    for (const o of studies.overlays) {
      let series = overlays.current.get(o.id);
      if (!series) {
        series = api.addSeries(LineSeries, { lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
        overlays.current.set(o.id, series);
      }
      series.applyOptions({ color: o.color, lineStyle: o.dashed ? LineStyle.Dashed : LineStyle.Solid });
      series.setData(o.points.map((p) => ({ time: asTime(p.time), value: p.value })));
    }

    // Levels (the opening range) as price lines, which also label the axis.
    for (const line of levelLines.current) candles.current?.removePriceLine(line);
    levelLines.current = studies.levels.flatMap((l) =>
      candles.current ? [candles.current.createPriceLine({ price: l.price, color: l.color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: l.title })] : [],
    );

    // Panes beneath: rebuilt when the set of panes changes, refilled on every update.
    const key = studies.panes.map((p) => p.id).join(',');
    if (paneSeries.current.key !== key) {
      for (const s of paneSeries.current.series) api.removeSeries(s);
      for (let i = api.panes().length - 1; i >= 1; i--) if (api.panes()[i].getSeries().length === 0) api.removePane(i);
      const created: ISeriesApi<'Line' | 'Histogram'>[] = [];
      studies.panes.forEach((pane, n) => {
        const index = n + 1;
        if (pane.histogram) created.push(api.addSeries(HistogramSeries, { lastValueVisible: false, priceLineVisible: false }, index));
        pane.lines.forEach((line, j) => {
          const s = api.addSeries(LineSeries, { color: line.color, lineWidth: 1, lastValueVisible: true, priceLineVisible: false, crosshairMarkerVisible: false }, index);
          if (j === 0) for (const g of pane.guides) s.createPriceLine({ price: g, color: 'rgba(255,255,255,0.18)', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: '' });
          created.push(s);
        });
      });
      /*
       * Sized as shares, once every pane exists. A fixed setHeight per pane, made as each was
       * added, was re-divided by the next one and left RSI 25px tall under MACD. Shares also
       * hold on a 360px phone chart and in full screen.
       */
      api.panes().forEach((p, i) => p.setStretchFactor(i === 0 ? 1 : STUDY_PANE_SHARE));
      paneSeries.current = { key, series: created };
    }
    let k = 0;
    for (const pane of studies.panes) {
      if (pane.histogram) (paneSeries.current.series[k++] as ISeriesApi<'Histogram'>).setData(pane.histogram.map((h) => ({ time: asTime(h.time), value: h.value, color: h.color })));
      for (const line of pane.lines) (paneSeries.current.series[k++] as ISeriesApi<'Line'>).setData(line.points.map((p) => ({ time: asTime(p.time), value: p.value })));
    }
  }, [studies]);

  useEffect(() => {
    shade.current?.setData(estimates.map((t) => ({ time: asTime(t), value: 1 })));
  }, [estimates]);

  useEffect(() => {
    const c = colors.current;
    if (!c || !markerApi.current) return;
    const list: SeriesMarker<Time>[] = [...markers]
      .sort((a, b) => a.time - b.time)
      .map((m) => ({
        time: asTime(m.time),
        position: m.side === 'buy' ? 'belowBar' : 'aboveBar',
        shape: m.kind === 'actual' ? 'circle' : m.side === 'buy' ? 'arrowUp' : 'arrowDown',
        color: m.kind === 'actual' ? c.accent : m.kind === 'strategy' ? '#38bdf8' : m.side === 'buy' ? c.up : c.down,
        text: m.text,
      }));
    markerApi.current.setMarkers(list);
  }, [markers]);

  // Drawings: horizontal lines as price lines, the rest on the drawing layer.
  useEffect(() => {
    const c = colors.current;
    const series = candles.current;
    if (!c || !series) return;
    for (const line of hlines.current) series.removePriceLine(line);
    hlines.current = drawings
      .filter((d) => d.kind === 'hline')
      .map((d) => series.createPriceLine({ price: d.a.price, color: c.accent, lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: '' }));
    layer.current?.update(drawings, preview, timeframe, bars.map((b) => b.time), c.accent);
  }, [drawings, preview, timeframe, bars]);

  useEffect(() => {
    const scale = chart.current?.timeScale();
    if (!scale) return;
    if (following) {
      scale.applyOptions({ barSpacing: 8, rightOffset: 14 });
      scale.scrollToRealTime();
    } else {
      scale.applyOptions({ rightOffset: 4 });
      scale.fitContent();
    }
  }, [fitKey, following]);

  // Zoom buttons: the same zoom the wheel does, a step at a time, about the latest candle.
  useEffect(() => {
    const scale = chart.current?.timeScale();
    if (!scale || !command) return;
    if (command.kind === 'fit') {
      scale.fitContent();
      return;
    }
    const spacing = scale.options().barSpacing;
    const next = command.kind === 'in' ? Math.min(MAX_SPACING, spacing * 1.35) : Math.max(MIN_SPACING, spacing / 1.35);
    scale.applyOptions({ barSpacing: next });
  }, [command]);

  const shown = legend ?? (bars.length > 0 ? legendFor(bars, bars.length - 1) : null);
  const values =
    hoverValues ??
    studies.overlays
      .map((o) => ({ label: o.label, color: o.color, value: o.points[o.points.length - 1]?.value }))
      .filter((v): v is { label: string; color: string; value: number } => v.value !== undefined);
  const up = shown ? shown.close >= shown.open : true;

  return (
    <div className="relative h-full w-full">
      <div ref={box} className={`h-full w-full ${tool === 'cursor' ? '' : 'cursor-crosshair'}`} />
      {/* The legend, where TradingView puts it: the candle under the crosshair, or the latest. */}
      {shown && (
        <div className="pointer-events-none absolute left-2 top-1.5 z-10 max-w-[calc(100%-80px)] text-[11px] leading-snug tabular-nums">
          <div className="flex flex-wrap gap-x-2">
            <span className="text-text-secondary">{easternClock(shown.time)}</span>
            {(['O', 'H', 'L', 'C'] as const).map((k, i) => (
              <span key={k} className="text-text-secondary">
                {k} <span className={up ? 'text-profit-bright' : 'text-loss-bright'}>{[shown.open, shown.high, shown.low, shown.close][i]}</span>
              </span>
            ))}
            {shown.change !== null && (
              <span className={shown.change >= 0 ? 'text-profit-bright' : 'text-loss-bright'}>
                {shown.change >= 0 ? '+' : ''}
                {shown.change.toFixed(2)}%
              </span>
            )}
            <span className="text-text-secondary">Vol {shown.volume.toLocaleString()}</span>
          </div>
          {values.length > 0 && (
            <div className="mt-0.5 flex flex-wrap gap-x-2.5">
              {values.map((v) => (
                <span key={v.label} style={{ color: v.color }}>
                  {v.label} {v.value.toFixed(2)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function legendFor(bars: Bar[], i: number): Legend {
  const b = bars[i];
  const prev = bars[i - 1];
  return {
    time: b.time,
    open: round(b.open),
    high: round(b.high),
    low: round(b.low),
    close: round(b.close),
    volume: b.volume,
    change: prev && prev.close !== 0 ? ((b.close - prev.close) / prev.close) * 100 : null,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
