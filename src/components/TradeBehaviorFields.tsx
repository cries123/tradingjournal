import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { TradeBehaviorInput } from '../types';
import { useSettings } from '../context/SettingsContext';

export interface TradeBehaviorValues extends TradeBehaviorInput {
  psychology: string;
  ruleAdherence: number;
  marketContext: string[];
  isGhost: boolean;
}

export const EMPTY_BEHAVIOR: TradeBehaviorValues = {
  psychology: '',
  ruleAdherence: 5,
  marketContext: [],
  isGhost: false,
};

export function behaviorFromTrade(trade?: Partial<TradeBehaviorInput>): TradeBehaviorValues {
  return {
    psychology: trade?.psychology ?? '',
    ruleAdherence: trade?.ruleAdherence ?? 5,
    marketContext: trade?.marketContext ?? [],
    isGhost: trade?.isGhost ?? false,
  };
}

export function behaviorHasData(values: TradeBehaviorValues): boolean {
  return (
    values.isGhost ||
    Boolean(values.psychology) ||
    values.ruleAdherence !== 5 ||
    values.marketContext.length > 0
  );
}

export function serializeBehavior(values: TradeBehaviorValues): TradeBehaviorInput {
  const payload: TradeBehaviorInput = {};
  if (values.psychology) payload.psychology = values.psychology;
  if (values.ruleAdherence !== 5 || values.psychology) payload.ruleAdherence = values.ruleAdherence;
  if (values.marketContext.length) payload.marketContext = values.marketContext;
  if (values.isGhost) payload.isGhost = true;
  return payload;
}

interface TradeBehaviorFieldsProps {
  values: TradeBehaviorValues;
  onChange: (values: TradeBehaviorValues) => void;
  showGhostToggle?: boolean;
  compact?: boolean;
  collapsible?: boolean;
  defaultOpen?: boolean;
}

export function TradeBehaviorFields({
  values,
  onChange,
  showGhostToggle = true,
  compact,
  collapsible = false,
  defaultOpen,
}: TradeBehaviorFieldsProps) {
  const { settings } = useSettings();
  const [open, setOpen] = useState(defaultOpen ?? (collapsible ? behaviorHasData(values) : true));

  const patch = (partial: Partial<TradeBehaviorValues>) => onChange({ ...values, ...partial });

  const toggleContext = (tag: string) => {
    const next = values.marketContext.includes(tag)
      ? values.marketContext.filter((t) => t !== tag)
      : [...values.marketContext, tag];
    patch({ marketContext: next });
  };

  const fields = (
    <div className="space-y-4">
      {showGhostToggle && (
        <div className="rounded-lg border border-border/60 bg-bg-primary/40 p-3 space-y-2">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={values.isGhost}
              onChange={(e) => patch({ isGhost: e.target.checked })}
              className="mt-1 rounded border-border bg-bg-tertiary text-emerald-500 focus-ring"
            />
            <span className="min-w-0">
              <span className="text-sm font-medium text-text-primary block">Ghost trade (missed opportunity)</span>
              <span className="text-[11px] text-text-secondary leading-relaxed block mt-0.5">
                Log a trade you <em>didn&apos;t</em> take. Hypothetical P&amp;L is tracked in the FOMO log only — your real account balance and stats stay unchanged.
              </span>
            </span>
          </label>
        </div>
      )}

      <label className="block">
        <span className="text-xs text-text-secondary mb-1 block">Psychology check</span>
        <select
          value={values.psychology}
          onChange={(e) => patch({ psychology: e.target.value })}
          className="input-field"
        >
          <option value="">Not set</option>
          {settings.psychologyTags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
      </label>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-text-secondary">Rule adherence</span>
          <span className="text-xs font-semibold text-emerald-300">{values.ruleAdherence}/10</span>
        </div>
        <input
          type="range"
          min={0}
          max={10}
          step={1}
          value={values.ruleAdherence}
          onChange={(e) => patch({ ruleAdherence: Number(e.target.value) })}
          className="w-full accent-emerald-400"
        />
        <div className="flex justify-between text-[10px] text-text-secondary mt-0.5">
          <span>Broke rules</span>
          <span>Followed plan</span>
        </div>
      </div>

      <div>
        <span className="text-xs text-text-secondary mb-2 block">Market context</span>
        <div className="flex flex-wrap gap-1.5">
          {settings.marketContextTags.map((tag) => {
            const active = values.marketContext.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleContext(tag)}
                className={`px-2 py-1 rounded-md text-[10px] font-medium border transition-colors focus-ring ${
                  active
                    ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300'
                    : 'border-border/60 text-text-secondary hover:border-border hover:text-text-primary'
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  if (collapsible) {
    return (
      <div className={`${compact ? '' : 'pt-2 border-t border-border/50'}`}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-2 py-2 text-left focus-ring rounded-lg"
        >
          <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Psychology &amp; context <span className="normal-case font-normal text-text-secondary/80">(optional)</span>
          </span>
          <ChevronDown
            size={16}
            className={`text-text-secondary shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
        {open && (
          <div className="pt-2 pb-1">
            {!compact && (
              <p className="text-[11px] text-text-secondary leading-relaxed mb-4">
                Optional behavioral notes — never overwrite broker data. CSV imports start blank; add these anytime via edit.
              </p>
            )}
            {fields}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${compact ? '' : 'pt-2 border-t border-border/50'}`}>
      {!compact && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400/90 mb-1">Psychology & context</p>
          <p className="text-[11px] text-text-secondary leading-relaxed">
            Optional behavioral notes — never overwrite broker data. CSV imports start blank; add these anytime via edit.
          </p>
        </div>
      )}
      {fields}
    </div>
  );
}
