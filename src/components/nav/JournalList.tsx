import { useMemo, useState } from 'react';
import { BookOpen, Check, LayoutGrid, Lock, X } from 'lucide-react';
import type { Trade } from '../../types';
import { useSettings } from '../../context/useSettings';
import { goToPricing } from '../../utils/navigateToPath';
import { formatCurrency, formatCurrencyCompact } from '../../utils/format';
import { journalNets } from '../../utils/journalNets';
import { lowestTierWith, TIER_PLANS } from '../../config/tiers';
import { AllJournalsNote } from '../AllJournalsOption';

interface JournalListProps {
  /** Every trade in every journal, so each row can carry its own total. Without it the rows are names only. */
  trades?: readonly Trade[];
  /** The sidebar's rows, or More's grouped list. */
  variant?: 'sidebar' | 'more';
}

/** An on/off switch drawn the way the rest of the app's settings toggles are. */
function Switch({ on, big }: { on: boolean; big: boolean }) {
  return (
    <span
      aria-hidden
      className={`relative shrink-0 rounded-full transition-colors ${on ? 'bg-accent' : 'bg-[#2a2a2a]'} ${big ? 'h-7 w-[46px]' : 'h-[18px] w-[30px]'}`}
    >
      <span
        className={`absolute rounded-full transition-[left] ${on ? 'bg-bg-primary' : 'bg-[#8a8a8a]'} ${
          big ? `top-[3px] h-[22px] w-[22px] ${on ? 'left-[21px]' : 'left-[3px]'}` : `top-[2px] h-[14px] w-[14px] ${on ? 'left-[14px]' : 'left-[2px]'}`
        }`}
      />
    </span>
  );
}

/**
 * The journals, each with its overall P&L.
 *
 * It replaced a picker that was names and a check mark: switching to the paper account to see how it
 * was doing, then back, was the only way to compare two journals. The figure is all time, not the
 * month on screen (see journalNets for why), and the rows say so.
 *
 * "All journals" is a switch, because it is a view laid over whichever journal is active rather
 * than another journal to pick — new trades still go to the active one, and rules stay per journal.
 */
export function JournalList({ trades, variant = 'sidebar' }: JournalListProps) {
  const {
    settings,
    setActiveAccount,
    addAccount,
    journalLimit,
    canAddJournal,
    viewingAllJournals,
    canViewAllJournals,
    setViewAllJournals,
  } = useSettings();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const nets = useMemo(() => (trades ? journalNets(trades) : null), [trades]);
  const more = variant === 'more';
  const allPlan = lowestTierWith('combinedJournals');
  const fmt = (n: number) => (more ? formatCurrency(n, settings.currency) : formatCurrencyCompact(n, settings.currency));

  const handleAdd = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    addAccount(trimmed);
    setName('');
    setAdding(false);
  };

  const header = (
    <div className={more ? 'mx-1 mt-5 mb-2 flex items-baseline justify-between' : 'flex items-center justify-between pl-3 pr-2.5 pt-4 pb-1.5'}>
      <p className={more ? 'text-[13px] font-bold text-text-secondary' : 'text-[10px] tracking-[0.12em] text-text-secondary/60'}>
        {more ? 'Journals' : 'JOURNALS'}
      </p>
      {canAddJournal && !adding ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className={`font-medium text-accent hover:text-accent/80 focus-ring rounded ${more ? 'text-[13px]' : 'text-[11px] font-semibold'}`}
        >
          + New
        </button>
      ) : (
        !canAddJournal && (
          /* Said before the click. A "New" that silently does nothing reads as a bug. */
          <button type="button" onClick={goToPricing} className="text-[11px] text-text-secondary hover:text-accent focus-ring rounded">
            {journalLimit} on your plan
          </button>
        )
      )}
    </div>
  );

  const addForm = adding && (
    <div className={`flex items-center gap-1 ${more ? 'px-3.5 py-2.5 border-t border-white/[0.07]' : 'mt-1 px-1'}`}>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Journal name"
        aria-label="New journal name"
        className={`input-field flex-1 min-w-0 ${more ? 'py-2 text-[16px]' : 'py-1.5 text-xs'}`}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleAdd();
          if (e.key === 'Escape') {
            setAdding(false);
            setName('');
          }
        }}
      />
      <button type="button" onClick={handleAdd} className="btn-primary px-2.5 py-1.5 text-xs shrink-0">
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
        <X size={14} />
      </button>
    </div>
  );

  // The combined view: a switch when the plan has it, the plan's name when it does not.
  const showAll = settings.accounts.length > 1;
  const allRow = showAll && (
    <button
      type="button"
      onClick={canViewAllJournals ? () => setViewAllJournals(!viewingAllJournals) : goToPricing}
      role={canViewAllJournals ? 'switch' : undefined}
      aria-checked={canViewAllJournals ? viewingAllJournals : undefined}
      className={
        more
          ? 'flex min-h-[56px] w-full items-center gap-3 border-t border-white/[0.07] px-3.5 py-2 text-left hover:bg-white/[0.03] focus-ring'
          : 'flex w-full items-center justify-between rounded-[9px] px-3 py-2 text-left text-[13px] text-text-secondary hover:text-text-primary focus-ring'
      }
    >
      {more && (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[#1c1c1c] text-text-secondary" aria-hidden>
          <LayoutGrid size={18} />
        </span>
      )}
      <span className={more ? 'min-w-0 flex-1' : ''}>
        <span className={more ? 'block text-[15px]' : ''}>{more ? 'All journals together' : 'All journals'}</span>
        {more && <span className="mt-0.5 block text-xs text-text-secondary">A view — rules stay per journal</span>}
      </span>
      {canViewAllJournals ? (
        <Switch on={viewingAllJournals} big={more} />
      ) : (
        <span className="inline-flex items-center gap-1 text-[11px] text-text-secondary">
          <Lock size={12} aria-hidden />
          {allPlan ? TIER_PLANS[allPlan].name : 'Upgrade'}
        </span>
      )}
    </button>
  );

  if (more) {
    return (
      <section>
        {header}
        <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-bg-card">
          {settings.accounts.map((account, i) => {
            const active = !viewingAllJournals && settings.activeAccountId === account.id;
            const net = nets?.get(account.id);
            return (
              <button
                key={account.id}
                type="button"
                onClick={() => setActiveAccount(account.id)}
                aria-current={active ? 'true' : undefined}
                className={`flex min-h-[56px] w-full items-center gap-3 px-3.5 py-2 text-left hover:bg-white/[0.03] focus-ring ${i > 0 ? 'border-t border-white/[0.07]' : ''}`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ${active ? 'bg-accent/15 text-accent' : 'bg-[#1c1c1c] text-text-secondary'}`}
                  aria-hidden
                >
                  <BookOpen size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px]">{account.name}</span>
                  {net !== undefined && <span className="mt-0.5 block text-xs text-text-secondary">All time</span>}
                </span>
                {net !== undefined && (
                  <span className={`shrink-0 text-[13px] font-semibold tabular-nums ${net >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>{fmt(net)}</span>
                )}
                {active ? <Check size={18} className="shrink-0 text-accent" aria-hidden /> : <span className="w-[18px] shrink-0" aria-hidden />}
              </button>
            );
          })}
          {allRow}
          {addForm}
        </div>
        <AllJournalsNote className="mt-1.5 px-1" />
      </section>
    );
  }

  return (
    <div>
      {header}
      <div className="space-y-0.5">
        {settings.accounts.map((account) => {
          const active = !viewingAllJournals && settings.activeAccountId === account.id;
          const net = nets?.get(account.id);
          return (
            <button
              key={account.id}
              type="button"
              onClick={() => setActiveAccount(account.id)}
              aria-current={active ? 'true' : undefined}
              title={net !== undefined ? `${account.name}, all time` : account.name}
              className={`flex w-full items-center justify-between gap-2 rounded-[9px] border px-3 py-2 text-left text-[13px] transition-colors focus-ring ${
                active ? 'border-border bg-[#151515] text-text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              <span className="truncate">{account.name}</span>
              {net !== undefined && (
                <b className={`shrink-0 text-xs tabular-nums ${net >= 0 ? 'text-profit-bright' : 'text-loss-bright'}`}>{fmt(net)}</b>
              )}
            </button>
          );
        })}
        {allRow}
      </div>
      <AllJournalsNote className="mt-1 px-3" />
      {addForm}
    </div>
  );
}
