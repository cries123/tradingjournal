import { useEffect, useRef, useState } from 'react';
import { BookOpen, ChevronDown, Gauge, Megaphone, Sparkles, Tag } from 'lucide-react';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import type { ExtraNavRoute } from '../../hooks/useRoute';

interface ProductsDropdownProps {
  onLaunch: () => void;
  onNavigate?: (route: ExtraNavRoute) => void;
}

function ComingSoonBadge() {
  return (
    <span className="ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-wider text-text-secondary bg-bg-primary border border-border/60 rounded-full px-2 py-0.5">
      Soon
    </span>
  );
}

export function ProductsDropdown({ onLaunch, onNavigate }: ProductsDropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const close = () => setOpen(false);
  useEscapeToClose(close);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const go = (route: ExtraNavRoute) => {
    onNavigate?.(route);
    close();
  };

  const launch = () => {
    onLaunch();
    close();
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
      >
        Products
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-3 w-72 rounded-xl border border-border/60 bg-bg-secondary shadow-xl shadow-black/20 p-2 z-20"
        >
          <button
            type="button"
            role="menuitem"
            onClick={launch}
            className="w-full flex items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-bg-primary transition-colors"
          >
            <BookOpen className="h-4 w-4 mt-0.5 text-emerald-400 shrink-0" aria-hidden />
            <span>
              <span className="block text-sm font-medium text-text-primary">Journal</span>
              <span className="block text-xs text-text-secondary">Log trades, track P&amp;L on a calendar</span>
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => go('ai-assistant')}
            className="w-full flex items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-bg-primary transition-colors"
          >
            <Sparkles className="h-4 w-4 mt-0.5 text-emerald-400 shrink-0" aria-hidden />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium text-text-primary">AI Assistant</span>
              <span className="block text-xs text-text-secondary">
                Ask why a setup keeps losing
              </span>
            </span>
          </button>

          <div className="my-2 border-t border-border/50" />

          <button
            type="button"
            role="menuitem"
            onClick={() => go('pricing')}
            className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-bg-primary transition-colors"
          >
            <Tag className="h-4 w-4 text-text-secondary shrink-0" aria-hidden />
            <span className="text-sm font-medium text-text-primary">Pricing</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => go('whats-new')}
            className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-bg-primary transition-colors"
          >
            <Megaphone className="h-4 w-4 text-text-secondary shrink-0" aria-hidden />
            <span className="text-sm font-medium text-text-primary">What&apos;s New</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => go('market-simulator')}
            className="w-full flex items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-bg-primary transition-colors"
          >
            <Gauge className="h-4 w-4 mt-0.5 text-text-secondary shrink-0" aria-hidden />
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-2">
                <span className="block text-sm font-medium text-text-primary">Market Simulator</span>
                <ComingSoonBadge />
              </span>
              <span className="block text-xs text-text-secondary">Practice trading risk-free</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
