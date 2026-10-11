import type { ReactNode } from 'react';
import { ArrowLeft, type LucideIcon } from 'lucide-react';
import { InAppContext, useInApp } from './inApp';

/** Wraps the app's screens so PageFrame knows it is beside the sidebar. */
export function InAppProvider({ children }: { children: ReactNode }) {
  return <InAppContext.Provider value>{children}</InAppContext.Provider>;
}

interface PageFrameProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** The same icon the sidebar uses for this screen, so the two read as one place. */
  icon?: LucideIcon;
  eyebrow?: string;
  /** Beside the title — a count, a status chip. */
  badge?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  /** Right-hand side of the header: period tabs, a primary action. */
  actions?: ReactNode;
  /** Column width on the public site only. Inside the app every screen is full width. */
  publicWidth?: string;
  children: ReactNode;
}

/**
 * One frame for every screen in the app, so they stop being fourteen different pages.
 *
 * Before this each screen picked its own width and alignment: Performance a centred 1024px column,
 * the rule simulator 1024px pinned left, the assistant 1152px centred, track record 768px pinned
 * left, Settings 1400px with its own padding on top of the shell's. Beside the Overview — which uses
 * all 1680px the shell allows — every one of them looked like a different product with a third of
 * the screen left empty.
 *
 * Inside the app this is full width, with a compact header and the Overview's own card spacing
 * (gap-2, md:gap-3), and each screen lays its content into columns rather than stretching one.
 * On the public site (no InAppProvider above it) it is the centred column those pages always had.
 */
export function PageFrame({
  title,
  subtitle,
  icon: Icon,
  eyebrow,
  badge,
  onBack,
  backLabel = 'Back to dashboard',
  actions,
  publicWidth = 'max-w-2xl',
  children,
}: PageFrameProps) {
  const inApp = useInApp();

  if (!inApp) {
    return (
      <div className="pb-6">
        <div className={`${publicWidth} mx-auto p-4 md:p-6`}>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-accent transition-colors mb-8 focus-ring rounded-lg px-1 py-1"
            >
              <ArrowLeft size={16} />
              {backLabel}
            </button>
          )}
          <div className="flex items-center gap-3 mb-2">
            {Icon && (
              <div className="p-2 rounded-lg bg-accent/10 text-accent">
                <Icon size={22} />
              </div>
            )}
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{title}</h1>
            {badge}
          </div>
          {subtitle && <p className="text-text-secondary mb-8 leading-relaxed">{subtitle}</p>}
          {actions && <div className="mb-6 flex flex-wrap items-center gap-2">{actions}</div>}
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 md:gap-3 pb-2">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-0.5 pb-1">
        <div className="min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-accent transition-colors mb-2 focus-ring rounded px-0.5 py-0.5"
            >
              <ArrowLeft size={14} />
              {backLabel}
            </button>
          )}
          <div className="flex items-center gap-3">
            {Icon && (
              <span className="p-2 rounded-lg bg-accent/10 text-accent shrink-0">
                <Icon size={20} aria-hidden />
              </span>
            )}
            <div className="min-w-0">
              {eyebrow && (
                <p className="text-[10px] uppercase tracking-widest text-accent/80 font-medium">{eyebrow}</p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl md:text-2xl font-bold tracking-tight">{title}</h1>
                {badge}
              </div>
            </div>
          </div>
          {subtitle && (
            <p className="mt-1.5 text-sm text-text-secondary leading-relaxed max-w-4xl">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  );
}

/** A heading for a group of cards inside a page — the Overview's eyebrow-and-title pattern. */
export function PageSection({ title, blurb, children }: { title: string; blurb?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 md:gap-3">
      <div className="px-0.5 pt-1">
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        {blurb && <p className="text-[11px] text-text-secondary leading-relaxed mt-0.5 max-w-3xl">{blurb}</p>}
      </div>
      {children}
    </section>
  );
}
