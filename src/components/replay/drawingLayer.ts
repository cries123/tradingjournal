import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts';
import { snapTime, type Drawing } from '../../utils/replayDrawings';

type Target = Parameters<IPrimitivePaneRenderer['draw']>[0];

/**
 * Trend lines and zones, drawn on the chart's own canvas so they pan and zoom with the candles.
 *
 * A series primitive, Lightweight Charts' extension point for drawings: the chart asks it to paint
 * on every frame, and it turns each drawing's (time, price) points into pixels at that moment.
 * Horizontal lines are not here: they are the chart's own price lines, which also label the axis.
 *
 * A point whose time has no candle (a sparse option minute, or a coarser timeframe) is moved to
 * the nearest candle at or before it, so a line never vanishes because its minute did not trade.
 */
export class DrawingLayer implements ISeriesPrimitive<Time> {
  private param: SeriesAttachedParameter<Time> | null = null;
  private drawings: Drawing[] = [];
  private preview: Drawing | null = null;
  private timeframe = 1;
  private times: number[] = [];
  private color = '#7aff45';
  private readonly views: readonly IPrimitivePaneView[];

  constructor() {
    const renderer: IPrimitivePaneRenderer = { draw: (target) => this.draw(target) };
    this.views = [{ zOrder: () => 'top', renderer: () => renderer }];
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this.param = param;
  }

  detached(): void {
    this.param = null;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this.views;
  }

  update(drawings: Drawing[], preview: Drawing | null, timeframe: number, times: number[], color: string): void {
    this.drawings = drawings;
    this.preview = preview;
    this.timeframe = timeframe;
    this.times = times;
    this.color = color;
    this.param?.requestUpdate();
  }

  /** The candle at or before a time, by binary search over the drawn candles' times. */
  private nearest(time: number): number | null {
    const t = snapTime(time, this.timeframe);
    const list = this.times;
    if (list.length === 0) return null;
    let lo = 0;
    let hi = list.length - 1;
    if (t <= list[0]) return list[0];
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (list[mid] <= t) lo = mid;
      else hi = mid - 1;
    }
    return list[lo];
  }

  private xy(point: { time: number; price: number }): { x: number; y: number } | null {
    if (!this.param) return null;
    const time = this.nearest(point.time);
    if (time === null) return null;
    const x = this.param.chart.timeScale().timeToCoordinate(time as Time);
    const y = this.param.series.priceToCoordinate(point.price);
    return x === null || y === null ? null : { x, y };
  }

  private draw(target: Target): void {
    target.useMediaCoordinateSpace(({ context: ctx }) => {
      const all = this.preview ? [...this.drawings, this.preview] : this.drawings;
      for (const d of all) {
        if (d.kind === 'hline' || !d.b) continue;
        const a = this.xy(d.a);
        const b = this.xy(d.b);
        if (!a || !b) continue;
        const isPreview = d === this.preview;
        ctx.save();
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 1.5;
        if (isPreview) ctx.setLineDash([5, 4]);
        if (d.kind === 'trend') {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          ctx.fillStyle = this.color;
          for (const p of [a, b]) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          const x = Math.min(a.x, b.x);
          const y = Math.min(a.y, b.y);
          const w = Math.abs(a.x - b.x);
          const h = Math.abs(a.y - b.y);
          ctx.globalAlpha = 0.12;
          ctx.fillStyle = this.color;
          ctx.fillRect(x, y, w, h);
          ctx.globalAlpha = 0.7;
          ctx.strokeRect(x, y, w, h);
        }
        ctx.restore();
      }
    });
  }
}
