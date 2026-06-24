import { AuthPanel } from './AuthPanel';

interface SidebarProps {
  onAddTrade: () => void;
  onImportScreenshot: () => void;
  onImportCsv: () => void;
  onClearAll: () => void;
}

const NAV_SECTIONS = [
  {
    title: 'PERFORMANCE',
    items: [
      { id: 'overview', label: 'Overview', icon: '📊' },
    ],
  },
];

export function Sidebar({ onAddTrade, onImportScreenshot, onImportCsv, onClearAll }: SidebarProps) {
  return (
    <aside className="w-48 shrink-0 bg-bg-secondary border-r border-border flex flex-col h-full overflow-hidden">
      <div className="p-3 border-b border-border shrink-0">
        <h1 className="text-base font-bold tracking-tight">Trading Journal</h1>
        <p className="text-[10px] text-text-secondary mt-0.5">Track daily P&L</p>
      </div>

      <nav className="flex-1 min-h-0 p-2 space-y-3 overflow-hidden">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="text-[10px] font-semibold text-text-secondary tracking-wider mb-1 px-2">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 px-2 py-1 rounded-md text-sm bg-accent/20 text-accent font-medium"
                  >
                    <span>{item.icon}</span>
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <AuthPanel />

      <div className="p-2 border-t border-border space-y-1.5 shrink-0">
        <button
          type="button"
          onClick={onImportCsv}
          className="w-full py-2 border border-border text-text-primary rounded-md text-xs font-medium hover:bg-bg-tertiary transition-colors"
        >
          📄 Import CSV
        </button>
        <button
          type="button"
          onClick={onImportScreenshot}
          className="w-full py-2 border border-accent/50 text-accent rounded-md text-xs font-medium hover:bg-accent/10 transition-colors"
        >
          📷 Import Screenshot
        </button>
        <button
          type="button"
          onClick={onAddTrade}
          className="w-full py-2 bg-accent text-white rounded-md text-xs font-medium hover:opacity-90 transition-opacity"
        >
          + Log Trade
        </button>
        <button
          type="button"
          onClick={onClearAll}
          className="w-full py-1 text-[10px] text-text-secondary hover:text-red-400 transition-colors"
        >
          Clear all trades
        </button>
      </div>
    </aside>
  );
}
