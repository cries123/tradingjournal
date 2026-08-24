import { ChevronDown, X } from 'lucide-react';
import type { Filters } from '../types';

interface FiltersBarProps {
  filters: Filters;
  symbols: string[];
  setups: string[];
  onChange: (filters: Filters) => void;
}

export function FiltersBar({ filters, symbols, setups, onChange }: FiltersBarProps) {
  const hasFilter = Boolean(filters.symbol || filters.setup || filters.side || filters.tag);

  return (
    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
      <FilterSelect
        label="Symbol"
        value={filters.symbol}
        options={symbols}
        onChange={(symbol) => onChange({ ...filters, symbol })}
      />
      <FilterSelect
        label="Setup"
        value={filters.setup}
        options={setups}
        onChange={(setup) => onChange({ ...filters, setup })}
      />
      <FilterSelect
        label="Tag"
        value={filters.tag}
        options={setups}
        onChange={(tag) => onChange({ ...filters, tag })}
      />
      <FilterSelect
        label="Side"
        value={filters.side}
        options={['long', 'short']}
        onChange={(side) => onChange({ ...filters, side })}
      />
      {hasFilter && (
        <button
          type="button"
          onClick={() => onChange({ symbol: '', setup: '', side: '', tag: '' })}
          className="inline-flex items-center gap-1 pl-2.5 pr-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary rounded-full border border-border/50 hover:border-border transition-colors focus-ring"
        >
          <X size={12} />
          Clear filters
        </button>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const active = value !== '';

  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`appearance-none pl-3 pr-7 py-1.5 rounded-full border text-xs font-medium cursor-pointer transition-colors focus-ring ${
          active
            ? 'bg-accent/10 border-accent/40 text-accent'
            : 'bg-bg-tertiary/60 border-border/50 text-text-secondary hover:text-text-primary hover:border-border'
        }`}
        aria-label={`Filter by ${label}`}
      >
        <option value="">{label}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      <ChevronDown
        size={12}
        strokeWidth={2.5}
        aria-hidden
        className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 ${
          active ? 'text-accent' : 'text-text-secondary'
        }`}
      />
    </div>
  );
}
