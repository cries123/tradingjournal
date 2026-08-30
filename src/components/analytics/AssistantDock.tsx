import { useEffect } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { AssistantPanel, type AssistantPeriod } from './AssistantPanel';

interface AssistantDockProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Periods the trader can switch between without leaving the chat. */
  periods: AssistantPeriod[];
  /** The trader's own risk limits, so the assistant can report breaches of their rules. */
  rules?: { enabled: boolean; maxDailyLoss?: number; maxTradesPerDay?: number; maxDailyGain?: number };
  /** Hides the floating launcher where the nav already provides an entry point. */
  showLauncher: boolean;
}

/**
 * Houses the assistant as a support-widget style launcher rather than a panel in the page flow.
 *
 * On desktop that's the familiar bottom-right bubble: available from any view, costing no vertical
 * space until someone wants it. On mobile the launcher is suppressed — the nav bar opens it
 * instead, since a floating bubble would sit on top of the nav and fight the "+" button for the
 * same corner of the thumb zone.
 */
export function AssistantDock({
  open,
  onOpenChange,
  periods,
  rules,
  showLauncher,
}: AssistantDockProps) {
  useEscapeToClose(() => onOpenChange(false));

  // A full-height sheet on a phone would otherwise scroll the journal behind it.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    if (window.matchMedia('(max-width: 767px)').matches) document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      {showLauncher && !open && (
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          aria-label="Ask about your trading"
          className="hidden md:flex fixed bottom-6 right-6 z-40 items-center gap-2 rounded-full bg-gradient-to-br from-profit-bright to-accent text-bg-primary pl-4 pr-5 py-3 shadow-lg shadow-profit-bright/25 hover:shadow-xl hover:shadow-profit-bright/35 transition-shadow focus-ring"
        >
          <MessageCircle size={18} strokeWidth={2.5} />
          <span className="text-sm font-semibold">Ask</span>
        </button>
      )}

      {open && (
        <>
          {/* Backdrop is phone-only: on desktop the widget is meant to sit alongside the journal
              you're asking about, not blank it out. */}
          <button
            type="button"
            aria-label="Close assistant"
            onClick={() => onOpenChange(false)}
            className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-backdrop-in"
          />

          <div
            role="dialog"
            aria-label="Trading assistant"
            className="fixed z-50 flex flex-col animate-scale-in motion-safe:animate-scale-in
              inset-x-0 bottom-0 top-16 rounded-t-2xl
              md:inset-auto md:top-auto md:bottom-6 md:right-6 md:w-[400px] md:max-h-[min(620px,calc(100dvh-6rem))] md:rounded-2xl
              border border-border bg-bg-secondary shadow-2xl shadow-black/50 overflow-hidden"
          >
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/60 shrink-0">
              <span className="text-xs font-semibold text-text-primary">Trading assistant</span>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="Close"
                className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60 transition-colors focus-ring"
              >
                <X size={16} />
              </button>
            </div>

            {/* min-h-0 and no overflow here: the panel owns its own scrolling, so the message
                list scrolls while the composer stays pinned to the bottom of the sheet. */}
            <div className="flex-1 min-h-0 flex flex-col p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <AssistantPanel periods={periods} rules={rules} bare />
            </div>
          </div>
        </>
      )}
    </>
  );
}
