import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { IPhoneFrame } from './IPhoneFrame';
import { monthCurves, ordinal, signedMoney, STORY_CAP, STORY_DAY, storyDay, storyMonth, wholeMoney } from './landingStory';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The month's running total as a sparkline path, scaled into a w × h box. */
function sparkline(values: number[], w: number, h: number): string {
  if (values.length < 2) return '';
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const span = Math.max(1, hi - lo);
  return values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / (values.length - 1)) * w).toFixed(1)} ${(2 + (1 - (v - lo) / span) * (h - 4)).toFixed(1)}`)
    .join(' ');
}

/**
 * The hero's product shot: the Overview of the sample journal in a browser window, and in front of it
 * a phone with the worst day of the month open.
 *
 * Built from the page's one sample (landingStory.ts) rather than screenshots, because it is the
 * largest thing above the fold — HTML is crisp at every size, costs no image download, and is what
 * moves. The days tint in one after another, the days past the cap get their dot, the day the story
 * is about is tapped, and the phone rises with it open. All of that is CSS (see "The landing page's
 * product shots" in index.css), so the prerendered page plays it before any script has loaded.
 */
export function HeroStage() {
  const june = useMemo(() => storyMonth(), []);
  const day = useMemo(() => storyDay(), []);

  const equity = useMemo(() => monthCurves(june).actual, [june]);

  // Trading days tint in order, 0.12s apart, starting half a second in.
  let order = 0;
  const cells: { key: string; node: ReactNode }[] = [];
  for (let i = 0; i < june.leading; i++) cells.push({ key: `b${i}`, node: <div className="h-[46px]" /> });
  for (const d of june.days) {
    const traded = d.pnl !== null;
    const t = traded ? 0.5 + order++ * 0.12 : 0;
    const win = traded && (d.pnl ?? 0) >= 0;
    const tone = !traded
      ? 'bg-[#101010] border-[#1a1a1a] text-[#555]'
      : win
        ? 'hero-day bg-[rgba(122,255,69,0.1)] border-[rgba(122,255,69,0.35)] text-[#9fd88a]'
        : 'hero-day bg-[rgba(248,113,113,0.1)] border-[rgba(248,113,113,0.38)] text-[#d79a9a]';
    cells.push({
      key: d.date,
      node: (
        <div
          className={`relative h-[46px] rounded-[7px] border px-[5px] pt-1 text-[9px] ${tone} ${d.date === STORY_DAY ? 'hero-tap' : ''}`}
          style={traded ? ({ '--t': `${t.toFixed(2)}s` } as CSSProperties) : undefined}
        >
          {d.day}
          {d.brokeCap && (
            <span
              className="hero-dot absolute right-[5px] top-[5px] h-[7px] w-[7px] rounded-full bg-amber-400 shadow-[0_0_0_3px_rgba(245,184,61,0.18)]"
              style={{ '--t': `${t.toFixed(2)}s` } as CSSProperties}
            />
          )}
          {traded && (
            <span className={`absolute bottom-[5px] left-[5px] text-[10.5px] font-bold leading-none tabular-nums ${win ? 'text-profit-bright' : 'text-loss-bright'}`}>
              {wholeMoney(d.pnl ?? 0)}
            </span>
          )}
        </div>
      ),
    });
  }

  const wins = day.trades.filter((t) => t.pnl > 0).length;

  return (
    <div
      className="relative h-[430px] sm:h-[520px] lg:h-[600px]"
      role="img"
      aria-label={`The Overview of a sample journal for ${june.label}: ${signedMoney(june.net)} for the month, and the day sheet for ${day.label}.`}
    >
      {/* Scaled, not reflowed, below desktop: it is a picture of the app, and the app is laid out at this width. */}
      <div className="absolute left-0 top-0 w-[640px] origin-top-left scale-[0.56] sm:scale-[0.72] lg:scale-[0.86] xl:scale-100">
        <div className="hero-window w-[640px] overflow-hidden rounded-[18px] border border-white/[0.12] bg-[#070707] shadow-[0_40px_120px_rgba(0,0,0,0.8)]">
          <div className="flex h-9 items-center gap-[7px] border-b border-white/[0.07] bg-[#0b0b0b] px-3.5">
            <i className="h-2.5 w-2.5 rounded-full bg-[#2a2a2a]" />
            <i className="h-2.5 w-2.5 rounded-full bg-[#2a2a2a]" />
            <i className="h-2.5 w-2.5 rounded-full bg-[#2a2a2a]" />
            <span className="ml-3 text-xs text-text-secondary/70">trendchasers.net</span>
          </div>
          <div className="p-4">
            <div className="mb-3 flex items-baseline gap-2.5">
              <b className="text-lg font-bold">Overview</b>
              <span className="text-xs text-text-secondary">Sample journal · {june.label}</span>
              <em className="ml-auto rounded-lg bg-accent/[0.12] px-2.5 py-1 text-[11px] not-italic text-accent">Synced from Schwab</em>
            </div>

            <div className="mb-3 grid grid-cols-[1.35fr_1.2fr_1fr_1fr] rounded-xl border border-white/[0.07] bg-[#0a0a0a]">
              <div className="relative p-2.5 pr-3">
                <small className="block text-[10.5px] text-text-secondary">Net P&amp;L</small>
                <strong className="block text-[22px] font-bold leading-tight tabular-nums text-loss-bright">{signedMoney(june.net)}</strong>
                <em className="text-[10px] not-italic text-text-secondary">
                  {june.trades} trades · {june.greenDays + june.redDays} days
                </em>
                <svg className="draw-line absolute right-2.5 top-2.5" width="70" height="26" viewBox="0 0 70 26" aria-hidden>
                  <path d={sparkline(equity, 70, 26)} fill="none" stroke="var(--color-loss-bright)" strokeWidth="2" pathLength={1} />
                </svg>
              </div>
              <div className="border-l border-white/[0.07] p-2.5">
                <small className="block text-[10.5px] text-text-secondary">Stopped at {STORY_CAP} a day</small>
                <strong className="block text-[22px] font-bold leading-tight tabular-nums text-profit-bright">{signedMoney(june.cappedNet)}</strong>
                <em className="text-[10px] not-italic text-text-secondary">the same trades, capped</em>
              </div>
              <div className="border-l border-white/[0.07] p-2.5">
                <small className="block text-[10.5px] text-text-secondary">Days</small>
                <strong className="block text-[22px] font-bold leading-tight tabular-nums">{june.greenDays + june.redDays}</strong>
                <em className="text-[10px] not-italic">
                  <span className="text-profit-bright">{june.greenDays} green</span> · <span className="text-loss-bright">{june.redDays} red</span>
                </em>
              </div>
              <div className="border-l border-white/[0.07] p-2.5">
                <small className="block text-[10.5px] text-text-secondary">Past the cap</small>
                <strong className="block text-[22px] font-bold leading-tight tabular-nums text-amber-400">{june.capDays}</strong>
                <em className="text-[10px] not-italic text-text-secondary">days over {STORY_CAP} trades</em>
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.07] bg-[#0a0a0a] p-2.5">
              <div className="mb-2 flex justify-between text-[11.5px]">
                <b className="font-bold">Calendar</b>
                <span className="text-accent">{june.label.split(' ')[0]} report →</span>
              </div>
              <div className="grid grid-cols-7 gap-[5px]">
                {WEEKDAYS.map((w) => (
                  <div key={w} className="pb-0.5 text-center text-[9px] text-text-secondary/60">
                    {w}
                  </div>
                ))}
                {cells.map(({ key, node }) => (
                  <div key={key}>{node}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <IPhoneFrame className="hero-phone !absolute right-0 top-[110px] [--pw:168px] sm:top-[150px] sm:[--pw:222px] lg:-right-6 lg:top-[190px]">
        <PhoneDaySheet />
      </IPhoneFrame>
      <span className="sr-only">
        On {day.label} the journal shows {day.trades.length} trades, {wins} won, ending {signedMoney(day.total)}: the cap of{' '}
        {STORY_CAP} trades was passed from the {ordinal(STORY_CAP + 1)} trade.
      </span>
    </div>
  );
}

/** The phone's screen: the app's day sheet for the story's day, drawn at phone size. */
function PhoneDaySheet() {
  const day = useMemo(() => storyDay(), []);
  const wins = day.trades.filter((t) => t.pnl > 0).length;
  const [weekday, ...rest] = day.label.split(', ');
  const shortDate = new Date(`${day.date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

  return (
    <div className="h-full bg-[#0b0b0b] text-white" style={{ fontSize: 'calc(var(--pw) * 0.05)' }} aria-hidden>
      <div className="h-[1.6em] bg-black/60" />
      <div className="-mt-[0.6em] min-h-full rounded-t-[1.4em] border-t border-white/[0.08] bg-[#141414] px-[0.9em] pb-[2em]">
        <div className="mx-auto my-[0.5em] h-[0.22em] w-[2.6em] rounded-full bg-white/25" />
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[0.72em] text-text-secondary">{weekday}</div>
            <div className="text-[1.15em] font-bold">{shortDate}</div>
          </div>
          <div className="text-right">
            <div className="text-[1.2em] font-bold tabular-nums text-loss-bright">{signedMoney(day.total)}</div>
            <div className="text-[0.62em] text-text-secondary">
              {day.trades.length} trades · {wins}W {day.trades.length - wins}L
            </div>
          </div>
        </div>
        <div className="mt-[0.7em] rounded-[0.6em] border border-amber-400/40 bg-amber-400/[0.08] px-[0.6em] py-[0.45em] text-[0.66em] leading-snug">
          <span className="font-semibold text-amber-300">Max {STORY_CAP} trades a day.</span>{' '}
          <span className="text-amber-100/80">
            Took {day.trades.length}. Past it from the {ordinal(STORY_CAP + 1)} trade.
          </span>
        </div>
        <div className="mt-[0.8em] text-[0.7em] font-semibold text-text-secondary">Trades</div>
        {day.trades.slice(0, STORY_CAP).map((t) => (
          <div key={t.n} className="flex items-center justify-between border-b border-white/[0.06] py-[0.45em] text-[0.72em]">
            <span className="w-[2.6em] text-text-secondary">{ordinal(t.n)}</span>
            <span className="flex-1 font-semibold">SPY</span>
            <span className={`font-semibold tabular-nums ${t.pnl >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>{signedMoney(t.pnl)}</span>
          </div>
        ))}
        <div className="py-[0.45em] text-[0.68em] text-accent">+ {day.trades.length - STORY_CAP} more</div>
        <div className="mt-[0.3em] rounded-[0.7em] border border-accent/40 bg-accent/[0.06] p-[0.7em]">
          <div className="text-[0.64em] text-text-secondary">If you had stopped at {STORY_CAP}</div>
          <div className="text-[1.15em] font-bold tabular-nums text-profit-bright">
            {signedMoney(day.atCap)} <span className="text-[0.6em] font-medium text-text-secondary">not {signedMoney(day.total)}</span>
          </div>
        </div>
        <div className="mt-[0.9em] grid grid-cols-2 gap-[0.5em] text-[0.68em] font-semibold">
          <span className="rounded-full border border-white/15 py-[0.7em] text-center">Share day</span>
          <span className="rounded-full bg-accent py-[0.7em] text-center text-black">+ Log a trade</span>
        </div>
        <div className="mt-[0.4em] text-center text-[0.55em] text-text-secondary">{rest.join(', ')} · sample journal</div>
      </div>
    </div>
  );
}
