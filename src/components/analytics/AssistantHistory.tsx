import { useMemo, useState, type CSSProperties } from 'react';
import { Check, ChevronLeft, Lock, MessageSquare, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import { useAssistantThreads } from '../../hooks/useAssistantThreads';
import { useQuestionsLeft } from '../../hooks/useAssistantChat';
import { groupThreads, searchThreads, threadSource, type AssistantThread } from '../../utils/assistantThreads';
import { shortPeriodLabel } from '../../utils/assistantPeriod';
import { lowestTierWith, TIER_PLANS } from '../../config/tiers';
import { goToPricing } from '../../utils/navigateToPath';


/**
 * The conversations column: New chat, a search, the saved conversations grouped by when, and the
 * day's allowance at the foot.
 *
 * On a phone it is the screen behind the clock icon, with its own way back; on a desktop it is
 * the left of the three columns. Switching conversations is held while an answer is still
 * arriving, because the answer is appended to whichever conversation is open when it lands — a
 * click mid-stream used to file it under the conversation clicked.
 */
export function AssistantHistory({
  busy,
  onOpen,
  onNew,
  onClose,
  className = '',
}: {
  busy: boolean;
  onOpen: (thread: AssistantThread) => void;
  onNew: () => void;
  /** The phone's way back to the chat. */
  onClose: () => void;
  className?: string;
}) {
  const { threads, activeId, deleteThread } = useAssistantThreads();
  const { perDay, left, planName } = useQuestionsLeft();
  const [query, setQuery] = useState('');
  /* Read once on mount rather than at render time: the groups don't need to tick over at midnight
     while somebody is looking, and calling Date.now() while rendering is an impure read the linter
     is right to refuse. */
  const [now] = useState(() => Date.now());
  const groups = useMemo(() => groupThreads(searchThreads(threads, query), now), [threads, query, now]);
  const leftPct = perDay > 0 ? Math.min(100, (left / perDay) * 100) : 0;

  return (
    <aside className={`panel-card rounded-[14px] min-h-0 flex-col p-3 ${className}`}>
      <div className="mb-2 flex items-center gap-2 lg:hidden">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to the chat"
          className="-ml-1 grid h-9 w-9 place-items-center rounded-lg text-accent focus-ring"
        >
          <ChevronLeft size={18} />
        </button>
        <h2 className="text-[15px] font-bold">Conversations</h2>
      </div>

      <button
        type="button"
        onClick={onNew}
        disabled={busy}
        className="btn-primary w-full gap-1 rounded-[10px]! py-2.5 text-[13px] font-bold! focus-ring disabled:opacity-50"
      >
        <Plus size={14} strokeWidth={2.75} aria-hidden />
        New chat
      </button>

      <label className="relative mt-2.5 block">
        <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary/60" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search conversations"
          aria-label="Search conversations"
          /* 16px on a phone so iOS Safari does not zoom the page in when it takes focus. */
          className="w-full rounded-[9px] border border-border bg-transparent py-2 pl-8 pr-2.5 text-base text-text-primary placeholder:text-text-secondary/60 focus:border-accent/50 focus:outline-none lg:text-[12.5px]"
        />
      </label>

      {threads.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-3 py-8 text-center">
          <MessageSquare size={18} className="text-text-secondary/40" aria-hidden />
          <p className="text-[11px] text-text-secondary leading-relaxed">
            Conversations you have are saved here, so you can come back to an answer instead of
            spending another question on it.
          </p>
        </div>
      ) : (
        <div className="-mx-1 mt-1 min-h-0 flex-1 overflow-y-auto px-1 no-scrollbar">
          {groups.length === 0 && (
            <p className="px-1.5 py-6 text-center text-xs text-text-secondary">No conversations match &ldquo;{query.trim()}&rdquo;.</p>
          )}
          {groups.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <p className="mx-1.5 mb-1.5 mt-3.5 text-[11px] font-semibold uppercase text-text-secondary/70">{group.label}</p>
              <ul className="space-y-px">
                {group.threads.map((t) => {
                  const open = t.id === activeId;
                  const source = threadSource(t);
                  const count = t.messages.length;
                  return (
                    <li key={t.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => onOpen(t)}
                        disabled={busy && !open}
                        aria-current={open ? 'true' : undefined}
                        className={`w-full rounded-[9px] py-[9px] pl-2.5 pr-8 text-left transition-colors focus-ring disabled:opacity-50 md:pr-2.5 md:group-hover:pr-8 md:group-focus-within:pr-8 ${
                          open ? 'bg-accent/10' : 'hover:bg-white/[0.04]'
                        }`}
                      >
                        <span className={`block truncate text-[13px] text-text-primary ${open ? 'font-semibold' : ''}`}>{t.title}</span>
                        <span className="mt-0.5 block text-[11px] text-text-secondary/70">
                          {source && <>{shortPeriodLabel(source.period)} · </>}
                          {count} {count === 1 ? 'message' : 'messages'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteThread(t.id)}
                        disabled={busy}
                        aria-label={`Delete conversation: ${t.title}`}
                        className="absolute right-1.5 top-2 rounded-md p-1 text-text-secondary/50 transition-colors hover:bg-loss/10 hover:text-loss-bright focus-ring disabled:hidden md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                      >
                        <Trash2 size={12} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <div className="mt-auto shrink-0 border-t border-white/[0.06] pt-3">
        <div className="flex items-baseline justify-between gap-2 text-xs text-text-secondary">
          <span>Questions left today</span>
          {perDay > 0 ? (
            <b className="font-semibold tabular-nums text-text-primary">
              {left} / {perDay}
            </b>
          ) : (
            <span>Not on this plan</span>
          )}
        </div>
        {perDay > 0 && (
          <>
            <div className="mt-1.5 h-[5px] overflow-hidden rounded-full bg-[#222]">
              <div className="bar-in h-full rounded-full bg-accent" style={{ width: `${leftPct}%` } as CSSProperties} />
            </div>
            {/* Midnight Eastern because that is where the server keys the count (server/usage.ts),
                which is also the trading day this journal is about. */}
            <p className="mt-1.5 text-[11px] text-text-secondary/70">Resets at midnight Eastern · {planName}</p>
          </>
        )}
      </div>
    </aside>
  );
}

/**
 * The conversations column with the chat locked: what the plan that has it adds, where the history
 * and the allowance meter would be. There is no history to show — conversations are the paid part —
 * and a column of empty history would read as a broken feature rather than a locked one.
 */
export function ChatPlanCard({ className = '' }: { className?: string }) {
  const plan = lowestTierWith('aiAssistant');
  const p = plan ? TIER_PLANS[plan] : null;
  if (!p) return null;
  return (
    <aside className={`panel-card rounded-[14px] flex-col p-4 ${className}`}>
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/15 text-accent" aria-hidden>
        <Sparkles size={16} />
      </span>
      <p className="mt-3 text-sm font-semibold text-text-primary">Ask it anything on {p.name}</p>
      <p className="mt-1 text-xs text-text-secondary leading-relaxed">
        The findings here are yours already. {p.name} lets you ask about them — and about anything
        else in your journal.
      </p>
      <ul className="mt-3 space-y-2 text-xs text-text-secondary">
        {[
          `${p.limits.aiMessagesPerDay} questions a day about your own trades`,
          'Follow up on any finding, compare two periods',
          'Conversations saved, so an answer is there next time',
          'The rule simulator — what a daily stop would have done',
        ].map((line) => (
          <li key={line} className="flex items-start gap-2">
            <Check size={13} className="mt-0.5 shrink-0 text-profit-bright" aria-hidden />
            {line}
          </li>
        ))}
      </ul>
      <button type="button" onClick={goToPricing} className="btn-primary mt-4 w-full px-3 py-2 text-[13px] focus-ring">
        Upgrade to {p.name}
      </button>
      <p className="mt-2 text-center text-[11px] text-text-secondary">From ${p.price}/month · cancel anytime</p>
      <p className="mt-auto pt-4 flex items-start gap-1.5 text-[10px] text-text-secondary/60 leading-relaxed">
        <Lock size={10} className="mt-0.5 shrink-0" aria-hidden />
        These findings are worked out on your device from your journal. Nothing was sent anywhere to
        make them.
      </p>
    </aside>
  );
}
