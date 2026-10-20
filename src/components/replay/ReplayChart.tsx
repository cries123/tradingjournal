import { useEffect, useRef } from 'react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Bar } from '../../utils/marketReplay';
import { easternClock } from '../../utils/replayClock';

export interface ChartMarker {
  time: number;
  side: 'buy' | 'sell';
  text: string;
  /** A practice fill on the replay, or the trader's real fill that day. */
  kind: 'practice' | 'actual';
}

interface ReplayChartProps {
  /** What the replay has revealed so far, already at the chosen timeframe. */
  bars: Bar[];
  vwap: { time: number; value: number }[] | null;
  markers: ChartMarker[];
  /** Bars where a fill without a time could have happened: shaded, and labelled as an estimate. */
  estimates: number[];
  /** Changes when the instrument, day or timeframe does, to refit the view; a replay step does not. */
  fitKey: string;
  /**
   * Replaying: keep candles at a readable width and follow the newest one, as TradingView's replay
   * does. Fitting instead squeezes the whole session in when reviewing a day, but on a replay that
   * has revealed two bars it blows those two up to fill the chart.
   */
  following: boolean;
  onPickTime?: (time: number) => void;
}

/** The theme's colours, read once from the CSS variables the rest of the app uses. */
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

/**
 * The replay's chart: TradingView's open-source Lightweight Charts, so it reads like the charts
 * traders already use (candles, volume, crosshair, drag to pan, wheel to zoom).
 *
 * Its own file, loaded only when a replay opens, so the library is never in the bundle of a
 * screen that does not draw one. Times are drawn in New York time, the session's own clock,
 * whatever the trader's computer is set to.
 */
export default function ReplayChart({ bars, vwap, markers, estimates, fitKey, following, onPickTime }: ReplayChartProps) {
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const candles = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volume = useRef<ISeriesApi<'Histogram'> | null>(null);
  const vwapSeries = useRef<ISeriesApi<'Line'> | null>(null);
  const shade = useRef<ISeriesApi<'Histogram'> | null>(null);
  const markerApi = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const pick = useRef(onPickTime);
  const colors = useRef<ReturnType<typeof theme> | null>(null);

  useEffect(() => {
    pick.current = onPickTime;
  }, [onPickTime]);

  useEffect(() => {
    if (!box.current) return;
    const c = theme();
    colors.current = c;
    const api = createChart(box.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: c.text, fontSize: 11, attributionLogo: true },
      grid: { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.08)',
        timeVisible: true,
        secondsVisible: false,
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
    vwapSeries.current = api.addSeries(LineSeries, { color: 'rgba(96,165,250,0.9)', lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
    markerApi.current = createSeriesMarkers(candles.current, []);
    api.subscribeClick((param) => {
      if (param.time !== undefined) pick.current?.(Number(param.time));
    });
    chart.current = api;
    return () => {
      api.remove();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    const c = colors.current;
    if (!c || !candles.current || !volume.current) return;
    candles.current.setData(bars.map((b) => ({ time: asTime(b.time), open: b.open, high: b.high, low: b.low, close: b.close })));
    volume.current.setData(
      bars.map((b) => ({ time: asTime(b.time), value: b.volume, color: b.close >= b.open ? 'rgba(74,222,128,0.28)' : 'rgba(248,113,113,0.28)' })),
    );
    if (following) chart.current?.timeScale().scrollToRealTime();
  }, [bars, following]);

  useEffect(() => {
    vwapSeries.current?.setData(vwap ? vwap.map((p) => ({ time: asTime(p.time), value: p.value })) : []);
  }, [vwap]);

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
        color: m.kind === 'actual' ? c.accent : m.side === 'buy' ? c.up : c.down,
        text: m.text,
      }));
    markerApi.current.setMarkers(list);
  }, [markers]);

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

  return <div ref={box} className="h-full w-full" />;
}
