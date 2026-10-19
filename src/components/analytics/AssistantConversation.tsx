import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowUp, Check, ChevronDown, ChevronLeft, Clock, Copy, MoreHorizontal, Pencil, RotateCcw } from 'lucide-react';
import type { Finding } from '../../utils/assistantOpening';
import type { AnswerSource, ThreadMessage } from '../../utils/assistantThreads';
import { threadSource } from '../../utils/assistantThreads';
import { periodNoun, shortPeriodLabel } from '../../utils/assistantPeriod';
import { CHAT_PLAN_NAME, useCopied, useQuestionsLeft, type AssistantChat, type AssistantScope } from '../../hooks/useAssistantChat';
import { useAssistantThreads } from '../../hooks/useAssistantThreads';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { SegmentedControl } from '../ui/SegmentedControl';
import { AnswerBody } from './AnswerBody';
import { ChatUpgrade, NotesSwitch, TcAvatar, TypingDots } from './AssistantParts';
import { FIGURE_TONE } from './assistantStyle';

/** Max height for the textarea before it starts scrolling instead of growing. */
const MAX_INPUT_HEIGHT = 116;

/** Follow-ups offered under the latest answer: enough to pick from, few enough to read. */
const MAX_FOLLOW_UPS = 3;

/* The starting-point cards keep the width a third of the 760px row gives them (245px), so two
   findings are two cards centred rather than two thirds of a row with a hole where the third was. */
const CARD_GRID: Record<number, string> = {
  1: 'lg:max-w-[245px] lg:grid-cols-1',
  2: 'lg:max-w-[502px] lg:grid-cols-2',
  3: 'lg:max-w-[760px] lg:grid-cols-3',
};

const iconButton =
  'grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-bg-tertiary text-text-secondary hover:text-text-primary focus-ring disabled:opacity-50';
const headerButton =
  'inline-flex items-center gap-1.5 rounded-[9px] border px-[11px] py-1.5 text-xs transition-colors focus-ring';

/**
 * The middle column: the period and its figures across the top, the conversation, the box to
 * type in. On a phone it is the whole screen — the opening state under an "Ask" title with the
 * history and new-chat buttons, and a conversation under a bar that leads back to it.
 *
 * One tree for both, laid out by breakpoint, rather than a phone component and a desktop one: the
 * box being typed in must survive a rotate or a resized window with its text and its focus.
 */
export function AssistantConversation({
  chat,
  net,
  onHistory,
  onNew,
  className = '',
}: {
  chat: AssistantChat;
  /** The period's net, formatted, with its colour. */
  net: ReactNode;
  onHistory: () => void;
  onNew: () => void;
  className?: string;
}) {
  const { periods, scope, setScope, active, compare, compareScope, setCompareScope, facts, findings, suggestions } = chat;
  const { messages, busy, streaming, error, input, setInput, shareNotes, setShareNotes, unreadNotes, chatLocked } = chat;
  const { active: thread } = useAssistantThreads();
  const { perDay, left } = useQuestionsLeft();
  const { copied, copy } = useCopied();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const opening = messages.length === 0;
  const label = active?.label ?? '';
  const noun = periodNoun(scope, label);
  const periodOptions = periods.map((p) => ({ id: p.scope, label: shortPeriodLabel(p.label) }));
  const others = periods.filter((p) => p.scope !== scope);

  // Grow the box with the text, up to a ceiling. Measuring against a reset height is what keeps it
  // shrinking again when the user deletes a line.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }, [input]);

  /* To the end of the conversation as it grows. scrollIntoView rather than scrolling one box,
     because the box that scrolls is a different one on each layout: the message column on a
     desktop, the whole screen on a phone. */
  useEffect(() => {
    if (messages.length === 0 && !busy) return;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: 'end', behavior: reduce ? 'auto' : 'smooth' }));
  }, [messages.length, busy, streaming]);

  /* Offered under the latest answer: the journal's own suggested questions, less the ones this
     conversation has already asked. Not tailored to the answer — that would take the model — but
     each is a real question about this period that the assistant can answer from its figures. */
  const followUps = useMemo(() => {
    const asked = new Set(messages.filter((m) => m.role === 'user').map((m) => m.content.trim()));
    return suggestions.filter((s) => !asked.has(s.question)).slice(0, MAX_FOLLOW_UPS);
  }, [messages, suggestions]);
  const lastAnswer = messages.map((m) => m.role).lastIndexOf('assistant');

  const subtitle = (() => {
    const s = thread ? threadSource(thread) : null;
    if (s) return `${shortPeriodLabel(s.period)} · ${s.trades} ${s.trades === 1 ? 'trade' : 'trades'}`;
    return facts ? `${shortPeriodLabel(label)} · ${facts.tradeCount} ${facts.tradeCount === 1 ? 'trade' : 'trades'}` : shortPeriodLabel(label);
  })();

  return (
    <section
      aria-label="Conversation"
      className={`min-h-0 flex-1 flex-col lg:overflow-hidden lg:rounded-[14px] lg:border lg:border-white/[0.07] lg:bg-bg-card ${className}`}
    >
      {/* ── Phone: the title, before a question ── */}
      {opening && (
        <div className="mt-2.5 flex items-center justify-between lg:hidden">
          <h1 className="text-[26px] font-extrabold leading-tight tracking-tight">Ask</h1>
          {/* Conversations are the paid part, so with the chat locked there is nothing behind them. */}
          {!chatLocked && (
            <div className="flex gap-2">
              <button type="button" onClick={onHistory} aria-label="Conversations" className={iconButton}>
                <Clock size={18} />
              </button>
              <button type="button" onClick={onNew} disabled={busy} aria-label="New chat" className={iconButton}>
                <Pencil size={17} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Phone: the conversation's own bar, with the way back to the opening ── */}
      {!opening && (
        <div className="sticky z-10 -mx-2 -mt-2 flex h-14 shrink-0 items-center gap-2.5 border-b border-white/[0.06] bg-bg-primary px-4 max-md:-top-2 md:top-0 md:-mx-5 md:-mt-5 md:px-5 lg:hidden">
          {/* Back is a new chat: this conversation is already saved, behind the clock icon. Held
              while an answer arrives, which is appended to whichever conversation is open. */}
          <button type="button" onClick={onNew} disabled={busy} aria-label="Back to Ask" className="-ml-1.5 grid h-9 w-8 place-items-center text-accent focus-ring disabled:opacity-50">
            <ChevronLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold">{thread?.title ?? messages.find((m) => m.role === 'user')?.content ?? 'New chat'}</p>
            <p className="text-xs text-text-secondary tabular-nums">{subtitle}</p>
          </div>
          <ConversationMenu chat={chat} disabled={busy} />
        </div>
      )}

      {/* ── The period and its figures. The header row on a desktop; on a phone, under the title ── */}
      <div
        className={`flex shrink-0 flex-wrap items-center gap-2 lg:border-b lg:border-white/[0.06] lg:px-4 lg:py-3 ${
          opening ? 'mt-3 lg:mt-0' : 'max-lg:hidden'
        }`}
      >
        {periods.length > 1 && <SegmentedControl label="Period" value={scope} onChange={setScope} options={periodOptions} />}

        {/* Compare and notes change what the model is sent, so they only appear with the chat. On
            a phone they live in the conversation's ⋯ menu, where the design has room for them. */}
        {!chatLocked && others.length > 0 && (
          <label
            className={`relative inline-flex items-center rounded-[9px] border text-xs transition-colors max-lg:hidden ${
              compare ? 'border-accent/40 bg-accent/10 text-accent' : 'border-border text-text-secondary hover:text-text-primary'
            }`}
          >
            <select
              value={compareScope ?? ''}
              onChange={(e) => setCompareScope((e.target.value || null) as AssistantScope | null)}
              aria-label="Compare against another period"
              className="cursor-pointer appearance-none bg-transparent py-1.5 pl-[11px] pr-6 focus:outline-none"
            >
              <option value="" className="bg-bg-secondary text-text-primary">Compare</option>
              {others.map((p) => (
                <option key={p.scope} value={p.scope} className="bg-bg-secondary text-text-primary">
                  vs {shortPeriodLabel(p.label)}
                </option>
              ))}
            </select>
            <ChevronDown size={11} className="pointer-events-none absolute right-2" aria-hidden />
          </label>
        )}
        {!chatLocked && (
          <button
            type="button"
            role="switch"
            aria-checked={shareNotes}
            title="Let it read my trade notes"
            onClick={() => setShareNotes(!shareNotes)}
            className={`max-lg:hidden ${headerButton} ${
              shareNotes ? 'border-accent/40 bg-accent/10 text-accent' : 'border-border text-text-secondary hover:text-text-primary'
            }`}
          >
            {shareNotes ? 'Notes on' : 'Notes off'}
          </button>
        )}

        {facts && (
          <span className="ml-auto hidden text-xs text-text-secondary tabular-nums lg:inline">
            {facts.tradeCount} {facts.tradeCount === 1 ? 'trade' : 'trades'} · {net}
          </span>
        )}
        {!chatLocked && perDay > 0 && (
          <span className={`ml-auto text-xs tabular-nums lg:hidden ${left <= 5 ? 'text-amber-400' : 'text-text-secondary'}`}>
            {left} left today
          </span>
        )}
      </div>

      {!facts ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
          <TcAvatar size="lg" />
          <p className="mt-3 text-base font-semibold">No trades in {label || 'this period'} yet</p>
          <p className="mt-1 max-w-sm text-sm text-text-secondary">
            {periods.length > 1
              ? 'Pick a longer period above, or log a few, and the assistant can review them with you.'
              : 'Log a few trades and the assistant can review them with you.'}
          </p>
        </div>
      ) : opening ? (
        <div className="lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-y-auto">
          {/* my-auto rather than justify-center: centred, and still scrollable from the top when
              the window is too short for it. */}
          <div className="flex flex-col lg:my-auto lg:items-center lg:gap-[22px] lg:px-10 lg:py-6">
            <div className="px-2 pb-3.5 pt-[26px] text-center lg:max-w-[560px] lg:p-0">
              <TcAvatar size="lg" />
              <h2 className="mt-3 text-[21px] font-bold leading-tight lg:mt-3.5 lg:text-2xl">What do you want to know about {noun}?</h2>
              <p className="mt-1.5 text-[13px] text-text-secondary tabular-nums lg:mt-2 lg:text-[13.5px]">
                {facts.tradeCount} {facts.tradeCount === 1 ? 'trade' : 'trades'} · {net}
                {compare && <> · compared with {compare.label}</>} ·{' '}
                {/* The line about advice, in both layouts, where it is read before anything is asked. */}
                <span className="lg:hidden">reviews only, no trade advice</span>
                <span className="hidden lg:inline">It reviews what you did. It never tells you what to trade next.</span>
              </p>
            </div>

            {findings.length > 0 && (
              <>
                <p className="mx-1 mb-2 mt-1.5 text-[13px] font-bold text-text-secondary lg:hidden">Starting points</p>
                <div className={`flex flex-col gap-2 lg:grid lg:w-full lg:gap-3 ${CARD_GRID[findings.length] ?? CARD_GRID[3]}`}>
                  {findings.map((f, i) => (
                    <StartingPoint
                      key={f.headline}
                      finding={f}
                      index={i}
                      disabled={busy}
                      locked={chatLocked}
                      onAsk={() => chat.ask(f.question, f.headline)}
                    />
                  ))}
                </div>
              </>
            )}

            {suggestions.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-2 lg:mt-0 lg:max-w-[760px] lg:justify-center">
                {suggestions.slice(0, 4).map((s, i) => (
                  <Chip key={s.id} onClick={() => chat.ask(s.question, s.label)} disabled={busy} className={i >= 2 ? 'max-lg:hidden' : ''}>
                    {s.label}
                  </Chip>
                ))}
              </div>
            )}

            {!chatLocked && unreadNotes > 0 && (
              /* On a phone this is the way to the notes opt-in before a question is asked; a desktop
                 has the switch in the header and in the rail beside it. */
              <button
                type="button"
                onClick={() => setShareNotes(true)}
                className="mt-4 rounded px-1 text-left text-xs text-text-secondary transition-colors hover:text-accent focus-ring lg:hidden"
              >
                You wrote notes on {unreadNotes} of these trades.{' '}
                <span className="text-accent underline">Let it read them</span> for a better answer.
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          {/* A reading column, not the panel's full width: at 1,300px a line of answer ran past 200
              characters, and nobody reads a line that long. */}
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 pt-3.5 lg:gap-[18px] lg:px-7 lg:pb-2 lg:pt-[18px]">
            {messages.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className="flex justify-end animate-msg-in">
                  <p className="max-w-[80%] whitespace-pre-wrap rounded-[18px_18px_4px_18px] border border-border bg-[#1e1e1e] px-3.5 py-[9px] text-[15px] leading-snug text-text-primary lg:max-w-[70%] lg:rounded-[16px_16px_4px_16px] lg:py-2.5 lg:text-sm">
                    {m.content}
                  </p>
                </div>
              ) : (
                <div key={i} className="animate-msg-in">
                  <Answer message={m} copied={copied === i} onCopy={() => void copy(m.content, i)} />
                  {i === lastAnswer && !busy && followUps.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2 lg:mt-2.5 lg:pl-10">
                      {followUps.map((s, j) => (
                        <Chip key={s.id} onClick={() => chat.ask(s.question, s.label)} className={j >= 2 ? 'max-lg:hidden' : ''}>
                          {s.label}
                        </Chip>
                      ))}
                    </div>
                  )}
                </div>
              ),
            )}

            {busy && (
              <div className="flex animate-msg-in gap-3">
                <span className="hidden lg:block">
                  <TcAvatar size="sm" />
                </span>
                {streaming ? (
                  <div className="min-w-0 flex-1 rounded-[4px_18px_18px_18px] border border-white/[0.07] bg-bg-card p-3.5 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:pt-0.5">
                    <AnswerBody answer={streaming} size="md" />
                  </div>
                ) : (
                  <TypingDots />
                )}
              </div>
            )}
            {/* Where "the end" is, held clear of the phone's floating message box. */}
            <div ref={endRef} className="h-px scroll-mb-28 lg:scroll-mb-0" />
          </div>
        </div>
      )}

      {/* ── The box to type in: pinned to the foot of the screen on a phone, of the column on a desktop ── */}
      {facts && (
        <div className="sticky z-10 mt-auto shrink-0 bg-bg-primary pb-2.5 pt-3 max-md:-bottom-2 md:bottom-0 lg:static lg:bg-transparent lg:px-7 lg:pb-3 lg:pt-2">
          {error && (
            <div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-400/25 bg-amber-400/5 px-2.5 py-2">
              <p className="flex-1 text-xs leading-relaxed text-amber-400">{error}</p>
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={chat.retryLast}
                  className="inline-flex shrink-0 items-center gap-1 rounded text-xs font-medium text-amber-400 hover:text-amber-300 focus-ring"
                >
                  <RotateCcw size={11} />
                  Retry
                </button>
              )}
            </div>
          )}

          {chatLocked ? (
            <ChatUpgrade wanted={chat.wanted} />
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                // An empty box sends nothing; the button puts the cursor in it instead.
                if (input.trim()) chat.submit();
                else inputRef.current?.focus();
              }}
            >
              <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-bg-tertiary py-2 pl-3.5 pr-2 transition-[border-color] focus-within:border-accent/50 lg:items-end lg:rounded-[14px] lg:py-2.5 lg:pr-2.5">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter sends, Shift+Enter breaks the line. Skipped while the IME is composing, or
                    // typing in a language that uses one would send half a word.
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      chat.submit();
                    }
                  }}
                  rows={1}
                  maxLength={600}
                  placeholder={opening ? `Ask about ${noun}…` : `Ask a follow-up about ${noun}…`}
                  disabled={busy}
                  aria-label="Ask about your trading"
                  /* text-base below lg: iOS Safari zooms the page in on any input under 16px and
                     never zooms back out, which pushed the send button off the screen. */
                  className="min-w-0 flex-1 resize-none bg-transparent py-1.5 text-base text-text-primary placeholder:text-text-secondary/60 focus:outline-none disabled:opacity-60 lg:text-sm"
                />
                <button
                  type="submit"
                  disabled={busy}
                  aria-label="Send"
                  className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl bg-accent text-bg-primary transition-opacity focus-ring disabled:opacity-30 lg:h-9 lg:w-9 lg:rounded-[10px]"
                >
                  <ArrowUp size={16} strokeWidth={2.75} />
                </button>
              </div>
              <div className="mt-1.5 hidden justify-between gap-3 text-[11.5px] text-text-secondary/70 lg:flex">
                <span>Enter to send · Shift + Enter for a new line</span>
                {perDay > 0 && (
                  <span className={`tabular-nums ${left <= 5 ? 'text-amber-400' : ''}`}>
                    {left} {left === 1 ? 'question' : 'questions'} left today
                  </span>
                )}
              </div>
            </form>
          )}
        </div>
      )}
    </section>
  );
}

/** "From your journal · September 2026 · 26 trades" — what the answer saw, as it saw it. */
function SourceLine({ source }: { source?: AnswerSource }) {
  const trades = source ? `${source.trades} ${source.trades === 1 ? 'trade' : 'trades'}` : null;
  return (
    <p className="mt-2.5 text-[11.5px] text-text-secondary/70 lg:mt-2">
      From your journal
      {source && (
        <>
          {' · '}
          <span className="lg:hidden">{shortPeriodLabel(source.period)}</span>
          <span className="hidden lg:inline">{source.period}</span>
          {source.compare && <> vs {source.compare}</>} · {trades}
        </>
      )}
      {' · '}reviews only, no trade advice
    </p>
  );
}

function Answer({ message, copied, onCopy }: { message: ThreadMessage; copied: boolean; onCopy: () => void }) {
  return (
    <div className="flex gap-3 lg:max-w-[760px]">
      <span className="hidden lg:block">
        <TcAvatar size="sm" />
      </span>
      {/* A card of its own on a phone, where there is no avatar to say whose turn it is. */}
      <div className="min-w-0 flex-1 rounded-[4px_18px_18px_18px] border border-white/[0.07] bg-bg-card p-3.5 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:pt-0.5">
        <AnswerBody answer={message.content} size="md" />
        <SourceLine source={message.source} />
        {/* Copy only. The design also draws Pin and thumbs up/down; nothing here keeps a pin or
            records a rating, and a button that does nothing is worse than no button. */}
        <div className="mt-2 flex gap-1.5">
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-[9px] py-1 text-xs text-text-secondary transition-colors hover:text-text-primary focus-ring lg:rounded-[7px] lg:px-2 lg:py-[3px] lg:text-[11.5px]"
          >
            {copied ? <Check size={11} aria-hidden /> : <Copy size={11} aria-hidden />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Chip({
  children,
  onClick,
  disabled,
  className = '',
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full border border-border bg-bg-tertiary px-3 py-[7px] text-[13px] text-text-primary transition-colors hover:border-accent/50 hover:bg-accent/10 focus-ring disabled:opacity-50 lg:py-1.5 lg:text-[12.5px] ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * One opening finding, which asks about itself: a row on a phone (figure, sentence, Ask), a card
 * on a desktop (the figure large, the sentence, Ask about this). With the chat locked it names the
 * plan that answers it instead.
 */
function StartingPoint({
  finding,
  index,
  disabled,
  locked,
  onAsk,
}: {
  finding: Finding;
  index: number;
  disabled: boolean;
  locked: boolean;
  onAsk: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAsk}
      disabled={disabled}
      style={{ animationDelay: `${80 + index * 70}ms` }}
      className="grid grid-cols-[minmax(74px,auto)_1fr_auto] items-center gap-2.5 rounded-[14px] border border-white/[0.07] bg-bg-card p-3 text-left text-sm transition-colors animate-msg-in hover:border-accent/40 focus-ring disabled:opacity-50 lg:flex lg:flex-col lg:items-stretch lg:gap-1.5 lg:border-border lg:bg-bg-tertiary lg:p-3.5"
    >
      {finding.figure ? (
        <span className={`text-right font-extrabold tabular-nums lg:text-left lg:text-[22px] lg:leading-tight ${FIGURE_TONE[finding.tone]}`}>
          {finding.figure}
        </span>
      ) : (
        <span aria-hidden className="lg:hidden" />
      )}
      <span className={`leading-snug lg:flex-1 lg:text-[13px] lg:leading-[1.4] ${finding.figure ? 'lg:text-text-primary/90' : 'font-semibold'}`}>
        {finding.lead}
        <span className="hidden lg:inline">.</span>
      </span>
      <span className="text-[13px] font-semibold text-accent lg:text-[12.5px]">
        {locked ? (
          `Ask on ${CHAT_PLAN_NAME}`
        ) : (
          <>
            <span className="lg:hidden">Ask</span>
            <span className="hidden lg:inline">Ask about this</span>
          </>
        )}
      </span>
    </button>
  );
}

/**
 * The phone conversation's ⋯: the controls the desktop keeps in its header — Compare and the notes
 * opt-in — and deleting the conversation, which the desktop does from the history list.
 */
function ConversationMenu({ chat, disabled }: { chat: AssistantChat; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { activeId, deleteThread, startNew } = useAssistantThreads();
  const { periods, scope, compareScope, setCompareScope, shareNotes, setShareNotes } = chat;
  useEscapeToClose(() => setOpen(false), open);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('touchstart', away);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('touchstart', away);
    };
  }, [open]);

  const others = periods.filter((p) => p.scope !== scope);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Conversation options"
        className={iconButton}
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Conversation options"
          className="absolute right-0 top-full z-30 mt-2 w-64 rounded-xl border border-border bg-bg-secondary p-1.5 shadow-2xl shadow-black/60"
        >
          <div className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-sm">
            <span>Read my trade notes</span>
            <NotesSwitch on={shareNotes} onChange={setShareNotes} />
          </div>
          {others.length > 0 && (
            <label className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-sm">
              <span>Compare with</span>
              <select
                value={compareScope ?? ''}
                onChange={(e) => setCompareScope((e.target.value || null) as AssistantScope | null)}
                aria-label="Compare against another period"
                /* 16px so iOS Safari does not zoom in when the picker opens. */
                className="max-w-[9rem] cursor-pointer bg-transparent text-right text-base text-text-primary focus:outline-none"
              >
                <option value="" className="bg-bg-secondary">Nothing</option>
                {others.map((p) => (
                  <option key={p.scope} value={p.scope} className="bg-bg-secondary">
                    {shortPeriodLabel(p.label)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="my-1 h-px bg-white/[0.06]" />
          <button
            type="button"
            disabled={disabled || !activeId}
            onClick={() => {
              if (activeId) deleteThread(activeId);
              startNew();
              setOpen(false);
            }}
            className="w-full rounded-lg px-2.5 py-2 text-left text-sm text-loss-bright transition-colors hover:bg-loss/10 focus-ring disabled:opacity-50"
          >
            Delete conversation
          </button>
        </div>
      )}
    </div>
  );
}
