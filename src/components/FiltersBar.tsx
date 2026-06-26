import type { Filters } from '../types';

interface FiltersBarProps {
  filters: Filters;
  symbols: string[];
  setups: string[];
  onChange: (filters: Filters) => void;
}

export function FiltersBar({ filters, symbols, setups, onChange }: FiltersBarProps) {
  return (
    <div className="flex flex-wrap gap-2 shrink-0">
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
        label="Side"
        value={filters.side}
        options={['long', 'short']}
        onChange={(side) => onChange({ ...filters, side })}
      />
      {(filters.symbol || filters.setup || filters.side) && (
        <button
          type="button"
          onClick={() => onChange({ symbol: '', setup: '', side: '' })}
          className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary border border-border rounded-md transition-colors"
        >
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
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-1.5 text-xs bg-bg-secondary border border-border rounded-md text-text-primary focus:outline-none focus:border-accent cursor-pointer"
      aria-label={`Filter by ${label}`}
    >
      <option value="">{label}</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}
