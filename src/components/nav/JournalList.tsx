import { useMemo, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import type { Trade } from '../../types';
import { useSettings } from '../../context/useSettings';
import { goToPricing } from '../../utils/navigateToPath';
import { formatCurrencyCompact, formatMonthYear } from '../../utils/format';
import { journalMonthNets } from '../../utils/journalMonth';
import { AllJournalsNote, AllJournalsOption } from '../AllJournalsOption';

interface JournalListProps {
  /** Every trade in every journal, so each row can carry its own month. Without it the rows are names only. */
  trades?: readonly Trade[];
  year: number;
  month: number;
  /** Bigger rows for a phone, where these are thumb targets rather than mouse targets. */
  size?: 'compact' | 'comfortable';
}

/**
 * The journals, each with how its month is going.
 *
 * It replaced a picker that was names and a check mark: switching to the paper account to see how it
 * was doing, then back, was the only way to compare two journals. The month is the one on screen,
 * named in the tooltip, so the figure beside the active journal is the figure on the Overview.
 */
export function JournalList({ trades, year, month, size = 'compact' }: JournalListProps) {
  const { settings, setActiveAccount, addAccount, journalLimit, canAddJournal, viewingAllJournals } = useSettings();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const nets = useMemo(() => (trades ? journalMonthNets(trades, year, month) : null), [trades, year, month]);
  const big = size === 'comfortable';
  const period = formatMonthYear(year, month);

  const handleAdd = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    addAccount(trimmed);
    setName('');
    setAdding(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between px-3 pb-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-secondary/60">Journals</p>
        {canAddJournal && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-0.5 text-[11px] font-medium text-accent hover:text-accent/80 focus-ring rounded"
          >
            <Plus size={12} aria-hidden />
            New
          </button>
        )}
      </div>

      <div className="space-y-0.5">
        {settings.accounts.map((account) => {
          // In the all-journals view no single journal is the one being shown.
          const active = !viewingAllJournals && settings.activeAccountId === account.id;
          const net = nets?.get(account.id);
          return (
            <button
              key={account.id}
              type="button"
              onClick={() => setActiveAccount(account.id)}
              aria-current={active ? 'true' : undefined}
              title={net !== undefined ? `${account.name}, ${period}` : account.name}
              className={`w-full flex items-center gap-2 rounded-lg text-left font-medium transition-colors focus-ring border ${
                big ? 'px-3 py-3 text-sm' : 'px-3 py-2 text-[13px]'
              } ${
                active
                  ? 'bg-bg-tertiary text-text-primary border-border'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60 border-transparent'
              }`}
            >
              {active ? <Check size={13} className="shrink-0 text-accent" aria-hidden /> : <span className="w-[13px] shrink-0" aria-hidden />}
              <span className="flex-1 truncate">{account.name}</span>
              {net !== undefined && (
                <span className={`shrink-0 tabular-nums font-semibold ${big ? 'text-sm' : 'text-xs'} ${net >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>
                  {formatCurrencyCompact(net, settings.currency)}
                </span>
              )}
            </button>
          );
        })}
        <AllJournalsOption variant="row" />
      </div>
      <AllJournalsNote className="mt-1 px-3" />

      {adding ? (
        <div className="mt-1.5 flex items-center gap-1 px-1">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Journal name"
            aria-label="New journal name"
            className="input-field py-1.5 text-xs flex-1 min-w-0"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
              if (e.key === 'Escape') {
                setAdding(false);
                setName('');
              }
            }}
          />
          <button type="button" onClick={handleAdd} className="btn-primary px-2 py-1.5 text-[11px] shrink-0">
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setName('');
            }}
            className="p-1 text-text-secondary hover:text-text-primary focus-ring rounded shrink-0"
            aria-label="Cancel"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        !canAddJournal && (
          /* Said before the click, not after it. A "New" button that silently does nothing reads as a bug. */
          <button
            type="button"
            onClick={goToPricing}
            className="mt-1 w-full px-3 py-1 text-left text-[11px] leading-snug text-text-secondary hover:text-accent transition-colors focus-ring rounded"
          >
            {journalLimit} journals on your plan · upgrade for more
          </button>
        )
      )}
    </div>
  );
}
