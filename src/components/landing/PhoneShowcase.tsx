import { useMemo } from 'react';
import { BatteryFull, Bot, Gauge, LayoutDashboard, Lightbulb, Menu, Plus, Signal, Wifi } from 'lucide-react';
import { DashboardPreview } from './DashboardPreview';
import { demoInsights, demoJournal, monthStats, sampleMonth, SYNC_DAYS, visibleDays } from './landingDemo';

function money(n: number): string {
  return `$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/**
 * The journal on a phone, drawn as a phone.
 *
 * It already is an app on one — installable from the browser, full screen, its own icon — and the
 * page never said so beyond a line in the FAQ. This is the phone Overview as a member sees it, in a
 * handset with the proportions of one: a 19.5:9 screen, the island, the volume and power buttons,
 * a bezel with a lit edge, and the home bar. The screen is the whole phone, not a card inside a
 * frame, which is what made the first version read as a widget in a rounded box.
 *
 * Inside: the status bar, the app header, the calendar's last two weeks with the sync landing (the
 * same live preview the hero runs, in its phone size), one insight worked out from the sample
 * journal, the week's figures, and the bottom nav. Everything is decorative for assistive tech
 * except the preview's own text, which already says it is a sample; the frame is a picture of the
 * app, not a second copy of it to tab through.
 */
export function PhoneShowcase() {
  const journal = useMemo(() => demoJournal(), []);
  const insight = useMemo(() => demoInsights(journal), [journal]);
  // The three most recent sample trades, as the Overview's list shows them.
  const recent = useMemo(
    () => [...journal].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, 3),
    [journal],
  );
  // The same month the preview shows, finished, for the week's figures under it.
  const week = useMemo(() => {
    const now = new Date();
    const m = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    const y = m === 11 ? now.getFullYear() - 1 : now.getFullYear();
    const month = sampleMonth(y, m);
    const stats = monthStats(visibleDays(month, SYNC_DAYS));
    return { winRate: stats.winRate, avgPerDay: stats.avgPerDay, streak: stats.streak };
  }, []);

  return (
    <div className="relative mx-auto w-[290px] sm:w-[320px]">
      {/* The glow it sits in: the only lit thing in the section. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-20 -z-10"
        style={{ background: 'radial-gradient(ellipse 55% 50% at 50% 55%, rgba(var(--color-accent-rgb), 0.22), transparent 70%)' }}
      />

      {/* Side buttons: silent switch, volume up and down on the left; power on the right. */}
      <span aria-hidden className="absolute -left-[3px] top-[104px] h-7 w-[3px] rounded-l-sm bg-[#3a3a3a]" />
      <span aria-hidden className="absolute -left-[3px] top-[150px] h-12 w-[3px] rounded-l-sm bg-[#3a3a3a]" />
      <span aria-hidden className="absolute -left-[3px] top-[210px] h-12 w-[3px] rounded-l-sm bg-[#3a3a3a]" />
      <span aria-hidden className="absolute -right-[3px] top-[170px] h-20 w-[3px] rounded-r-sm bg-[#3a3a3a]" />

      {/* The handset: a bezel with a lit edge, a hairline inside it, and the screen filling it. */}
      <div
        className="relative aspect-[9/19.5] rounded-[3.1rem] p-[9px]"
        style={{
          background: 'linear-gradient(160deg, #3a3a3a 0%, #161616 30%, #0f0f0f 70%, #2a2a2a 100%)',
          boxShadow: '0 50px 140px rgba(0,0,0,0.85), inset 0 0 0 1.5px rgba(255,255,255,0.06)',
        }}
      >
        <div className="relative flex h-full flex-col overflow-hidden rounded-[2.55rem] bg-black ring-1 ring-black">
          {/* Status bar and the island. */}
          <div className="relative flex h-[46px] shrink-0 items-end justify-between px-7 pb-2 text-[12px] font-semibold" aria-hidden>
            <span>9:41</span>
            <span className="absolute left-1/2 top-[10px] h-[26px] w-[88px] -translate-x-1/2 rounded-full bg-black ring-1 ring-white/[0.07]" />
            <span className="flex items-center gap-1.5 text-white/90">
              <Signal size={13} />
              <Wifi size={13} />
              <BatteryFull size={16} />
            </span>
          </div>

          {/* The app's own header. */}
          <div className="flex shrink-0 items-center justify-between px-4 pb-2 pt-1" aria-hidden>
            <div className="flex items-center gap-2">
              <img src="/logo-mark.svg" alt="" className="h-6 w-6" />
              <span className="text-[15px] font-semibold">Overview</span>
            </div>
            <span className="grid h-7 w-7 place-items-center rounded-full bg-accent/15 text-[11px] font-bold text-accent">T</span>
          </div>

          {/* The screen's content. Fills the height; the nav is pinned under it. */}
          <div className="flex min-h-0 flex-1 flex-col gap-2 px-2.5 pb-2">
            <DashboardPreview variant="compact" />

            <div className="flex items-start gap-2.5 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2.5" aria-hidden>
              <Lightbulb size={14} className="mt-0.5 shrink-0 text-amber-300" />
              <p className="text-[11px] leading-snug text-text-primary">
                <span className="font-semibold text-amber-300">Worth fixing · </span>
                every trade after your fourth of the day cost you{' '}
                <span className="font-semibold text-loss-bright">{money(insight.afterFourthPnl)}</span>
                <span className="text-text-secondary"> · sample journal</span>
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2" aria-hidden>
              {[
                { label: 'Win rate', value: `${week.winRate}%` },
                { label: 'Avg / day', value: money(week.avgPerDay) },
                { label: 'Streak', value: `${week.streak} ${week.streak === 1 ? 'day' : 'days'}` },
              ].map((t) => (
                <div key={t.label} className="rounded-xl bg-[#121212] px-2.5 py-2">
                  <p className="text-[9px] uppercase tracking-wider text-text-secondary">{t.label}</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-profit-bright">{t.value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl bg-[#121212] px-3 py-2.5" aria-hidden>
              <p className="text-[9px] uppercase tracking-wider text-text-secondary">Recent trades · sample</p>
              <ul className="mt-1.5 divide-y divide-white/5">
                {recent.map((t) => (
                  <li key={t.id} className="flex items-center justify-between py-1.5 text-[11px]">
                    <span>
                      <span className="font-semibold">{t.symbol}</span>
                      {t.setup && <span className="text-text-secondary"> · {t.setup}</span>}
                    </span>
                    <span className={`font-semibold tabular-nums ${t.pnl >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>
                      {t.pnl >= 0 ? '+' : '-'}
                      {money(t.pnl)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* The bottom nav, as the phone app draws it, then the home bar. */}
          <div className="shrink-0 border-t border-white/5 bg-[#0a0a0a]" aria-hidden>
            <div className="flex items-end justify-around px-2 pb-1 pt-2 text-[9px] text-text-secondary">
              <span className="flex flex-col items-center gap-1 text-accent">
                <LayoutDashboard size={16} />
                Overview
              </span>
              <span className="flex flex-col items-center gap-1">
                <Gauge size={16} />
                Performance
              </span>
              <span className="-mt-2 grid h-9 w-9 place-items-center rounded-full bg-accent text-black shadow-[0_8px_24px_rgba(var(--color-accent-rgb),0.35)]">
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
            <div className="flex justify-center pb-2 pt-1">
              <span className="h-[5px] w-[120px] rounded-full bg-white/70" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
