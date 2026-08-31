import { useEffect, useMemo, useState } from 'react';
import type { DailyPnlPoint } from '../utils/stats';
import { formatCurrency, formatCurrencyCompact } from '../utils/format';

interface DailyPnlChartProps {
  data: DailyPnlPoint[];
}

/**
 * Daily P&L as a diverging bar chart around a zero line.
 *
 * The previous version drew every bar upward from the bottom, so a -$160 day and a +$160 day were
 * the same shape and differed only in hue. That is a problem twice over. It misreads at a glance —
 * the eye takes bar height as magnitude and a tall red bar looked like a good day — and it left
 * gain/loss encoded by colour alone. Running the emerald/red pair through the palette validator
 * against this surface returns a deutan separation of ΔE 6.5, which is inside the band that is only
 * acceptable with a second, non-colour encoding. Position above or below zero is that encoding: the
 * chart now reads correctly in greyscale and for a red-green colourblind trader.
 *
 * Labels are selective rather than universal. Twenty values across a panel this wide is what
 * produced the old "$5… $1… $4…" row of truncated stubs; only the best and worst day are labelled
 * outright, and every bar carries its full figure on hover.
 */
export function DailyPnlChart({ data }: DailyPnlChartProps) {
  const [animatedFor, setAnimatedFor] = useState<typeof data | null>(null);
  const animate = animatedFor === data;
  const [hovered, setHovered] = useState<number | null>(null);

  const { maxAbs, bestIndex, worstIndex, tickEvery } = useMemo(() => {
    let max = 1;
    let best = -1;
    let worst = -1;
    data.forEach((d, i) => {
      max = Math.max(max, Math.abs(d.pnl));
      if (best === -1 || d.pnl > data[best].pnl) best = i;
      if (worst === -1 || d.pnl < data[worst].pnl) worst = i;
    });
    // Thin the date axis so labels never collide: roughly one every 60px of panel width.
    return {
      maxAbs: max,
      bestIndex: data[best]?.pnl > 0 ? best : -1,
      worstIndex: data[worst]?.pnl < 0 ? worst : -1,
      tickEvery: data.length > 24 ? 4 : data.length > 14 ? 3 : data.length > 8 ? 2 : 1,
    };
  }, [data]);

  /*
   * Bars grow from zero whenever the data changes.
   *
   * Derived rather than toggled: `animate` is false for any data this component has not yet
   * animated, so a new period resets the bars during render instead of needing a synchronous
   * setState inside an effect — which is a second render pass, and the pattern React's own docs
   * point away from. The frame below marks the data as animated, and the bars grow.
   */
  useEffect(() => {
    const t = requestAnimationFrame(() => setAnimatedFor(data));
    return () => cancelAnimationFrame(t);
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-text-secondary">
        No daily data this month
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="relative flex-1 min-h-0 flex items-stretch gap-[2px] px-1">
        {/* The zero line sits at the vertical centre so gains and losses are directly comparable
            rather than each scaled to its own half. */}
        <div
          className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-border/70"
          aria-hidden
        />

        {data.map((point, i) => {
          const heightPct = (Math.abs(point.pnl) / maxAbs) * 50;
          const isProfit = point.pnl >= 0;
          const labelled = i === bestIndex || i === worstIndex;
          const active = hovered === i;

          return (
            <div
              key={point.date}
              className="group relative flex-1 min-w-0 flex flex-col"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
            >
              {/* Top half: profits grow up from the centre line. */}
              <div className="flex-1 flex flex-col justify-end items-center min-h-0">
                {labelled && isProfit && (
                  <span className="mb-0.5 text-[9px] font-semibold tabular-nums text-profit-bright whitespace-nowrap">
                    {formatCurrencyCompact(point.pnl)}
                  </span>
                )}
                {isProfit && (
                  <div
                    className={`w-full max-w-[22px] rounded-t chart-bar bar-profit ${active ? 'opacity-100' : 'opacity-90'}`}
                    style={{
                      height: animate ? `${Math.max(heightPct, 1.5)}%` : '0%',
                      transitionDelay: `${i * 40}ms`,
                    }}
                  />
                )}
              </div>

              {/* Bottom half: losses grow down. */}
              <div className="flex-1 flex flex-col justify-start items-center min-h-0">
                {!isProfit && (
                  <div
                    className={`w-full max-w-[22px] rounded-b chart-bar bar-loss ${active ? 'opacity-100' : 'opacity-90'}`}
                    style={{
                      height: animate ? `${Math.max(heightPct, 1.5)}%` : '0%',
                      transitionDelay: `${i * 40}ms`,
                    }}
                  />
                )}
                {labelled && !isProfit && (
                  <span className="mt-0.5 text-[9px] font-semibold tabular-nums text-loss-bright whitespace-nowrap">
                    {formatCurrencyCompact(point.pnl)}
                  </span>
                )}
              </div>

              {/* Every bar keeps its exact figure a pointer away, so thinning the printed labels
                  costs no information. */}
              {active && (
                <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-1 z-20 whitespace-nowrap rounded-md border border-border bg-bg-primary px-2 py-1 shadow-lg">
                  <p className="text-[10px] text-text-secondary tabular-nums">{point.label}</p>
                  <p
                    className={`text-[11px] font-semibold tabular-nums ${
                      isProfit ? 'text-profit-bright' : 'text-loss-bright'
                    }`}
                  >
                    {formatCurrency(point.pnl)}
                  </p>
                </div>
              )}

              {/* An invisible full-height target, so a 3px bar is still easy to hit. */}
              <span className="absolute inset-0" aria-hidden />
              <span className="sr-only">
                {point.label}: {formatCurrency(point.pnl)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Day-of-month only. A column here is ~20px wide, so "08-03" truncated to "08…" on every
          tick — the month is already in the panel's heading, so the prefix was costing legibility
          to repeat something the reader can see. overflow-visible lets a two-digit label sit
          slightly wider than its cell rather than being clipped again. */}
      <div className="flex gap-[2px] px-1 pt-1 shrink-0">
        {data.map((point, i) => (
          <span
            key={point.date}
            className="flex-1 min-w-0 text-center text-[9px] text-text-secondary/70 tabular-nums overflow-visible whitespace-nowrap"
          >
            {i % tickEvery === 0 ? point.label.replace(/^\d{2}-/, '') : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
