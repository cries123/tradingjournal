import { useMemo, type ReactNode } from 'react';
import { IPhoneFrame } from './IPhoneFrame';
import { monthCurves, signedMoney, STORY_CAP, storyMonth } from './landingStory';
import { shot, type LandingShot } from './landingShots';

/**
 * A screenshot of the real app, with the phone's own screenshot swapped in at phone width — a 1440px
 * screen shrunk to 360px is unreadable, and the phone screen is what that visitor will actually use.
 * Lazy, decoded off the main thread, and sized up front so nothing jumps as it arrives.
 */
function Shot({ desktop, phone, alt }: { desktop: LandingShot; phone?: LandingShot; alt: string }) {
  const d = shot(desktop);
  const p = phone ? shot(phone) : null;
  return (
    <picture>
      {p && <source media="(max-width: 1023px)" srcSet={p.src} width={p.width} height={p.height} />}
      <img src={d.src} alt={alt} width={d.width} height={d.height} loading="lazy" decoding="async" className="block h-auto w-full" />
    </picture>
  );
}

function Card({ className = '', title, body, children }: { className?: string; title: string; body: string; children: ReactNode }) {
  return (
    <article className={`bento-card relative flex flex-col overflow-hidden rounded-3xl border border-white/[0.07] bg-[#141414] ${className}`}>
      <div className="px-6 pb-4 pt-6 sm:px-[26px]">
        <h3 className="text-[21px] font-semibold tracking-tight">{title}</h3>
        <p className="mt-1.5 max-w-[520px] text-[15px] leading-relaxed text-text-secondary">{body}</p>
      </div>
      {children}
    </article>
  );
}

/** The frame a screenshot sits in: the top of a window rising out of the card's bottom edge. */
const PIC = 'mx-4 mt-auto overflow-hidden rounded-t-[14px] border border-b-0 border-white/[0.12] shadow-[0_-10px_60px_rgba(0,0,0,0.6)] sm:mx-[22px]';

/** Two lines over the month: as it was, and stopped at the cap. What the simulator draws. */
function SimulatorChart() {
  const june = useMemo(() => storyMonth(), []);
  const { actual, capped } = useMemo(() => monthCurves(june), [june]);
  const W = 320;
  const H = 120;
  const lo = Math.min(0, ...actual, ...capped);
  const hi = Math.max(0, ...actual, ...capped);
  const path = (values: number[]) =>
    values
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / (values.length - 1)) * W).toFixed(1)} ${(6 + ((hi - v) / (hi - lo)) * (H - 12)).toFixed(1)}`)
      .join(' ');
  const zero = 6 + (hi / (hi - lo)) * (H - 12);

  return (
    <div className="mx-4 mb-5 mt-auto rounded-2xl border border-white/[0.07] bg-[#0a0a0a] p-4 sm:mx-[22px] sm:mb-[22px]">
      <div className="flex justify-between text-[13px] text-text-secondary">
        <span>Sample journal, {june.label}</span>
        <b className="text-text-primary">Max {STORY_CAP} trades a day</b>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 block h-[110px] w-full" aria-hidden>
        <line x1={0} x2={W} y1={zero} y2={zero} stroke="rgba(255,255,255,0.12)" />
        <path d={path(actual)} fill="none" stroke="var(--color-loss-bright)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <path d={path(capped)} fill="none" stroke="var(--color-profit-bright)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-white/[0.07] bg-[#111] p-3">
          <small className="block text-[11.5px] text-text-secondary">As it was</small>
          <strong className="text-xl font-bold tabular-nums text-loss-bright">{signedMoney(june.net)}</strong>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-[#111] p-3">
          <small className="block text-[11.5px] text-text-secondary">Stopped at {STORY_CAP} a day</small>
          <strong className="text-xl font-bold tabular-nums text-profit-bright">{signedMoney(june.cappedNet)}</strong>
        </div>
      </div>
    </div>
  );
}

/**
 * "See": the journal's screens, one card each, in a grid where the biggest card is the screen that
 * does the most work. Screenshots of the real app on the landing page's sample journal (rendered from
 * the components, not drawn), so what is advertised is exactly what opens.
 */
export function FeatureBento() {
  return (
    <div className="mt-12 grid gap-[18px] lg:grid-cols-12">
      <Card
        className="lg:col-span-8"
        title="Performance"
        body="Where the money goes, where it comes from, and the one change that would have made the biggest difference."
      >
        <div className={PIC}>
          <Shot desktop="shot-performance.webp" phone="phone-performance.webp" alt="The Performance screen: the month's figures and where the money went" />
        </div>
      </Card>
      <Card
        className="lg:col-span-4 lg:row-span-2"
        title="Ask your journal"
        body="Ask why a month went red. It answers from your own figures, and it never tells you what to trade next."
      >
        <div className={`${PIC} lg:mt-1`}>
          <Shot desktop="shot-ask.webp" phone="phone-ask.webp" alt="The assistant explaining why June went red" />
        </div>
      </Card>
      <Card className="lg:col-span-4" title="Every day, trade by trade" body="The running total after each trade, and where your cap was passed.">
        <div className={PIC}>
          <Shot desktop="shot-day.webp" phone="phone-day.webp" alt="A day's running total with the cap marked" />
        </div>
      </Card>
      <Card className="lg:col-span-4" title="The month on a calendar" body="Green and red days, week totals, and a dot on every day you broke a rule.">
        <div className={PIC}>
          <Shot desktop="shot-calendar.webp" phone="phone-calendar.webp" alt="The P&L calendar for June" />
        </div>
      </Card>
      <Card className="lg:col-span-5" title="Every trade, in full" body="Where it sat in its day, what the day did after it, and the rule it broke.">
        {/* Cut at the rule it broke: the whole panel is twice the height of the cards beside it. */}
        <div className={`${PIC} relative max-h-[420px]`}>
          <Shot desktop="shot-trade.webp" alt="One trade's detail: its place in the day, what the day did after it, and the cap it went past" />
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-b from-transparent to-[#141414]" />
        </div>
      </Card>
      <Card className="lg:col-span-4" title="Rule simulator" body="Replay your own month with a trade cap and see what it would have kept.">
        <SimulatorChart />
      </Card>
      <Card
        className="bg-[radial-gradient(120%_80%_at_50%_100%,rgba(122,255,69,0.14),#141414_60%)] max-lg:hidden lg:col-span-3"
        title="On your phone"
        body="Same journal, same login."
      >
        <IPhoneFrame width={190} className="mx-auto -mb-[150px] mt-auto">
          <img {...shot('phone-overview.webp')} alt="The Overview on a phone" loading="lazy" decoding="async" />
        </IPhoneFrame>
      </Card>
    </div>
  );
}
