import { useEffect, useRef } from 'react';
import { ArrowUp, Check, Copy, GitCompare, Lock, RotateCcw, Sparkles, SquarePen } from 'lucide-react';
import type { TradingRules } from '../../types/strategy';
import type { Finding } from '../../utils/assistantOpening';
import { useAssistantThreads } from '../../hooks/useAssistantThreads';
import { useAssistantChat, useCopied, type AssistantPeriod, type AssistantScope } from '../../hooks/useAssistantChat';
import { AnswerBody } from './AnswerBody';
import { ChatUpgrade, TypingDots } from './AssistantParts';
import { SegmentedControl } from '../ui/SegmentedControl';

export type { AssistantPeriod, AssistantScope } from '../../hooks/useAssistantChat';

interface AssistantPanelProps {
  /** One entry per period the trader can ask about, in the order they should appear. */
  periods: AssistantPeriod[];
  /** The trader's own configured risk limits, so it can report breaches of their rules. */
  rules?: TradingRules;
  /** Drops the card chrome when the dock already provides a frame and a title bar. */
  bare?: boolean;
  /** The opening findings without the chat, for a plan without the assistant — see useAssistantChat. */
  chatLocked?: boolean;
}

/** Max height for the textarea before it starts scrolling instead of growing. */
const MAX_INPUT_HEIGHT = 116;

/**
 * The journal assistant, in the dock: the 400px panel the Overview opens from its corner.
 *
 * Opens with findings and questions generated from the trader's own data rather than an empty
 * input, because a blank box asks the user to already know what's interesting in their history —
 * which is the thing they came here to find out. Chat is the second layer, for the follow-up the
 * chips can't predict.
 *
 * The Assistant page draws the same assistant across three columns (AssistantContent). Both read
 * their state from useAssistantChat and their conversations from useAssistantThreads, so a question
 * asked here is the conversation on the page afterwards.
 */
export function AssistantPanel({ periods, rules, bare = false, chatLocked = false }: AssistantPanelProps) {
  const chat = useAssistantChat({ periods, rules, chatLocked });
  const { startNew } = useAssistantThreads();
  const { copied, copy } = useCopied();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { scope, setScope, active, compare, compareScope, setCompareScope, facts, findings, suggestions } = chat;
  const { messages, busy, streaming, error, remaining, input, setInput, shareNotes, setShareNotes, unreadNotes } = chat;

  // Grow the box with the text, up to a ceiling. Measuring against a reset height is what keeps it
  // shrinking again when the user deletes a line.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }, [input]);

  useEffect(() => {
    requestAnimationFrame(() =>
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }),
    );
  }, [messages.length, busy, streaming]);

  const periodOptions = periods.map((p) => ({ id: p.scope, label: p.label }));

  if (!facts) {
    return (
      <div className={bare ? 'p-4' : 'panel-card p-4 md:p-5'}>
        <div className="flex items-center gap-2 mb-1.5">
          <Sparkles size={15} className="text-accent" />
          <h3 className="text-sm font-semibold">Ask about your trading</h3>
        </div>
        <p className="text-xs text-text-secondary leading-relaxed">
          {periods.length > 1
            ? `No trades in ${active?.label ?? 'this period'} yet. Pick a longer period below, or log a few, and the assistant can review them with you.`
            : 'Log a few trades and the assistant can review them with you.'}
        </p>
        {periods.length > 1 && (
          <div className="mt-3">
            <SegmentedControl label="Period" value={scope} onChange={setScope} options={periodOptions} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={bare ? 'flex flex-col h-full min-h-0' : 'panel-card p-3 md:p-4 flex flex-col'}>
      <div className="shrink-0 px-1 pb-2.5">
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <DockAvatar size="sm" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-text-primary leading-tight">Ask about your trading</h3>
              <p className="text-[10px] text-text-secondary mt-0.5">Reads your stats · no trade advice</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {remaining !== null && remaining <= 5 && (
              <span className="text-[10px] text-amber-400 tabular-nums">{remaining} left</span>
            )}
            {/* Starts a conversation rather than deleting one. The old control here was a bin
                that wiped the only thread there was; now that threads are kept, the thing
                somebody actually wants at this moment is a fresh one. */}
            {messages.length > 0 && (
              <button
                type="button"
                onClick={startNew}
                aria-label="New chat"
                title="New chat"
                className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60 transition-colors focus-ring"
              >
                <SquarePen size={13} />
              </button>
            )}
          </div>
        </div>

        {/*
          One row of controls, all the same height and shape: the period, what to compare it with,
          and whether it may read the notes.
        */}
        <div className="flex flex-wrap items-center gap-2">
          {periods.length > 1 && (
            <SegmentedControl label="Period" value={scope} onChange={setScope} options={periodOptions} />
          )}

          {/* Compare and notes change what the model is sent, so they only appear with the chat. */}
          {!chatLocked && periods.length > 1 && (
            <label
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                compareScope
                  ? 'border-accent/40 bg-accent/10 text-accent'
                  : 'border-border/50 bg-bg-tertiary/40 text-text-secondary hover:text-text-primary'
              }`}
            >
              <GitCompare size={13} className="shrink-0" aria-hidden />
              <span>Compare</span>
              <select
                value={compareScope ?? ''}
                onChange={(e) => setCompareScope((e.target.value || null) as AssistantScope | null)}
                className="bg-transparent text-xs font-medium text-text-primary cursor-pointer focus:outline-none"
                aria-label="Compare against another period"
              >
                <option value="" className="bg-bg-secondary">off</option>
                {periods
                  .filter((p) => p.scope !== scope)
                  .map((p) => (
                    <option key={p.scope} value={p.scope} className="bg-bg-secondary">
                      {p.label}
                    </option>
                  ))}
              </select>
            </label>
          )}

          {/* Notes are the trader's own words, so sharing them with the model is their decision to
              make rather than a default the app picks for them. */}
          {!chatLocked && (
            <label
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs cursor-pointer transition-colors ${
                shareNotes
                  ? 'border-accent/40 bg-accent/10 text-accent'
                  : 'border-border/50 bg-bg-tertiary/40 text-text-secondary hover:text-text-primary'
              }`}
            >
              <input
                type="checkbox"
                checked={shareNotes}
                onChange={(e) => setShareNotes(e.target.checked)}
                className="sr-only"
              />
              <Lock size={12} className="shrink-0" aria-hidden />
              {shareNotes ? 'Reading your trade notes' : 'Let it read my trade notes'}
            </label>
          )}
        </div>
      </div>

      <div ref={scrollRef} className={`flex-1 min-h-0 overflow-y-auto px-1 ${bare ? '' : 'max-h-[340px]'}`}>
        {messages.length === 0 ? (
          <div className="py-1">
            <p className="text-[11px] text-text-secondary mb-2">
              Reviewing <span className="text-text-primary font-medium">{active?.label}</span>
              {compare && (
                <>
                  {' '}vs <span className="text-text-primary font-medium">{compare.label}</span>
                </>
              )}{' '}
              — {facts.tradeCount} {facts.tradeCount === 1 ? 'trade' : 'trades'}.
            </p>

            {findings.length > 0 && (
              <div className="space-y-2 mb-3">
                {findings.map((f) => (
                  <DockFinding
                    key={f.headline}
                    finding={f}
                    disabled={busy}

                    onAsk={() => chat.ask(f.question, f.headline)}
                  />
                ))}
              </div>
            )}

            {!chatLocked && unreadNotes > 0 && (
              /* Surfaced where somebody is actually looking, and only when it would change the
                 answer. The toggle in the control row is easy to miss. */
              <button
                type="button"
                onClick={() => setShareNotes(true)}
                className="w-full text-left text-[11px] text-text-secondary hover:text-accent transition-colors px-1 focus-ring rounded mb-3"
              >
                You wrote notes on {unreadNotes} of these trades.{' '}
                <span className="text-accent underline">Let it read them</span> for a better answer.
              </button>
            )}

            <p className="text-[11px] text-text-secondary mb-2">Or ask:</p>
            <div className="flex flex-col gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => chat.ask(s.question, s.label)}
                  disabled={busy}
                  className="group flex items-center justify-between gap-2 rounded-xl border border-border/50 bg-bg-tertiary/25 px-3 py-2.5 text-left transition-colors hover:border-accent/40 hover:bg-bg-tertiary/50 focus-ring disabled:opacity-50"
                >
                  <span className="text-xs text-text-secondary group-hover:text-text-primary transition-colors">
                    {s.label}
                  </span>
                  <ArrowUp
                    size={12}
                    className="shrink-0 rotate-45 text-text-secondary/40 group-hover:text-accent transition-colors"
                  />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-1">
            {messages.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className="flex justify-end animate-msg-in">
                  <p className="max-w-[85%] rounded-2xl rounded-br-md bg-accent/15 border border-accent/25 text-text-primary leading-relaxed whitespace-pre-wrap px-3 py-2 text-[13px]">
                    {m.content}
                  </p>
                </div>
              ) : (
                <div key={i} className="group flex animate-msg-in gap-2">
                  <DockAvatar size="xs" />
                  <div className="min-w-0 flex-1">
                    <AnswerBody answer={m.content} size="sm" />
                    <button
                      type="button"
                      onClick={() => void copy(m.content, i)}
                      className="mt-2 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 -ml-1.5 text-[11px] text-text-secondary/70 hover:text-text-primary hover:bg-bg-tertiary/60 transition-colors focus-ring md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                    >
                      {copied === i ? <Check size={11} /> : <Copy size={11} />}
                      {copied === i ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              ),
            )}

            {busy && (
              <div className="flex animate-msg-in gap-2">
                <DockAvatar size="xs" />
                {streaming ? (
                  <div className="min-w-0 flex-1">
                    <AnswerBody answer={streaming} size="sm" />
                  </div>
                ) : (
                  <TypingDots />
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0">
        {error && (
          <div className="shrink-0 mx-1 mt-2 flex items-start gap-2 rounded-lg border border-amber-400/25 bg-amber-400/5 px-2.5 py-2">
            <p className="flex-1 text-[11px] text-amber-400 leading-relaxed">{error}</p>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={chat.retryLast}
                className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-amber-400 hover:text-amber-300 focus-ring rounded"
              >
                <RotateCcw size={11} />
                Retry
              </button>
            )}
          </div>
        )}

        {chatLocked ? (
          <ChatUpgrade wanted={chat.wanted} className="mt-2 px-1" />
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              chat.submit();
            }}
            className="shrink-0 mt-2 px-1"
          >
            <div className="flex items-end gap-2 rounded-2xl border border-border/60 bg-bg-tertiary/40 transition-[border-color,box-shadow] focus-within:border-accent/50 p-1.5">
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
                placeholder={messages.length === 0 ? `Ask anything about ${active?.label ?? 'your trading'}…` : 'Ask a follow-up…'}
                disabled={busy}
                aria-label="Ask about your trading"
                /* text-base, not text-xs: iOS Safari zooms the page in on any input under 16px and
                   never zooms back out, which pushed the send button off the screen. */
                className="min-w-0 flex-1 resize-none bg-transparent text-base text-text-primary placeholder:text-text-secondary/60 focus:outline-none disabled:opacity-60 px-2 py-1.5 md:text-[13px]"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                aria-label="Send"
                className="grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-profit-bright to-accent text-bg-primary transition-opacity disabled:opacity-30 focus-ring h-8 w-8"
              >
                <ArrowUp size={15} strokeWidth={2.5} />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}


/** The dock's mark: the sparkle it has always spoken with, sized to the panel. */
function DockAvatar({ size }: { size: 'xs' | 'sm' }) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center bg-gradient-to-br from-profit-bright/25 to-accent/25 text-accent ring-1 ring-accent/25 ${
        size === 'xs' ? 'h-5 w-5 rounded-md mt-0.5' : 'h-6 w-6 rounded-lg'
      }`}
    >
      <Sparkles size={size === 'xs' ? 11 : 13} />
    </span>
  );
}

const DOCK_TONE: Record<Finding['tone'], string> = {
  bad: 'border-loss-bright/25 bg-loss-bright/[0.04] hover:border-loss-bright/45',
  good: 'border-profit-bright/25 bg-profit-bright/[0.04] hover:border-profit-bright/45',
  neutral: 'border-border/50 bg-bg-tertiary/25 hover:border-accent/45',
};

/** One opening finding in the dock: a compact row that asks about itself when clicked. */
function DockFinding({
  finding,
  disabled,
  onAsk,
}: {
  finding: Finding;
  disabled: boolean;
  onAsk: () => void;
}) {
  const headline =
    finding.tone === 'bad' ? 'text-loss-bright' : finding.tone === 'good' ? 'text-profit-bright' : 'text-text-primary';
  return (
    <button
      type="button"
      onClick={onAsk}
      disabled={disabled}
      className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors focus-ring disabled:opacity-50 ${DOCK_TONE[finding.tone]}`}
    >
      <span className={`block text-xs font-semibold ${headline}`}>{finding.headline}</span>
      <span className="block text-[11px] text-text-secondary mt-1 leading-relaxed">{finding.detail}</span>

    </button>
  );
}
