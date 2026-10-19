import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, MoreHorizontal, SlidersHorizontal, X } from 'lucide-react';
import type { Filters } from '../../types';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';

/** Closes a popover on a click outside it or on Escape. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEscapeToClose(() => setOpen(false), open);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  return { open, setOpen, ref };
}

/**
 * The period on screen with a step either side — the one control every part of the Overview
 * follows. It used to live in the calendar's header, which a phone hides on the Trades and
 * Insights tabs.
 */
export function PeriodStepper({
  label,
  onPrev,
  onNext,
  noun,
  variant,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  /** "month" or "year", for the buttons' names. */
  noun: string;
  variant: 'desktop' | 'phone';
}) {
  const phone = variant === 'phone';
  return (
    <div
      className={`flex items-center overflow-hidden border border-border bg-bg-tertiary ${
        phone ? 'h-[38px] rounded-xl text-sm font-semibold' : 'rounded-[10px] text-[13px]'
      }`}
    >
      <button type="button" onClick={onPrev} aria-label={`Previous ${noun}`} className={`text-text-secondary hover:text-text-primary focus-ring ${phone ? 'flex h-full w-8 items-center justify-center' : 'px-2.5 py-1.5'}`}>
        <ChevronLeft size={phone ? 16 : 14} />
      </button>
      <span className={`whitespace-nowrap text-center tabular-nums ${phone ? '' : 'min-w-[132px] px-3 py-1.5 font-semibold'}`}>{label}</span>
      <button type="button" onClick={onNext} aria-label={`Next ${noun}`} className={`text-text-secondary hover:text-text-primary focus-ring ${phone ? 'flex h-full w-8 items-center justify-center' : 'px-2.5 py-1.5'}`}>
        <ChevronRight size={phone ? 16 : 14} />
      </button>
    </div>
  );
}

const EMPTY: Filters = { symbol: '', setup: '', side: '', tag: '' };
const FIELDS: { key: keyof Filters; label: string }[] = [
  { key: 'symbol', label: 'Symbol' },
  { key: 'setup', label: 'Setup' },
  { key: 'tag', label: 'Tag' },
  { key: 'side', label: 'Side' },
];

/**
 * The filters as the designs draw them: each one in force is a chip you can clear with its ×, and
 * one Filter button opens the four choices.
 *
 * Four dropdowns across the toolbar were the controls a trader touches least taking the most room,
 * and on a phone they wrapped onto a row of their own. The selects in the panel use 16px text on a
 * phone so iOS Safari does not zoom the page when one opens.
 */
export function FilterMenu({
  filters,
  symbols,
  setups,
  onChange,
  variant,
}: {
  filters: Filters;
  symbols: string[];
  setups: string[];
  onChange: (next: Filters) => void;
  variant: 'desktop' | 'phone';
}) {
  const { open, setOpen, ref } = usePopover();
  const phone = variant === 'phone';
  const options: Record<keyof Filters, string[]> = { symbol: symbols, setup: setups, tag: setups, side: ['long', 'short'] };
  const active = FIELDS.filter((f) => filters[f.key]);

  return (
    <>
      {active.map((f) => (
        <button
          key={f.key}
          type="button"
          onClick={() => onChange({ ...filters, [f.key]: '' })}
          aria-label={`Clear ${f.label.toLowerCase()} filter ${filters[f.key]}`}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 text-accent focus-ring ${
            phone ? 'h-8 px-2.5 text-[13px]' : 'px-2.5 py-[3px] text-[11px]'
          }`}
        >
          {f.key === 'side' ? filters[f.key].charAt(0).toUpperCase() + filters[f.key].slice(1) : filters[f.key]}
          <X size={phone ? 13 : 11} className="opacity-60" aria-hidden />
        </button>
      ))}
      <div ref={ref} className={`relative ${phone ? 'ml-auto' : ''}`}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={phone ? 'Filter' : undefined}
          className={
            phone
              ? 'flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-bg-tertiary text-text-secondary focus-ring'
              : 'inline-flex items-center gap-1.5 rounded-[9px] border border-border px-[11px] py-1.5 text-xs text-text-secondary hover:text-text-primary focus-ring'
          }
        >
          {phone ? <SlidersHorizontal size={18} /> : 'Filter'}
        </button>
        {open && (
          <div
            role="dialog"
            aria-label="Filter trades"
            className={`absolute z-50 mt-2 w-64 rounded-xl border border-border bg-bg-secondary p-3 shadow-2xl ${phone ? 'right-0' : 'left-0'}`}
          >
            <div className="space-y-2">
              {FIELDS.map((f) => (
                <label key={f.key} className="flex items-center justify-between gap-3 text-xs text-text-secondary">
                  {f.label}
                  <span className="relative">
                    <select
                      value={filters[f.key]}
                      onChange={(e) => onChange({ ...filters, [f.key]: e.target.value })}
                      className="w-36 appearance-none rounded-lg border border-border bg-bg-tertiary py-1.5 pl-2.5 pr-7 text-[16px] text-text-primary focus-ring md:text-xs"
                    >
                      <option value="">Any</option>
                      {options[f.key].map((o) => (
                        <option key={o} value={o}>
                          {f.key === 'side' ? o.charAt(0).toUpperCase() + o.slice(1) : o}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-secondary" aria-hidden />
                  </span>
                </label>
              ))}
            </div>
            {active.length > 0 && (
              <button type="button" onClick={() => onChange(EMPTY)} className="mt-3 text-xs text-accent focus-ring rounded">
                Clear all
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

/** The phone's ⋯: the toolbar actions that do not fit 390px — share, the report, sync. */
export function OverflowMenu({ items }: { items: { label: string; icon: ReactNode; run: () => void }[] }) {
  const { open, setOpen, ref } = usePopover();
  if (items.length === 0) return null;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More actions"
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-bg-tertiary text-text-secondary focus-ring"
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-52 rounded-xl border border-border bg-bg-secondary p-1.5 shadow-2xl">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                item.run();
                setOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-bg-primary focus-ring"
            >
              <span className="text-text-secondary">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
