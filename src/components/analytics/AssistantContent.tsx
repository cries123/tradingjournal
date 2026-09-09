import { useState } from 'react';
import { ArrowLeft, MessageSquare, Sparkles, SquarePen, Trash2 } from 'lucide-react';
import { useEntitlement } from '../../context/useEntitlement';
import { useAssistantThreads } from '../../hooks/useAssistantThreads';
import { relativeAge } from '../../utils/assistantThreads';
import { TIER_PLANS } from '../../config/tiers';
import { AssistantPanel, type AssistantPeriod } from './AssistantPanel';

interface AssistantContentProps {
  periods: AssistantPeriod[];
  rules?: { enabled: boolean; maxDailyLoss?: number; maxTradesPerDay?: number; maxDailyGain?: number };
  onBack: () => void;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-bg-primary/50 border border-border/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-text-secondary">{label}</p>
      <p className="text-base font-semibold tabular-nums mt-0.5">{value}</p>
      {hint && <p className="text-[10px] text-text-secondary leading-snug">{hint}</p>}
    </div>
  );
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
 */
export function AssistantContent({ periods, rules, onBack }: AssistantContentProps) {
  const { tier, limits, usage } = useEntitlement();
  const { threads, activeId, selectThread, startNew, deleteThread } = useAssistantThreads();

  /* Read once on mount rather than at render time: relative ages don't need to tick, and calling
     Date.now() while rendering is an impure read the linter is right to refuse. */
  const [now] = useState(() => Date.now());

  const left = Math.max(0, limits.aiMessagesPerDay - usage.aiMessagesUsed) + (usage.aiCredits ?? 0);
  const questionsAsked = threads.reduce(
    (sum, t) => sum + t.messages.filter((m) => m.role === 'user').length,
    0,
  );

  return (
    <div className="pb-6">
      <div className="max-w-6xl mx-auto p-4 md:p-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-accent transition-colors mb-6 focus-ring rounded-lg px-1 py-1"
        >
          <ArrowLeft size={16} />
          Back to dashboard
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-accent/10 text-accent">
            <Sparkles size={22} />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Trading assistant</h1>
        </div>
        <p className="text-text-secondary mb-5 leading-relaxed max-w-2xl">
          Every figure it quotes is one your journal already computed, so it can never disagree with
          the screen you came from. It reviews the trades you took — it won&apos;t tell you what to
          trade next.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
          <Stat
            label="Questions left today"
            value={limits.aiMessagesPerDay > 0 ? String(left) : '—'}
            hint={
              limits.aiMessagesPerDay > 0
                ? `of ${limits.aiMessagesPerDay} on ${TIER_PLANS[tier].name}`
                : 'Not on this plan'
            }
          />
          <Stat label="Saved conversations" value={String(threads.length)} hint="On this device" />
          <Stat label="Questions asked" value={String(questionsAsked)} hint="Across your history" />
          <Stat
            label="Reviewing"
            value={periods[0]?.label ?? '—'}
            hint="Switch period in the chat"
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-[224px_minmax(0,1fr)] items-start">
          <aside className="panel-card p-2.5 lg:sticky lg:top-4">
            <button
              type="button"
              onClick={startNew}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-accent/30 bg-accent/10 text-accent px-3 py-2 text-[13px] font-medium hover:bg-accent/15 transition-colors focus-ring"
            >
              <SquarePen size={14} />
              New chat
            </button>

            <p className="px-1 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-secondary/45">
              History
            </p>

            {threads.length === 0 ? (
              <p className="px-1 pb-1 text-[11px] text-text-secondary leading-relaxed">
                Conversations you have are saved here, so you can come back to an answer instead of
                spending another question on it.
              </p>
            ) : (
              <ul className="space-y-0.5 max-h-[420px] overflow-y-auto no-scrollbar">
                {threads.map((t) => {
                  const open = t.id === activeId;
                  return (
                    <li key={t.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => selectThread(t.id)}
                        className={`w-full rounded-lg pl-2.5 pr-7 py-1.5 text-left transition-colors focus-ring ${
                          open
                            ? 'bg-accent/10 text-accent'
                            : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60'
                        }`}
                      >
                        <span className="block text-[12px] leading-snug line-clamp-2">{t.title}</span>
                        <span className="block text-[10px] text-text-secondary/70 mt-0.5">
                          {relativeAge(t.updatedAt, now)} ·{' '}
                          {t.messages.filter((m) => m.role === 'user').length} asked
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteThread(t.id)}
                        aria-label={`Delete conversation: ${t.title}`}
                        className="absolute right-1 top-1.5 p-1 rounded-md text-text-secondary/50 hover:text-loss-bright hover:bg-loss/10 transition-colors focus-ring md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                      >
                        <Trash2 size={12} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>

          {/* A fixed, generous height rather than growing with the answer: the composer stays put
              while a long reply streams in, which is what stops the page jumping under the cursor
              on every token. */}
          <div className="panel-card p-3 md:p-4 flex flex-col h-[min(680px,calc(100dvh-13rem))] min-h-[440px]">
            <AssistantPanel periods={periods} rules={rules} bare layout="page" />
          </div>
        </div>

        <p className="mt-4 flex items-start gap-2 text-[11px] text-text-secondary leading-relaxed">
          <MessageSquare size={13} className="mt-0.5 shrink-0 text-text-secondary/60" />
          Conversations are kept in this browser, not on our servers — your questions and your notes
          stay on the device you asked them from.
        </p>
      </div>
    </div>
  );
}
