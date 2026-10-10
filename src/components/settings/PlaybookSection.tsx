import { useState } from 'react';
import { ChevronDown, ListChecks, Plus, Trash2, X } from 'lucide-react';
import { useSettings } from '../../context/useSettings';
import { cleanRules, MAX_RULE_LENGTH, MAX_RULES_PER_STRATEGY } from '../../utils/playbook';
import type { Strategy } from '../../types/strategy';

/**
 * The strategy playbook: each setup, and the rules it is traded by.
 *
 * This card used to take a name and nothing else — the rules field existed on every strategy and
 * was always empty — so "playbook" meant a list of labels. The rules entered here are what the
 * trade form offers as boxes to tick, and what the Discipline panel splits the P&L by.
 */
export function PlaybookSection() {
  const { settings, addStrategy, removeStrategy, updateStrategy } = useSettings();
  const [newStrategy, setNewStrategy] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const add = () => {
    if (!newStrategy.trim()) return;
    // Opened straight away: a new strategy has no rules, and adding them is the next thing to do.
    setOpen(addStrategy(newStrategy));
    setNewStrategy('');
  };

  return (
    <section className="panel-card p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Strategy playbook</h2>
        <p className="text-xs text-text-secondary mt-1 leading-relaxed">
          Give each setup the rules you trade it by. Pick the strategy on a trade and its rules appear as
          boxes to tick — then Performance shows what skipping each rule costs you.
        </p>
      </div>

      {settings.strategies.length > 0 && (
        <ul className="space-y-2">
          {settings.strategies.map((s) => (
            <StrategyRow
              key={s.id}
              strategy={s}
              expanded={open === s.id}
              onToggle={() => setOpen((id) => (id === s.id ? null : s.id))}
              onRemove={() => removeStrategy(s.id)}
              onRules={(criteria) => updateStrategy(s.id, { criteria })}
            />
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={newStrategy}
          onChange={(e) => setNewStrategy(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Strategy name, e.g. Opening range break"
          className="input-field flex-1 min-w-0"
        />
        <button type="button" onClick={add} className="btn-secondary px-4 py-2 text-sm shrink-0">
          Add
        </button>
      </div>
    </section>
  );
}

export function StrategyRow({
  strategy,
  expanded,
  onToggle,
  onRemove,
  onRules,
}: {
  strategy: Strategy;
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onRules: (rules: string[]) => void;
}) {
  const rules = cleanRules(strategy.criteria);
  const [draft, setDraft] = useState('');
  const full = rules.length >= MAX_RULES_PER_STRATEGY;
  const duplicate = rules.some((r) => r.toLowerCase() === draft.replace(/\s+/g, ' ').trim().toLowerCase());

  const addRule = () => {
    if (!draft.trim() || full || duplicate) return;
    onRules([...rules, draft]);
    setDraft('');
  };

  return (
    <li className="rounded-lg border border-border/60">
      <div className="flex items-center gap-2 p-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex flex-1 min-w-0 items-center gap-2 text-left focus-ring rounded"
        >
          <ChevronDown
            size={14}
            className={`shrink-0 text-text-secondary transition-transform ${expanded ? 'rotate-180' : ''}`}
            aria-hidden
          />
          <span className="truncate text-sm font-medium">{strategy.name}</span>
          <span
            className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
              rules.length ? 'bg-accent/10 text-accent' : 'bg-bg-tertiary text-text-secondary'
            }`}
          >
            {rules.length ? `${rules.length} rule${rules.length === 1 ? '' : 's'}` : 'No rules yet'}
          </span>
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="text-text-secondary hover:text-loss-bright p-1 shrink-0"
          aria-label={`Delete ${strategy.name}`}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-border/50 p-3 space-y-2.5">
          {rules.length === 0 ? (
            <p className="text-xs text-text-secondary leading-relaxed">
              What has to be true before you take this trade? One rule per line — "Above VWAP", "Waited
              for the retest", "Size within plan".
            </p>
          ) : (
            <ol className="space-y-1.5">
              {rules.map((rule, i) => (
                <li key={rule} className="flex items-start gap-2 text-sm">
                  <ListChecks size={14} className="mt-0.5 shrink-0 text-text-secondary" aria-hidden />
                  <span className="flex-1 min-w-0 break-words">{rule}</span>
                  <button
                    type="button"
                    onClick={() => onRules(rules.filter((_, j) => j !== i))}
                    className="p-0.5 text-text-secondary hover:text-loss-bright shrink-0"
                    aria-label={`Remove rule: ${rule}`}
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ol>
          )}

          {full ? (
            <p className="text-[11px] text-text-secondary">
              {MAX_RULES_PER_STRATEGY} rules is the most a strategy holds — past that nobody ticks honestly.
            </p>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={draft}
                maxLength={MAX_RULE_LENGTH}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addRule();
                  }
                }}
                placeholder="Add a rule"
                aria-label={`Add a rule to ${strategy.name}`}
                className="input-field flex-1 min-w-0 text-sm"
              />
              <button
                type="button"
                onClick={addRule}
                disabled={!draft.trim() || duplicate}
                className="btn-secondary px-3 py-2 text-sm shrink-0 inline-flex items-center gap-1 disabled:opacity-50"
              >
                <Plus size={14} aria-hidden /> Rule
              </button>
            </div>
          )}
          {duplicate && draft.trim() && <p className="text-[11px] text-amber-300">That rule is already on the list.</p>}
          <p className="text-[11px] text-text-secondary/80 leading-relaxed">
            Changing rules affects trades you log from now on. Trades already ticked keep the rules they
            were ticked against.
          </p>
        </div>
      )}
    </li>
  );
}
