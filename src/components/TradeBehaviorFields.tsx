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
}

export function TradeBehaviorFields({ values, onChange, showGhostToggle = true, compact }: TradeBehaviorFieldsProps) {
  const { settings } = useSettings();

  const patch = (partial: Partial<TradeBehaviorValues>) => onChange({ ...values, ...partial });

  const toggleContext = (tag: string) => {
    const next = values.marketContext.includes(tag)
      ? values.marketContext.filter((t) => t !== tag)
      : [...values.marketContext, tag];
    patch({ marketContext: next });
  };

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
}
