import { pnlClass } from '../../utils/pnlTone';

/**
 * The card every analysis panel is drawn in.
 *
 * Extracted when the Performance screen grew a second family of panels: two copies of the same
 * shell drift, and the drift shows up as one row of cards a few pixels taller than the row under
 * it. One shell, one min-height, one header layout.
 */
export function PanelShell({
  eyebrow,
  title,
  icon,
  children,
}: {
  eyebrow: string;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="panel-card p-3 md:p-4 flex flex-col min-h-[160px]">
      <div className="mb-2 md:mb-3 shrink-0 flex items-start gap-2">
        <span className="text-accent/80 mt-0.5 shrink-0">{icon}</span>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-accent/80 font-medium mb-0.5">
            {eyebrow}
          </p>
          <h3 className="text-[10px] md:text-sm font-semibold text-text-primary">{title}</h3>
        </div>
      </div>
      <div className="flex-1 flex flex-col justify-center">{children}</div>
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
  icon: React.ReactNode;
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
}: {
  label: string;
  meta?: string;
  value: number;
  valueText: string;
  maxAbs: number;
  labelWidth?: string;
}) {
  const width = Math.max((Math.abs(value) / (maxAbs || 1)) * 100, 3);
  return (
    <div className="flex items-center gap-2">
      <span className={`text-[10px] text-text-primary ${labelWidth} shrink-0 truncate`} title={label}>
        {label}
      </span>
      <div className="flex-1 h-3 rounded-full overflow-hidden bg-bg-primary relative">
        <div
          className={`h-full rounded-full chart-bar-h ${value >= 0 ? 'bar-profit-h' : 'bar-loss-h'}`}
          style={{ width: `${width}%` }}
        />
      </div>
      {meta && (
        <span className="text-[9px] text-text-secondary w-14 shrink-0 text-right tabular-nums">{meta}</span>
      )}
      <span
        className={`text-[10px] md:text-xs font-semibold tabular-nums w-16 shrink-0 text-right ${pnlClass(value)}`}
      >
        {valueText}
      </span>
    </div>
  );
}
