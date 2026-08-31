import { useState } from 'react';
import { BookOpen, Check, Plus, X } from 'lucide-react';
import { useSettings } from '../context/useSettings';

export function AccountSwitcher() {
  const { settings, setActiveAccount, addAccount } = useSettings();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  const handleAdd = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    addAccount(trimmed);
    setName('');
    setAdding(false);
  };

  // With a single journal and no add in progress there is nothing to switch between, so on
  // phones this panel was ~150px of chrome asking the user to choose between one option. Desktop
  // keeps it visible since the space is free there and it advertises that journals exist.
  const hasChoice = settings.accounts.length > 1 || adding;

  return (
    <div className={`panel-card p-2 md:p-3 shrink-0 ${hasChoice ? '' : 'hidden md:block'}`}>
      <div className="flex items-center gap-2 mb-2">
        <BookOpen size={14} className="text-accent shrink-0" />
        <p className="text-[10px] md:text-xs uppercase tracking-widest text-text-secondary font-medium">
          Journal
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
        {settings.accounts.map((account) => {
          const active = settings.activeAccountId === account.id;
          return (
            <button
              key={account.id}
              type="button"
              onClick={() => setActiveAccount(account.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium transition-all focus-ring ${
                active
                  ? 'bg-accent/15 text-accent border border-accent/35 shadow-sm shadow-accent/10'
                  : 'bg-bg-tertiary/60 text-text-secondary border border-border/50 hover:text-text-primary hover:border-border'
              }`}
            >
              {active && <Check size={12} className="shrink-0" />}
              {account.name}
            </button>
          );
        })}

        {adding ? (
          <div className="flex items-center gap-1.5 flex-1 min-w-[160px]">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Journal name"
              className="input-field py-1.5 text-xs md:text-sm flex-1 min-w-0"
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
              className="p-1.5 text-text-secondary hover:text-text-primary focus-ring rounded shrink-0"
              aria-label="Cancel"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium border border-dashed border-border/70 text-text-secondary hover:text-accent hover:border-accent/40 transition-colors focus-ring"
          >
            <Plus size={14} />
            New journal
          </button>
        )}
      </div>
    </div>
  );
}
