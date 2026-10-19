import { useEffect, useMemo, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { numberWord, ordinal, signedMoney, STORY_CAP, storyDay, storyMonth } from './landingStory';

const capitalized = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The chart's drawing box, in viewBox units. */
const W = 700;
const H = 260;
const PAD_X = 24;
const TOP = 26;
const BOTTOM = 236;

/**
 * One day of the sample journal, played back as the reader scrolls.
 *
 * The page's one big motion moment, and the argument for the whole product in a single day: three
 * winners, then five losers past the cap, and the journal's sum of what stopping would have kept.
 * Every figure in the words comes from the same trades as the chart (landingStory.ts), so the copy
 * cannot drift from the picture.
 *
 * The first paint is the finished day — chart drawn, verdict shown — because that is what the
 * prerendered page, a reader without JavaScript and anyone asking for reduced motion should see. Only
 * once the section comes on screen with motion allowed does it rewind and play forward, one beat per
 * paragraph, as each paragraph crosses the middle of the screen.
 */
export function DayStory() {
  const day = useMemo(() => storyDay(), []);
  const june = useMemo(() => storyMonth(), []);
  const reduceMotion = usePrefersReducedMotion();
  const last = day.trades.length;
  const cap = Math.min(STORY_CAP, last);
  // Trades shown after each beat: none, up to the cap, two past it, the rest, and the verdict.
  const shownAt = [0, cap, Math.min(last, cap + 2), last, last];
  const [step, setStep] = useState(4);
  // False until the playback has started: until then every paragraph is shown at full strength too.
  const [live, setLive] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const beatRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (reduceMotion) return;
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;

    // Rewind once, as the section first comes on screen from below. A reader who lands below it, or
    // jumps past it, keeps the finished day.
    const arrive = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      if (entry.boundingClientRect.top > 0) {
        setStep(0);
        setLive(true);
      }
      arrive.disconnect();
    });
    arrive.observe(root);

    // Then each paragraph sets its beat as it crosses a band across the screen. On a phone the band
    // sits low, because the chart is pinned over the top half and the words are read under it.
    const phone = window.matchMedia('(max-width: 1023px)').matches;
    const beats = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setStep(Number((e.target as HTMLElement).dataset.step));
        }
      },
      { rootMargin: phone ? '-62% 0px -28% 0px' : '-45% 0px -45% 0px' },
    );
    beatRefs.current.forEach((b) => b && beats.observe(b));
    return () => {
      arrive.disconnect();
      beats.disconnect();
    };
  }, [reduceMotion]);

  const shownStep = reduceMotion ? 4 : step;
  const shown = shownAt[shownStep];
  const sofar = shown > 0 ? day.trades[shown - 1].running : 0;

  const lo = Math.min(0, ...day.trades.map((t) => t.running));
  const hi = Math.max(0, ...day.trades.map((t) => t.running));
  const x = (i: number) => PAD_X + (i * (W - PAD_X * 2)) / Math.max(1, last);
  const y = (v: number) => TOP + ((hi - v) / Math.max(1, hi - lo)) * (BOTTOM - TOP);
  const points = [{ px: x(0), py: y(0) }, ...day.trades.map((t, i) => ({ px: x(i + 1), py: y(t.running) }))];
  const capX = x(cap);
  const capWord = numberWord(STORY_CAP);
  const tone = (v: number) => (v >= 0 ? 'var(--color-profit-bright)' : 'var(--color-loss-bright)');

  const beats = [
    {
      kicker: `Trades 1 to ${cap}`,
      title: `${capitalized(numberWord(cap))} trades in, the day is green`,
      body: (
        <>
          After the {ordinal(cap)} trade the day stands at <b className="text-profit-bright">{signedMoney(day.atCap)}</b>, which is where the
          rule says to stop.
        </>
      ),
    },
    {
      kicker: `Trades ${cap + 1} and ${Math.min(last, cap + 2)}`,
      title: 'Past the cap, it turns',
      body: (
        <>
          Two losers take the day to <b className="text-loss-bright">{signedMoney(day.trades[shownAt[2] - 1].running)}</b>. The journal marks
          every trade after the {ordinal(cap)}, so you can see where the line was crossed.
        </>
      ),
    },
    {
      kicker: `Trades ${shownAt[2] + 1} to ${last}`,
      title: `${capitalized(numberWord(last - shownAt[2]))} more, and the day is gone`,
      body: (
        <>
          {last - shownAt[2] === 2 ? 'Neither wins' : 'None of them wins'} back what the last two lost. The day ends at{' '}
          <b className="text-loss-bright">{signedMoney(day.total)}</b>.
        </>
      ),
    },
    {
      kicker: 'The verdict',
      title: `Stopping at ${capWord} kept ${signedMoney(day.atCap)}`,
      body: (
        <>
          The trades after the cap cost {signedMoney(day.afterCap).replace('-', '')}. The journal does this sum for every day, and the rule
          simulator does it for the month: {june.label.split(' ')[0]} ended at {signedMoney(june.net)}, and stopped at {capWord} a day it would
          have made <b className="text-profit-bright">{signedMoney(june.cappedNet)}</b>.
        </>
      ),
    },
  ];

  return (
    <div ref={rootRef} className="mt-10 grid gap-0 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-14">
      <div className="sticky top-[116px] z-[2] self-start lg:top-[150px]">
        <div className="flex flex-col rounded-3xl border border-white/[0.07] bg-[#111] p-4 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <small className="text-[13px] text-text-secondary">Day so far</small>
              <strong
                className={`block text-[32px] font-bold leading-tight tabular-nums tracking-tight sm:text-[44px] ${
                  shown === 0 ? '' : sofar >= 0 ? 'text-profit-bright' : 'text-loss-bright'
                }`}
                aria-live="polite"
              >
                {shown === 0 ? '$0.00' : signedMoney(sofar)}
              </strong>
            </div>
            <div className="text-right text-[13px] text-text-secondary">
              <b className="block text-[15px] font-bold text-text-primary sm:text-[17px]">{day.label}</b>
              <span className="hidden sm:inline">Sample journal · rule: max {STORY_CAP} trades a day</span>
            </div>
          </div>

          <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 block h-[150px] w-full sm:h-[260px]" aria-hidden>
            <g className={`story-fade ${shown > cap ? 'is-shown' : ''}`}>
              <rect x={capX} y={0} width={W - capX} height={H} fill="rgba(245,184,61,0.06)" />
              <line x1={capX} x2={capX} y1={0} y2={H} stroke="#f5b83d" strokeDasharray="4 5" />
              <text x={capX + 8} y={H - 8} fill="#f5b83d" fontSize="12" fontFamily="Figtree, sans-serif">
                Past your {STORY_CAP}-trade cap
              </text>
            </g>
            <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.12)" />
            <text x={4} y={y(0) - 6} fill="#6b6b6b" fontSize="11" fontFamily="Figtree, sans-serif">
              $0
            </text>
            {points.slice(1).map((p, i) => (
              <path
                key={`s${i}`}
                className={`story-seg ${i + 1 <= shown ? 'is-shown' : ''}`}
                d={`M${points[i].px} ${points[i].py} L${p.px} ${p.py}`}
                fill="none"
                stroke={tone(day.trades[i].running)}
                strokeWidth="2.5"
                pathLength={1}
              />
            ))}
            <g className={`story-fade ${shownStep >= 4 ? 'is-shown' : ''}`}>
              <path
                d={`M${capX} ${y(day.atCap)} L${x(last)} ${y(day.atCap)}`}
                fill="none"
                stroke="var(--color-profit-bright)"
                strokeWidth="2.5"
                strokeDasharray="6 6"
              />
              <text x={capX + 8} y={y(day.atCap) - 10} fill="var(--color-profit-bright)" fontSize="13" fontWeight="700" fontFamily="Figtree, sans-serif">
                Stopped at {capWord}: {signedMoney(day.atCap)}
              </text>
            </g>
            {points.slice(1).map((p, i) => (
              <circle
                key={`p${i}`}
                className={`story-pt ${i + 1 <= shown ? 'is-shown' : ''}`}
                cx={p.px}
                cy={p.py}
                r="6"
                fill="#000"
                stroke={tone(day.trades[i].running)}
                strokeWidth="2.5"
              />
            ))}
          </svg>

          <div className="mt-4 hidden grid-cols-8 gap-1.5 lg:grid">
            {day.trades.map((t) => (
              <div
                key={t.n}
                className={`story-fade rounded-[10px] border px-2 py-2 text-[11.5px] text-text-secondary ${t.n <= shown ? 'is-shown' : ''} ${
                  t.pastCap ? 'border-amber-400/45 bg-amber-400/[0.05]' : 'border-white/[0.07] bg-[#0a0a0a]'
                }`}
              >
                {ordinal(t.n)} · SPY
                <b className={`block text-[13px] font-bold tabular-nums ${t.pnl >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>{signedMoney(t.pnl)}</b>
              </div>
            ))}
          </div>

          <div className={`story-fade mt-3 grid grid-cols-2 gap-2.5 ${shownStep >= 4 ? 'is-shown' : 'max-lg:hidden'}`}>
            <div className="rounded-2xl border border-white/[0.07] bg-[#0a0a0a] px-4 py-3">
              <small className="block text-[12.5px] text-text-secondary">What the day ended at</small>
              <strong className="text-[19px] font-bold tabular-nums text-loss-bright sm:text-[26px]">{signedMoney(day.total)}</strong>
            </div>
            <div className="rounded-2xl border border-accent/40 bg-accent/[0.06] px-4 py-3">
              <small className="block text-[12.5px] text-text-secondary">If you had stopped at {capWord}</small>
              <strong className="text-[19px] font-bold tabular-nums text-profit-bright sm:text-[26px]">{signedMoney(day.atCap)}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col pb-[10vh] lg:pb-[22vh]">
        {beats.map((b, i) => (
          <div
            key={b.kicker}
            ref={(el) => {
              beatRefs.current[i] = el;
            }}
            data-step={i + 1}
            className={`story-beat flex min-h-[52vh] flex-col justify-center lg:min-h-[62vh] ${!live || reduceMotion || shownStep === i + 1 ? 'is-on' : ''}`}
          >
            <p className="mb-3.5 text-[13px] font-bold text-accent">{b.kicker}</p>
            <h3 className="public-display text-2xl sm:text-[30px]">{b.title}</h3>
            <p className="mt-3 max-w-[440px] text-[17px] leading-relaxed text-[#bdbdbd]">{b.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
