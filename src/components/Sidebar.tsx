import { BrandLogo } from './BrandLogo';
import { AuthPanel } from './AuthPanel';

interface SidebarProps {
  onAddTrade: () => void;
  onImportScreenshot: () => void;
  onImportCsv: () => void;
  onClearAll: () => void;
  onHome?: () => void;
  variant?: 'desktop' | 'drawer';
  onNavigate?: () => void;
}

const NAV_SECTIONS = [
  {
    title: 'Performance',
    items: [{ id: 'overview', label: 'Overview', icon: '◉' }],
  },
];

export function Sidebar({
  onAddTrade,
  onImportScreenshot,
  onImportCsv,
  onClearAll,
  onHome,
  variant = 'desktop',
  onNavigate,
}: SidebarProps) {
  const wrap = (fn: () => void) => () => {
    fn();
    onNavigate?.();
  };

  const shellClass =
    variant === 'drawer'
      ? 'flex flex-col w-full h-full bg-bg-secondary/95 backdrop-blur-xl'
      : 'flex flex-col w-56 shrink-0 h-full bg-bg-secondary/80 backdrop-blur-xl border-r border-border/60';

  return (
    <aside className={`${shellClass} overflow-hidden`}>
      <div className="p-4 border-b border-border/60 shrink-0">
        {onHome ? (
          <button type="button" onClick={onHome} className="text-left hover:opacity-90 transition-opacity">
            <BrandLogo size="md" />
          </button>
        ) : (
          <BrandLogo size="md" />
        )}
      </div>

      <nav className="flex-1 min-h-0 p-3 space-y-4 overflow-y-auto">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="text-[10px] font-semibold text-text-secondary tracking-wider mb-2 px-2 uppercase">
              {section.title}
            </p>
            <ul>
              {section.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-medium"
                  >
                    <span className="text-emerald-400">{item.icon}</span>
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <AuthPanel />

      <div className="p-3 border-t border-border/60 space-y-2 shrink-0">
        <button
          type="button"
          onClick={wrap(onImportCsv)}
          className="w-full py-2.5 panel-card text-text-primary text-sm font-medium hover:border-emerald-500/30 transition-colors"
        >
          Import CSV
        </button>
        <button
          type="button"
          onClick={wrap(onImportScreenshot)}
          className="w-full py-2.5 panel-card text-cyan-300 text-sm font-medium border-cyan-500/20 hover:border-cyan-500/40 transition-colors"
        >
          Import Screenshot
        </button>
        <button type="button" onClick={wrap(onAddTrade)} className="w-full py-2.5 btn-primary text-sm">
          + Log Trade
        </button>
        <button
          type="button"
          onClick={wrap(onClearAll)}
          className="w-full py-1 text-[10px] text-text-secondary hover:text-red-400 transition-colors"
        >
          Clear all trades
        </button>
      </div>
    </aside>
  );
}
