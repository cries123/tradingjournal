import { ChevronLeft, ChevronRight } from 'lucide-react';
import { monthInputValue } from '../utils/format';

interface MonthPickerProps {
  year: number;
  month: number;
  onPrev: () => void;
  onNext: () => void;
  onChange: (year: number, month: number) => void;
}

export function MonthPicker({ year, month, onPrev, onNext, onChange }: MonthPickerProps) {
  const value = monthInputValue(year, month);

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onPrev}
        className="p-1 md:p-1.5 rounded-lg hover:bg-bg-tertiary text-text-secondary focus-ring"
        aria-label="Previous month"
      >
        <ChevronLeft size={18} />
      </button>

      <label className="relative">
        <span className="sr-only">Select month</span>
        <input
          type="month"
          value={value}
          onChange={(e) => {
            const [y, m] = e.target.value.split('-').map(Number);
            if (y && m) onChange(y, m - 1);
          }}
          className="text-[10px] md:text-sm font-semibold bg-bg-tertiary/80 border border-border/60 rounded-lg px-2 py-1 md:px-3 md:py-1.5 text-text-primary cursor-pointer focus-ring min-w-[7rem] md:min-w-[9rem]"
        />
      </label>

      <button
        type="button"
        onClick={onNext}
        className="p-1 md:p-1.5 rounded-lg hover:bg-bg-tertiary text-text-secondary focus-ring"
        aria-label="Next month"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
