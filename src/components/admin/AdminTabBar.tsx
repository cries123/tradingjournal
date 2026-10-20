import { Activity, AlertTriangle, Bug, FileText, LayoutDashboard, LifeBuoy, Mail, Users, Wallet, type LucideIcon } from 'lucide-react';
import { ADMIN_TABS, type AdminTab } from './adminTabs';

interface AdminTabBarProps {
  tab: AdminTab;
  onChange: (tab: AdminTab) => void;
  openCount: number;
  userCount: number;
  ticketsWaiting: number;
  openErrors: number;
  /**
   * rail: the vertical list in the admin shell's side column, from lg up.
   * grid: four columns of pills under the top bar, for everything narrower.
   */
  variant?: 'rail' | 'grid';
}

const ICONS: Record<AdminTab, LucideIcon> = {
  overview: LayoutDashboard,
  users: Users,
  support: LifeBuoy,
  requests: Bug,
  errors: AlertTriangle,
  costs: Wallet,
  ops: Activity,
  email: Mail,
  content: FileText,
};

/**
 * The admin panel's navigation.
 *
 * Two layouts, because a side rail and a phone want different things. From lg up the sections sit
 * down the shell's left column with an icon each, the way every admin tool a person has used puts
 * them, and the active one carries the same filled pill and left bar the journal's own sidebar
 * uses — one product, two sides of it. Below lg it is a grid of pills under the top bar: every
 * destination visible without a swipe, each a 44px target, with the counts cornered so the one
 * wide label does not spill out of its cell.
 *
 * No backdrop-filter on either: it would make this the containing block for any fixed-position
 * descendant, which is the bug that has bitten this panel twice.
 */
export function AdminTabBar({
  tab,
  onChange,
  openCount,
  userCount,
  ticketsWaiting,
  openErrors,
  variant = 'grid',
}: AdminTabBarProps) {
  const badgeFor = (id: AdminTab): { text: string; tone: 'alert' | 'warn' | 'quiet' } | null => {
    if (id === 'requests' && openCount > 0) return { text: String(openCount), tone: 'warn' };
    if (id === 'support' && ticketsWaiting > 0) return { text: String(ticketsWaiting), tone: 'warn' };
    if (id === 'errors' && openErrors > 0) return { text: String(openErrors), tone: 'alert' };
    if (id === 'users') return { text: String(userCount), tone: 'quiet' };
    return null;
  };

  const badgeTone = {
    alert: 'bg-red-500/15 text-red-400',
    warn: 'bg-amber-500/15 text-amber-400',
    quiet: 'bg-white/10 text-text-secondary',
  };

  if (variant === 'rail') {
    return (
      <nav aria-label="Admin sections" className="flex flex-col gap-0.5">
        {ADMIN_TABS.map((t) => {
          const active = t.id === tab;
          const badge = badgeFor(t.id);
          const Icon = ICONS[t.id];
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              aria-current={active ? 'page' : undefined}
              className={`group relative flex w-full items-center gap-2.5 rounded-xl pl-3 pr-2.5 py-2.5 text-sm transition-colors focus-ring ${
                active ? 'bg-accent/10 text-accent font-medium' : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
              }`}
            >
              {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-accent" aria-hidden />}
              <Icon size={16} className="shrink-0" aria-hidden />
              <span className="flex-1 text-left truncate">{t.label}</span>
              {badge && (
                <span className={`shrink-0 min-w-[20px] rounded-full px-1.5 py-0.5 text-center text-[10px] font-semibold tabular-nums ${badgeTone[badge.tone]}`}>
                  {badge.text}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    );
  }

  return (
    <nav aria-label="Admin sections" className="sticky top-14 z-20 mb-5 bg-bg-primary/95 pb-2">
      <div className="grid grid-cols-4 gap-1.5">
        {ADMIN_TABS.map((t) => {
          const active = t.id === tab;
          const badge = badgeFor(t.id);
          const Icon = ICONS[t.id];
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              aria-current={active ? 'page' : undefined}
              className={`relative flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-medium leading-none transition-colors focus-ring ${
                active ? 'bg-accent/10 text-accent' : 'bg-white/[0.04] text-text-secondary hover:text-text-primary'
              }`}
            >
              <Icon size={15} aria-hidden />
              <span className="truncate max-w-full">{t.label}</span>
              {badge && (
                /* Out of the flow: four columns of a 390px screen is about 88px a cell, and a label
                   with a count beside it was the one tab that spilled out of its own pill. */
                <span className={`absolute -right-1 -top-1 min-w-[18px] rounded-full px-1.5 py-0.5 text-center text-[10px] font-semibold tabular-nums ${badgeTone[badge.tone]}`}>
                  {badge.text}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
