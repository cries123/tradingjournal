import { useId, useMemo, useState } from 'react';
import { demoJournal } from './landingDemo';
import { curvePoints, demoResult } from './simulatorDemo';
import { useCountUp } from '../../hooks/useCountUp';

/** One past the largest cap the slider offers means "no cap". */
const MAX_CAP = 12;
const NO_CAP = MAX_CAP + 1;
/** Not the best cap for the sample on purpose — finding that four does better is the demo. */
const START_CAP = 5;

function money(n: number, sign = false): string {
  const s = `$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
  if (n < 0) return `-${s}`;
  return sign ? `+${s}` : s;
}

/**
 * The rule simulator, on the landing page, with a slider.
 *
 * It is the Gold plan's headline and the one thing here no other journal's homepage can show: your
 * own month, replayed with a limit you did not keep. Drag the cap and the result, the trade-off and
 * the equity curve all move — motion that is the argument rather than decoration. It runs the same
 * simulateRules the app does, on the sample journal, and says so.
 */
export default function RuleSimulatorDemo({ onTry }: { onTry: () => void }) {
  const trades = useMemo(() => demoJournal(), []);
  const [cap, setCap] = useState(START_CAP);
  const result = useMemo(() => demoResult(trades, cap >= NO_CAP ? null : cap), [trades, cap]);
  const sliderId = useId();

  const simulated = useCountUp(result.simulated, 600);
  const difference = useCountUp(result.difference, 600);
  const {
    lines: [actualPts, simPts],
    zeroY,
  } = curvePoints([result.actualCurve, result.simulatedCurve], 600, 220);
  const helped = result.difference > 0;

  return (
    <div className="glass-card glow-border-brand rounded-2xl p-5 md:p-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:gap-10 items-center">
      <div>
        <label htmlFor={sliderId} className="text-xs uppercase tracking-widest text-text-secondary">
          Max trades per day
        </label>
        <div className="mt-2 flex items-baseline gap-3">
          <span className="text-4xl font-bold tabular-nums">{cap >= NO_CAP ? 'No cap' : cap}</span>
          {cap < NO_CAP && <span className="text-sm text-text-secondary">trades, then stop for the day</span>}
        </div>
        <input
          id={sliderId}
          type="range"
          min={1}
          max={NO_CAP}
          step={1}
          value={cap}
          onChange={(e) => setCap(Number(e.target.value))}
          className="mt-4 w-full accent-emerald-400 cursor-pointer"
          aria-valuetext={cap >= NO_CAP ? 'No cap' : `${cap} trades per day`}
        />

        <dl className="mt-6 grid grid-cols-3 gap-3">
          <div>
            <dt className="text-[11px] text-text-secondary">As traded</dt>
            <dd className={`text-lg md:text-xl font-bold tabular-nums ${result.actual >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>
              {money(result.actual)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-text-secondary">With the cap</dt>
            <dd className={`text-lg md:text-xl font-bold tabular-nums ${simulated >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>
              {money(simulated)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-text-secondary">Difference</dt>
            <dd className={`text-lg md:text-xl font-bold tabular-nums ${helped ? 'text-profit-bright' : 'text-text-secondary'}`}>
              {money(difference, true)}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-slate-300/80 leading-relaxed">
          {cap >= NO_CAP
            ? 'No limit set — this is the journal as it was traded.'
            : `${result.daysChanged} days cut short, ${result.tradesRemoved} trades removed. Too tight and a cap throws away winners too — try 1.`}
        </p>
        <button type="button" onClick={onTry} className="btn-primary text-sm px-6 py-2.5 mt-5">
          Replay your own trades
        </button>
      </div>

      <figure className="min-w-0">
        <svg viewBox="0 0 600 220" className="w-full h-auto overflow-visible" role="img" aria-label="Equity curve as traded and with the cap">
          <line x1={0} x2={600} y1={zeroY} y2={zeroY} stroke="rgba(148,163,184,0.25)" strokeWidth={1} />
          <polyline points={actualPts} fill="none" stroke="rgba(248,113,113,0.75)" strokeWidth={2} strokeDasharray="5 5" />
          <polyline points={simPts} fill="none" stroke="#34d399" strokeWidth={2.5} />
        </svg>
        <figcaption className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-text-secondary">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 border-t-2 border-dashed border-red-400/80" aria-hidden /> As traded
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 border-t-2 border-emerald-400" aria-hidden /> With the cap
          </span>
          <span>Sample journal · 30 trading days</span>
        </figcaption>
      </figure>
    </div>
  );
}
