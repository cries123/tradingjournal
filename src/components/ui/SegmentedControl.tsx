import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface SegmentOption<T extends string> {
  id: T;
  label: ReactNode;
  icon?: LucideIcon;
}

/**
 * The one period/mode toggle in the app.
 *
 * There were three: the Overview's Month/Year (accent tint in a bordered track), Performance's
 * scope (a grey lift with no border) and the simulator's period (separate outlined pills). Three
 * looks for the same control made each screen feel like it came from a different app. This is the
 * Overview's, because it is the one people see most.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (next: T) => void;
  /** What the group chooses, for screen readers — "Period", "View". */
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex shrink-0 rounded-lg bg-bg-tertiary/60 p-0.5 border border-border/50">
      {options.map(({ id, label: text, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-pressed={id === value}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors focus-ring ${
            id === value ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          {Icon && <Icon size={14} aria-hidden />}
          {text}
        </button>
      ))}
    </div>
  );
}
