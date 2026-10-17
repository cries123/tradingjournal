import { useMemo } from 'react';
import { Bot, Gauge, LayoutDashboard, Lightbulb, Menu, Plus } from 'lucide-react';
import { DashboardPreview } from './DashboardPreview';
import { demoInsights, demoJournal } from './landingDemo';

function money(n: number): string {
  return `$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/**
 * The journal on a phone, drawn as a phone.
 *
 * It already is an app on one — installable from the browser, full screen, its own icon — and the
 * page never said so beyond a line in the FAQ. This shows the phone Overview as a member sees it:
 * the header, the calendar's last two weeks with the sync landing (the same live preview the hero
 * runs, in its phone size), one insight worked out from the sample journal, and the bottom nav.
 *
 * Everything inside the frame is decorative for assistive tech except the preview's own text, which
 * already says it is a sample; the frame is a picture of the app, not a second copy of it to tab
 * through.
 */
export function PhoneShowcase() {
  const leak = useMemo(() => demoInsights(demoJournal()).afterFourthPnl, []);

  return (
    <div className="relative mx-auto w-[300px] max-w-full sm:w-[320px]">
      {/* The glow it sits in: the only lit thing in the section. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-16 -z-10"
        style={{ background: 'radial-gradient(ellipse 50% 45% at 50% 55%, rgba(var(--color-accent-rgb), 0.22), transparent 70%)' }}
      />
      <div className="rounded-[2.75rem] border border-white/10 bg-[#0d0d0d] p-2.5 shadow-[0_40px_120px_rgba(0,0,0,0.8)]">
        <div className="relative overflow-hidden rounded-[2.2rem] bg-black">
          {/* Status bar and the island. */}
          <div className="relative flex h-9 items-center justify-between px-6 text-[11px] font-semibold" aria-hidden>
            <span>9:41</span>
            <span className="absolute left-1/2 top-2 h-5 w-20 -translate-x-1/2 rounded-full bg-[#0d0d0d]" />
            <span className="flex items-center gap-1">
              <span className="h-2 w-3 rounded-[2px] bg-white/80" />
              <span className="h-2.5 w-5 rounded-[3px] border border-white/70" />
            </span>
          </div>

          {/* The app's own header. */}
          <div className="flex items-center justify-between px-4 pb-2" aria-hidden>
            <div className="flex items-center gap-2">
              <img src="/logo-mark.svg" alt="" className="h-6 w-6" />
              <span className="text-sm font-semibold">Overview</span>
            </div>
            <span className="grid h-7 w-7 place-items-center rounded-full bg-accent/15 text-[11px] font-bold text-accent">T</span>
          </div>

          <div className="space-y-2 px-2.5 pb-3">
            <DashboardPreview variant="compact" />
            <div className="flex items-start gap-2.5 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2.5" aria-hidden>
              <Lightbulb size={14} className="mt-0.5 shrink-0 text-amber-300" />
              <p className="text-[11px] leading-snug text-text-primary">
                <span className="font-semibold text-amber-300">Worth fixing · </span>
                every trade after your fourth of the day cost you{' '}
                <span className="font-semibold text-loss-bright">{money(leak)}</span>
                <span className="text-text-secondary"> · sample journal</span>
              </p>
            </div>
          </div>

          {/* The bottom nav, as the phone app draws it. */}
          <div className="flex items-end justify-around border-t border-white/5 bg-[#0a0a0a] px-2 pb-4 pt-2 text-[9px] text-text-secondary" aria-hidden>
            <span className="flex flex-col items-center gap-1 text-accent">
              <LayoutDashboard size={16} />
              Overview
            </span>
            <span className="flex flex-col items-center gap-1">
              <Gauge size={16} />
              Performance
            </span>
            <span className="-mt-4 grid h-10 w-10 place-items-center rounded-full bg-accent text-black">
              <Plus size={18} />
            </span>
            <span className="flex flex-col items-center gap-1">
              <Bot size={16} />
              Ask
            </span>
            <span className="flex flex-col items-center gap-1">
              <Menu size={16} />
              More
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
