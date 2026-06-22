interface SidebarProps {
  activeView: string;
  onAddTrade: () => void;
  onImportScreenshot: () => void;
}

const NAV_SECTIONS = [
  {
    title: 'PERFORMANCE',
    items: [
      { id: 'calendar', label: 'Calendar', icon: '📅' },
      { id: 'overview', label: 'Overview', icon: '📊', disabled: true },
    ],
  },
  {
    title: 'TRADE',
    items: [
      { id: 'weekday', label: 'Weekday', icon: '📆', disabled: true },
      { id: 'monthly', label: 'Month', icon: '🗓', disabled: true },
    ],
  },
];

export function Sidebar({ activeView, onAddTrade, onImportScreenshot }: SidebarProps) {
  return (
    <aside className="w-56 shrink-0 bg-bg-secondary border-r border-border flex flex-col">
      <div className="p-4 border-b border-border">
        <h1 className="text-lg font-bold tracking-tight">Trading Journal</h1>
        <p className="text-xs text-text-secondary mt-0.5">Track your daily P&L</p>
      </div>

      <nav className="flex-1 p-3 space-y-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="text-[10px] font-semibold text-text-secondary tracking-wider mb-1.5 px-2">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={item.disabled}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                      activeView === item.id
                        ? 'bg-accent/20 text-accent font-medium'
                        : item.disabled
                          ? 'text-text-secondary/50 cursor-not-allowed'
                          : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
                    }`}
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

      <div className="p-3 border-t border-border space-y-2">
        <button
          type="button"
          onClick={onImportScreenshot}
          className="w-full py-2.5 border border-accent/50 text-accent rounded-md text-sm font-medium hover:bg-accent/10 transition-colors"
        >
          📷 Import Screenshot
        </button>
        <button
          type="button"
          onClick={onAddTrade}
          className="w-full py-2.5 bg-accent text-white rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          + Log Trade
        </button>
      </div>
    </aside>
  );
}
