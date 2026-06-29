import { useState } from 'react';
import { BookOpen, Check, Plus, X } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';

interface SidebarJournalPickerProps {
  onNavigate?: () => void;
}

export function SidebarJournalPicker({ onNavigate }: SidebarJournalPickerProps) {
  const { settings, setActiveAccount, addAccount } = useSettings();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  const handleAdd = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    addAccount(trimmed);
    setName('');
    setAdding(false);
    onNavigate?.();
  };

  return (
    <div className="rounded-lg border border-border/50 bg-bg-tertiary/30 p-2.5">
      <div className="flex items-center gap-1.5 px-1 mb-2">
        <BookOpen size={13} className="text-emerald-400 shrink-0" />
        <p className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">Journal</p>
      </div>

      <div className="space-y-1">
        {settings.accounts.map((account) => {
          const active = settings.activeAccountId === account.id;
          return (
            <button
              key={account.id}
              type="button"
              onClick={() => setActiveAccount(account.id)}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left text-xs font-medium transition-colors focus-ring ${
                active
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/80 border border-transparent'
              }`}
            >
              {active ? <Check size={12} className="shrink-0" /> : <span className="w-3 shrink-0" aria-hidden />}
              <span className="truncate">{account.name}</span>
            </button>
          );
        })}
      </div>

      {adding ? (
        <div className="mt-2 flex items-center gap-1">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Journal name"
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
          <button type="button" onClick={handleAdd} className="btn-primary px-2 py-1.5 text-[10px] shrink-0">
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
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-2 w-full flex items-center justify-center gap-1 py-1.5 rounded-md text-[11px] font-medium border border-dashed border-border/60 text-text-secondary hover:text-emerald-300 hover:border-emerald-500/40 transition-colors focus-ring"
        >
          <Plus size={12} />
          New journal
        </button>
      )}
    </div>
  );
}
