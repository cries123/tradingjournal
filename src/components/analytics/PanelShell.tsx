import { useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { pnlClass } from '../../utils/pnlTone';
import { useReveal } from '../../hooks/useReveal';

/** The one number a panel is about, drawn in its header so every card leads with its figure. */
export interface PanelFigure {
  value: string;
  tone?: 'profit' | 'loss' | 'neutral';
  /** What the number is: "4th+ trades", "Biggest quarter", "In fees". */
  caption?: string;
}

const FIGURE_TONE: Record<NonNullable<PanelFigure['tone']>, string> = {
  profit: 'text-profit-bright',
  loss: 'text-loss-bright',
  neutral: 'text-text-primary',
};

/**
 * The card every analysis panel is drawn in.
 *
 * Extracted when the Performance screen grew a second family of panels: two copies of the same
 * shell drift, and the drift shows up as one row of cards a few pixels taller than the row under
 * it. One shell, one min-height, one header layout.
 *
 * Every panel leads with its figure now. Twelve cards had the same shape and weight — icon, label,
 * chips, bars, a sentence — and the finding worth $4,000 was drawn the same size as the one about
 * fees, so the reader had to find the headline themselves. The figure sits in the header, the
 * `featured` card (the one worth the most money, chosen by the section) is drawn bigger, and the
 * sentence each panel exists to produce is passed as `note` rather than buried under the bars.
 *
 * On a phone the sentence comes first and the numbers wait behind a tap. Twelve panels of bars was
 * a scroll with no map; twelve findings is a list. Desktop keeps the full card.
 */
export function PanelShell({
  eyebrow,
  title,
  icon,
  figure,
  note,
  featured = false,
  children,
}: {
  eyebrow: string;
  title: string;
  icon: ReactNode;
  figure?: PanelFigure;
  /** The finding, as a sentence. Shown under the numbers on a desktop and before them on a phone. */
  note?: ReactNode;
  /** The section's biggest finding: full width, larger figure, taller card. */
  featured?: boolean;
  children: ReactNode;
}) {
  // The card is its own reveal target rather than wrapped in one, so the grid still stretches the
  // card itself to the row's height.
  const { ref, revealProps } = useReveal();
  const [open, setOpen] = useState(false);
  const collapsible = note !== undefined && note !== null;

  return (
    <div
      ref={ref}
      {...revealProps}
      data-featured={featured ? 'true' : undefined}
      className={`reveal panel-card spotlight flex flex-col ${
        featured ? 'p-4 md:p-6 min-h-[160px] md:min-h-[220px]' : 'p-3 md:p-4 min-h-[160px]'
      }`}
    >
      <div className="mb-2 md:mb-3 shrink-0 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <span className="text-accent/80 mt-0.5 shrink-0">{icon}</span>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-accent/80 font-medium mb-0.5">
              {eyebrow}
            </p>
            <h3 className={`font-semibold text-text-primary ${featured ? 'text-sm md:text-lg' : 'text-xs md:text-sm'}`}>
              {title}
            </h3>
          </div>
        </div>
        {figure && (
          <div className="text-right shrink-0">
            {figure.caption && (
              <p className="text-[9px] uppercase tracking-wide text-text-secondary leading-none mb-1">{figure.caption}</p>
            )}
            <p
              className={`font-bold tabular-nums leading-none ${
                featured ? 'text-2xl md:text-5xl' : 'text-lg md:text-2xl'
              } ${FIGURE_TONE[figure.tone ?? 'neutral']}`}
            >
              {figure.value}
            </p>
          </div>
        )}
      </div>

      {collapsible && (
        <p
          className={`order-1 md:order-3 text-text-secondary leading-relaxed md:mt-2.5 ${
            featured ? 'text-xs md:text-sm' : 'text-[11px] md:text-[10px]'
          }`}
        >
          {note}
        </p>
      )}

      {collapsible && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="order-2 md:hidden mt-2 inline-flex items-center gap-1 self-start text-[11px] font-medium text-accent focus-ring rounded"
        >
          {open ? 'Hide the numbers' : 'Show the numbers'}
          <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      )}

      <div
        className={`order-3 md:order-2 flex-1 flex-col justify-center ${
          collapsible && !open ? 'hidden md:flex' : 'flex'
        } ${collapsible ? 'mt-2 md:mt-0' : ''}`}
      >
        {children}
      </div>
    </div>
  );
}

/** The same card, dashed and dimmed, saying what one field would unlock. */
export function LockedPanel({
  eyebrow,
  title,
  icon,
  needs,
}: {
  eyebrow: string;
  title: string;
  icon: ReactNode;
  needs: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border/60 p-3 md:p-4 flex flex-col min-h-[160px]">
      <div className="mb-2 md:mb-3 shrink-0 flex items-start gap-2 opacity-60">
        <span className="text-text-secondary mt-0.5 shrink-0">{icon}</span>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-text-secondary font-medium mb-0.5">
            {eyebrow}
          </p>
          <h3 className="text-[10px] md:text-sm font-semibold text-text-secondary">{title}</h3>
        </div>
      </div>
      <div className="flex-1 flex items-center">
        <p className="text-xs text-text-secondary leading-relaxed">{needs}</p>
      </div>
    </div>
  );
}

/** A labelled horizontal bar row, the shape most of these panels are made of. */
export function BarRow({
  label,
  meta,
  value,
  valueText,
  maxAbs,
  labelWidth = 'w-20 md:w-24',
  index = 0,
}: {
  label: string;
  meta?: string;
  value: number;
  valueText: string;
  maxAbs: number;
  labelWidth?: string;
  /** Position in its list, so the bars grow in one after another rather than as a block. */
  index?: number;
}) {
  const width = Math.max((Math.abs(value) / (maxAbs || 1)) * 100, 3);
  return (
    <div className="flex items-center gap-2">
      <span className={`text-[10px] text-text-primary ${labelWidth} shrink-0 truncate`} title={label}>
        {label}
      </span>
      <div className="flex-1 h-3 rounded-full overflow-hidden bg-bg-primary relative">
        <div
          className={`bar-in h-full rounded-full chart-bar-h ${value >= 0 ? 'bar-profit-h' : 'bar-loss-h'}`}
          style={{ width: `${width}%`, '--i': index } as CSSProperties}
        />
      </div>
      {meta && (
        <span className="text-[9px] text-text-secondary w-[5.75rem] shrink-0 text-right tabular-nums">{meta}</span>
      )}
      <span
        className={`text-[10px] md:text-xs font-semibold tabular-nums w-16 shrink-0 text-right ${pnlClass(value)}`}
      >
        {valueText}
      </span>
    </div>
  );
}
