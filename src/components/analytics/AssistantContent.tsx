import { useState, type CSSProperties } from 'react';
import { Lock, MessageSquare, Sparkles, SquarePen, Trash2 } from 'lucide-react';
import { useEntitlement } from '../../context/useEntitlement';
import { useAssistantThreads } from '../../hooks/useAssistantThreads';
import { relativeAge } from '../../utils/assistantThreads';
import { TIER_PLANS } from '../../config/tiers';
import { AssistantPanel, type AssistantPeriod } from './AssistantPanel';
import { PageFrame } from '../layout/PageFrame';

interface AssistantContentProps {
  periods: AssistantPeriod[];
  rules?: { enabled: boolean; maxDailyLoss?: number; maxTradesPerDay?: number; maxDailyGain?: number };
  onBack: () => void;
}

/**
 * The assistant, as a place rather than a bubble.
 *
 * The dock was the whole feature: a 400px panel in the corner that unmounted the moment you
 * clicked the chart the answer was about, with one conversation in it and a bin as the only way
 * out. That is a fine shape for a thing you use once; it is the wrong shape for something people
 * are paying for and coming back to.
 *
 * So this screen keeps the same panel — same facts, same guardrails, same allowance — and adds the
 * two things it was missing: room to read a long answer, and a list of everything you have already
 * asked. The dock stays for asking a quick question without leaving the calendar; both read the
 * same saved conversations, so it is one assistant with two doors.
 *
 * Laid out like the chat tools people already know: conversations down the left, one reading column
 * in the middle with the box to type in at its foot. It used to open on a row of four stat tiles —
 * questions left, conversations saved, questions asked, the period — which made the first thing on
 * a chat screen a dashboard. The allowance now sits under the history where it is a meter, the
 * counts are in the history header, and the period is the chat's own control.
 */
export function AssistantContent({ periods, rules, onBack }: AssistantContentProps) {
  const { tier, limits, usage } = useEntitlement();
  const { threads, activeId, selectThread, startNew, deleteThread } = useAssistantThreads();

  /* Read once on mount rather than at render time: relative ages don't need to tick, and calling
     Date.now() while rendering is an impure read the linter is right to refuse. */
  const [now] = useState(() => Date.now());

  const perDay = limits.aiMessagesPerDay;
  const left = Math.max(0, perDay - usage.aiMessagesUsed) + (usage.aiCredits ?? 0);
  const leftPct = perDay > 0 ? Math.min(100, (left / perDay) * 100) : 0;

  return (
    <PageFrame
      sidebarDestination
      title="Trading assistant"
      icon={Sparkles}
      onBack={onBack}
      subtitle="Ask about the trades you took. Every figure it quotes is one your journal already computed, so it can't disagree with your dashboard — and it reviews, it never tells you what to trade next."
    >
      {/* One height for both columns, from the window: the composer stays put while a long reply
          streams in (no page jump under the cursor on every token), and on a tall screen the
          conversation fills it rather than leaving the bottom third empty. */}
      <div className="grid gap-2 md:gap-3 lg:grid-cols-[272px_minmax(0,1fr)] lg:h-[calc(100dvh-11rem)] lg:min-h-[540px]">
        <aside className="panel-card p-3 flex flex-col min-h-0">
          <button
            type="button"
            onClick={startNew}
            className="btn-primary w-full gap-2 px-3 py-2 text-[13px] focus-ring"
          >
            <SquarePen size={14} aria-hidden />
            New chat
          </button>

          <p className="flex items-center justify-between px-1 pt-4 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-secondary/60">
            History
            {threads.length > 0 && <span className="tabular-nums tracking-normal">{threads.length}</span>}
          </p>

          {threads.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-3 py-6 text-center">
              <MessageSquare size={18} className="text-text-secondary/40" aria-hidden />
              <p className="text-[11px] text-text-secondary leading-relaxed">
                Conversations you have are saved here, so you can come back to an answer instead of
                spending another question on it.
              </p>
            </div>
          ) : (
            <ul className="flex-1 min-h-0 max-h-56 lg:max-h-none space-y-0.5 overflow-y-auto no-scrollbar -mx-1 px-1">
              {threads.map((t) => {
                const open = t.id === activeId;
                const asked = t.messages.filter((m) => m.role === 'user').length;
                return (
                  <li key={t.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => selectThread(t.id)}
                      aria-current={open ? 'true' : undefined}
                      className={`relative w-full rounded-lg pl-3 pr-8 py-2 text-left transition-colors focus-ring ${
                        open ? 'bg-accent/10' : 'hover:bg-bg-tertiary/60'
                      }`}
                    >
                      {open && (
                        <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-accent" aria-hidden />
                      )}
                      <span
                        className={`block text-[13px] leading-snug line-clamp-2 ${
                          open ? 'text-text-primary font-medium' : 'text-text-secondary'
                        }`}
                      >
                        {t.title}
                      </span>
                      <span className="block text-[11px] text-text-secondary/60 mt-0.5">
                        {relativeAge(t.updatedAt, now)} · {asked} asked
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteThread(t.id)}
                      aria-label={`Delete conversation: ${t.title}`}
                      className="absolute right-1.5 top-2 p-1 rounded-md text-text-secondary/50 hover:text-loss-bright hover:bg-loss/10 transition-colors focus-ring md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                    >
                      <Trash2 size={12} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-3 pt-3 border-t border-border/40 shrink-0">
            <div className="flex items-baseline justify-between gap-2 text-[11px]">
              <span className="text-text-secondary">Questions left today</span>
              {perDay > 0 ? (
                <span className="font-semibold tabular-nums text-text-primary">
                  {left}
                  <span className="font-normal text-text-secondary"> / {perDay}</span>
                </span>
              ) : (
                <span className="text-text-secondary">Not on this plan</span>
              )}
            </div>
            {perDay > 0 && (
              <>
                <div className="mt-1.5 h-1 rounded-full bg-bg-primary overflow-hidden">
                  <div
                    className="bar-in h-full rounded-full bg-gradient-to-r from-profit-bright to-accent"
                    style={{ width: `${leftPct}%` } as CSSProperties}
                  />
                </div>
                <p className="mt-1 text-[10px] text-text-secondary/60">Resets daily on {TIER_PLANS[tier].name}</p>
              </>
            )}
            <p className="mt-3 flex items-start gap-1.5 text-[10px] text-text-secondary/60 leading-relaxed">
              <Lock size={10} className="mt-0.5 shrink-0" aria-hidden />
              Kept in this browser, not on our servers — your questions and notes stay on this device.
            </p>
          </div>
        </aside>

        <div className="panel-card p-3 md:p-4 flex flex-col h-[calc(100dvh-11rem)] min-h-[540px] lg:h-auto lg:min-h-0">
          <AssistantPanel periods={periods} rules={rules} bare layout="page" />
        </div>
      </div>
    </PageFrame>
  );
}
