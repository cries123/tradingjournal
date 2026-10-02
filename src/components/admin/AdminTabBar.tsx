import { useEffect, useRef } from 'react';
import { ADMIN_TABS, type AdminTab } from './adminTabs';

interface AdminTabBarProps {
  tab: AdminTab;
  onChange: (tab: AdminTab) => void;
  openCount: number;
  userCount: number;
  ticketsWaiting: number;
  openErrors: number;
}

/**
 * The admin panel's navigation.
 *
 * On a phone this was a single row that scrolled sideways: seven tabs, four of them past the right
 * edge, reachable only by a horizontal swipe nothing on screen suggested. Scrolling the active one
 * into view papered over the symptom — you still could not SEE where else you could go, which is
 * the entire job of a nav.
 *
 * So below md it is a grid, not a strip. Four columns, two rows, every destination visible without
 * moving anything; from md up, where seven tabs fit comfortably, it stays the underlined row it was.
 * Two layouts rather than one compromise, because a 44px tap target and an underline that reads as
 * a tab want different things.
 *
 * Sticky at both sizes: the nav is most wanted after a long queue has been scrolled. Near-opaque
 * rather than blurred — a backdrop-filter here would make this the containing block for any
 * fixed-position descendant, which is the bug that has bitten this panel twice.
 */
export function AdminTabBar({
  tab,
  onChange,
  openCount,
  userCount,
  ticketsWaiting,
  openErrors,
}: AdminTabBarProps) {
  const badgeFor = (id: AdminTab): string | null => {
    if (id === 'requests' && openCount > 0) return String(openCount);
    if (id === 'support' && ticketsWaiting > 0) return String(ticketsWaiting);
    if (id === 'errors' && openErrors > 0) return String(openErrors);
    if (id === 'users') return String(userCount);
    return null;
  };

  /*
   * Still scrolled into view, for the md-and-up row.
   *
   * "Review →" in the attention banner switches tab without touching the nav, so on a narrow
   * desktop window the tab you just landed on could sit off the right edge while its panel was on
   * screen. Harmless on the phone grid, where nothing is ever out of view.
   */
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [tab]);

  return (
    <nav
      aria-label="Admin sections"
      className="sticky top-0 z-20 mb-6 bg-bg-primary/95 md:border-b md:border-border/60"
    >
      <div className="grid grid-cols-4 gap-1.5 px-1 pb-2 pt-1 md:flex md:items-center md:gap-1 md:overflow-x-auto md:px-0 md:pb-0 md:pt-0">
        {ADMIN_TABS.map((t) => {
          const active = t.id === tab;
          const badge = badgeFor(t.id);
          return (
            <button
              key={t.id}
              ref={active ? activeRef : undefined}
              type="button"
              onClick={() => onChange(t.id)}
              aria-current={active ? 'page' : undefined}
              className={`relative flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] font-medium transition-colors focus-ring md:min-h-0 md:justify-start md:rounded-t-lg md:rounded-b-none md:px-3.5 md:py-2.5 md:text-sm ${
                active
                  ? // On the phone grid the active tab is a filled pill: an underline on one cell of
                    // a two-row grid reads as a stray rule, not as "you are here".
                    'bg-emerald-500/10 text-emerald-300 md:bg-transparent md:text-text-primary'
                  : 'bg-bg-tertiary/40 text-text-secondary hover:text-text-primary md:bg-transparent'
              }`}
            >
              {t.label}
              {badge && (
                /*
                 * Cornered on the phone, inline from md.
                 *
                 * Four columns of a 390px screen is about 88px a cell, and "Requests" with a count
                 * beside it is wider than that — it was the one tab that spilled out of its own
                 * pill. Out of the flow it costs no width at all, which is what keeps every tab on
                 * two rows instead of three.
                 */
                <span
                  className={`absolute -right-1 -top-1 min-w-[18px] rounded-full px-1.5 py-0.5 text-center text-[10px] font-semibold tabular-nums md:static md:min-w-0 md:text-left ${
                    t.id === 'errors'
                      ? 'bg-red-500/15 text-red-400'
                      : t.id === 'requests' || t.id === 'support'
                        ? 'bg-amber-500/15 text-amber-400'
                        : 'bg-bg-tertiary text-text-secondary'
                  }`}
                >
                  {badge}
                </span>
              )}
              {active && (
                <span className="absolute inset-x-2 -bottom-px hidden h-0.5 rounded-full bg-emerald-400 md:block" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
