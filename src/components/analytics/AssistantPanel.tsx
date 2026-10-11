import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, ArrowUp, Check, Copy, GitCompare, Lock, RotateCcw, Sparkles, SquarePen } from 'lucide-react';
import type { Trade } from '../../types';
import type { TradingRules } from '../../types/strategy';
import { openingFindings, type Finding } from '../../utils/assistantOpening';
import { buildJournalFacts, suggestedQuestions } from '../../utils/journalFacts';
import { AssistantError, streamAssistant, type AssistantMessage } from '../../services/aiAssistant';
import { useAssistantThreads } from '../../hooks/useAssistantThreads';
import { useEntitlement } from '../../context/useEntitlement';
import { AnswerBody } from './AnswerBody';
import { SegmentedControl } from '../ui/SegmentedControl';
import { lowestTierWith, TIER_PLANS } from '../../config/tiers';
import { goToPricing } from '../../utils/navigateToPath';

export type AssistantScope = 'month' | 'year' | 'all';

export interface AssistantPeriod {
  scope: AssistantScope;
  label: string;
  trades: Trade[];
}

interface AssistantPanelProps {
  /** One entry per period the trader can ask about, in the order they should appear. */
  periods: AssistantPeriod[];
  /** The trader's own configured risk limits, so it can report breaches of their rules. */
  /* The whole rules object. The subset declared here before had no maxConsecutiveLosses, so a
     stop-after-N-losers rule never reached the model even when the trader had set one. */
  rules?: TradingRules;
  /** Drops the card chrome when the dock already provides a frame and a title bar. */
  bare?: boolean;
  /**
   * Where this is being rendered.
   *
   * 'page' drops the panel's own title block, because the Assistant tab draws a bigger one above
   * it along with the thread list — two headings stacked is how a hosted panel announces it was
   * bolted on. Everything else about the panel is the same on both surfaces, deliberately: the
   * dock and the tab are the same assistant reading the same conversations.
   */
  layout?: 'dock' | 'page';
  /**
   * The opening screen without the chat: a plan that has the Performance screen but not the
   * assistant (Silver). The findings and suggested questions are computed here in the browser —
   * no model call, no cost — so they are shown for real, and asking anything opens the upgrade
   * instead of sending. Saved conversations are not shown; continuing one is the paid part.
   */
  chatLocked?: boolean;
}

/** Max height for the textarea before it starts scrolling instead of growing. */
const MAX_INPUT_HEIGHT = 116;

/** Remembers the notes opt-in per browser. Off unless the trader turns it on. */
const NOTES_OPT_IN_KEY = 'trend-chasers-assistant-share-notes';

function readNotesOptIn(): boolean {
  try {
    return localStorage.getItem(NOTES_OPT_IN_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * The journal assistant.
 *
 * Opens with questions generated from the trader's own data rather than an empty input, because a
 * blank box asks the user to already know what's interesting in their history — which is the thing
 * they came here to find out. Chat is the second layer, for the follow-up the chips can't predict.
 *
 * Every number it sees is computed by the app first (see utils/journalFacts.ts), so its answers
 * cannot disagree with the dashboard sitting above it.
 */
export function AssistantPanel({ periods, rules, bare = false, layout = 'dock', chatLocked = false }: AssistantPanelProps) {
  const { messages: savedMessages, append, rollbackTo, startNew } = useAssistantThreads();
  const messages = useMemo(() => (chatLocked ? [] : savedMessages), [chatLocked, savedMessages]);
  /** What a locked-chat reader tried to ask, so the upgrade prompt can name it. */
  const [wanted, setWanted] = useState<string | null>(null);
  const { limits, noteUsage } = useEntitlement();
  /*
   * The period opens on the narrowest one that has trades in it, not always on the first.
   *
   * It always opened on this month, and on the first days of a month — or any month not traded
   * yet — that is an empty period: the screen said "no trades in this period" over a journal with
   * hundreds in it, and showed none of the findings that are the point of opening it. Derived
   * rather than chosen once at mount, because the trades can still be loading when the screen
   * opens; once somebody picks a period themselves, their choice stands.
   */
  const [chosenScope, setScope] = useState<AssistantScope | null>(null);
  const scope: AssistantScope =
    chosenScope ?? periods.find((p) => p.trades.length > 0)?.scope ?? periods[0]?.scope ?? 'month';
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [shareNotes, setShareNotes] = useState(readNotesOptIn);
  const [compareScope, setCompareScope] = useState<AssistantScope | null>(null);
  /** The answer as it arrives, before it's committed to the thread. */
  const [streaming, setStreaming] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const active = periods.find((p) => p.scope === scope) ?? periods[0];
  const compare = compareScope ? periods.find((p) => p.scope === compareScope) ?? null : null;

  const facts = useMemo(
    () =>
      active
        ? buildJournalFacts(active.trades, active.label, {
            includeNotes: shareNotes,
            rules,
            // The widest period the trader has, so the trend spans more than what they are viewing.
            history: periods[periods.length - 1]?.trades,
          })
        : null,
    [active, shareNotes, rules, periods],
  );

  const compareFacts = useMemo(
    () =>
      compare
        ? buildJournalFacts(compare.trades, compare.label, { includeNotes: shareNotes, rules })
        : null,
    [compare, shareNotes, rules],
  );
  const suggestions = useMemo(() => (facts ? suggestedQuestions(facts) : []), [facts]);

  // Grow the box with the text, up to a ceiling. Measuring against a reset height is what keeps it
  // shrinking again when the user deletes a line.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }, [input]);

  const scrollToEnd = () => {
    requestAnimationFrame(() =>
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }),
    );
  };

  /*
   * What the panel says before anybody types.
   *
   * Computed locally rather than asked of the model: opening a screen must not spend a message
   * from the daily allowance, wait on a network call, or be able to invent a figure. Capped at
   * three because a wall of findings is the same problem as a blank box — nothing to act on.
   */
  const findings = useMemo(() => (facts ? openingFindings(facts).slice(0, 3) : []), [facts]);

  /* Only worth offering when there is actually something to read. Asking permission for notes
     that do not exist is a privacy prompt with no upside. */
  const unreadNotes = useMemo(
    () => (shareNotes ? 0 : (active?.trades.filter((t) => t.notes?.trim()).length ?? 0)),
    [shareNotes, active],
  );

  useEffect(scrollToEnd, [messages.length, busy, streaming]);

  const send = async (question: string) => {
    if (!facts || busy) return;
    const historyLength = messages.length;
    const history: AssistantMessage[] = messages.map((m) => ({ role: m.role, content: m.content }));

    setError(null);
    setBusy(true);
    setInput('');
    setStreaming('');
    append([{ role: 'user', content: question }]);

    try {
      // Accumulated locally rather than via setStreaming(prev => ...) so the committed answer can
      // never disagree with what was on screen if a render is dropped mid-stream.
      let text = '';
      const reply = await streamAssistant(
        question,
        facts,
        history,
        (token) => {
          text += token;
          setStreaming(text);
        },
        { compareFacts },
      );
      append([{ role: 'assistant', content: reply.answer }]);
      setRemaining(reply.remaining);
      // Keeps the sidebar meter honest without another round trip — the server has already
      // counted this message, so the number it hands back is the truth.
      noteUsage({
        aiMessagesUsed: Math.max(0, limits.aiMessagesPerDay - (reply.remaining - reply.credits)),
        aiMessagesRemaining: reply.remaining,
        aiCredits: reply.credits,
      });
    } catch (err) {
      // Take the optimistic user turn back out and return the text to the box, so a failed send
      // costs nothing but the wait.
      rollbackTo(historyLength);
      setInput(question);
      setError(err instanceof AssistantError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setStreaming('');
      setBusy(false);
    }
  };

  /** A finding or a suggested question was clicked: ask it, or — with the chat locked — say where it can be asked. */
  const ask = (question: string, label: string) => {
    if (chatLocked) setWanted(label);
    else void send(question);
  };

  const retryLast = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUser) void send(lastUser.content);
  };

  const copyAnswer = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(index);
      setTimeout(() => setCopied((c) => (c === index ? null : c)), 1600);
    } catch {
      // Clipboard blocked — silently skip rather than throwing an error at someone for a nicety.
    }
  };

  const page = layout === 'page';
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
      <div className={`shrink-0 ${page ? 'pb-3 border-b border-border/40' : 'px-1 pb-2.5'}`}>
        {layout === 'dock' && (
          <div className="flex items-start justify-between gap-2 mb-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <AssistantAvatar size="sm" />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-text-primary leading-tight">
                  Ask about your trading
                </h3>
                <p className="text-[10px] text-text-secondary mt-0.5">
                  Reads your stats · no trade advice
                </p>
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
        )}

        {/*
          One row of controls, all the same height and shape: the period, what to compare it with,
          and whether it may read the notes. They were a full-width tab strip — three tabs ~430px
          wide each on a desktop — over a line of ten-point text with a bare <select> and a
          checkbox in it, which is most of why the screen read as a settings form.
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
              onChange={(e) => {
                setShareNotes(e.target.checked);
                try {
                  localStorage.setItem(NOTES_OPT_IN_KEY, e.target.checked ? '1' : '0');
                } catch {
                  // Preference just won't persist; the session still honours it.
                }
              }}
              className="sr-only"
            />
            <Lock size={12} className="shrink-0" aria-hidden />
            {shareNotes ? 'Reading your trade notes' : 'Let it read my trade notes'}
          </label>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        className={`flex-1 min-h-0 overflow-y-auto ${page ? 'px-2' : 'px-1'} ${bare || page ? '' : 'max-h-[340px]'}`}
      >
        {/* On the page, the conversation is a reading column rather than the panel's full width:
            at 1,300px a line of answer ran past 200 characters, and nobody reads a line that long. */}
        <div className={page ? 'mx-auto w-full max-w-3xl' : ''}>
          {messages.length === 0 ? (
            <div className={page ? 'pt-4 pb-6 md:pt-8' : 'py-1'}>
              {page ? (
                <div className="text-center mb-5 md:mb-7 animate-msg-in">
                  <AssistantAvatar size="lg" />
                  <h2 className="mt-3 md:mt-4 text-lg md:text-2xl font-semibold tracking-tight text-text-primary">
                    What do you want to know about {active?.label}?
                  </h2>
                  <p className="mt-1.5 text-sm text-text-secondary">
                    {facts.tradeCount} {facts.tradeCount === 1 ? 'trade' : 'trades'}
                    {compare && <> · compared with {compare.label}</>} · figures straight from your
                    journal, never trade advice
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-text-secondary mb-2">
                  Reviewing <span className="text-text-primary font-medium">{active?.label}</span>
                  {compare && (
                    <>
                      {' '}vs <span className="text-text-primary font-medium">{compare.label}</span>
                    </>
                  )}{' '}
                  — {facts.tradeCount} {facts.tradeCount === 1 ? 'trade' : 'trades'}.
                </p>
              )}

              {findings.length > 0 && (
                <>
                  {page && <SectionLabel>What stands out</SectionLabel>}
                  <div className={page ? 'grid gap-2.5 md:grid-cols-3 mb-6' : 'space-y-2 mb-3'}>
                    {findings.map((f, i) => (
                      <FindingCard
                        key={f.headline}
                        finding={f}
                        large={page}
                        index={i}
                        disabled={busy}
                        askLabel={chatLocked ? `Ask on ${CHAT_PLAN_NAME}` : undefined}
                        onAsk={() => ask(f.question, f.headline)}
                      />
                    ))}
                  </div>
                </>
              )}

              {!chatLocked && unreadNotes > 0 && (
                /* Surfaced where somebody is actually looking, and only when it would change the
                   answer. The toggle in the control row is easy to miss. */
                <button
                  type="button"
                  onClick={() => setShareNotes(true)}
                  className={`w-full text-left text-[11px] text-text-secondary hover:text-accent transition-colors px-1 focus-ring rounded ${
                    page ? 'mb-6' : 'mb-3'
                  }`}
                >
                  You wrote notes on {unreadNotes} of these trades.{' '}
                  <span className="text-accent underline">Let it read them</span> for a better answer.
                </button>
              )}

              {page ? <SectionLabel>Or ask</SectionLabel> : <p className="text-[11px] text-text-secondary mb-2">Or ask:</p>}
              <div className={page ? 'flex flex-wrap gap-2' : 'flex flex-col gap-1.5'}>
                {suggestions.map((s) =>
                  page ? (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => ask(s.question, s.label)}
                      disabled={busy}
                      className="rounded-full border border-border/60 bg-bg-tertiary/40 px-3.5 py-2 text-[13px] text-text-secondary transition-colors hover:border-accent/50 hover:bg-accent/10 hover:text-text-primary focus-ring disabled:opacity-50"
                    >
                      {s.label}
                    </button>
                  ) : (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => ask(s.question, s.label)}
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
                  ),
                )}
              </div>
            </div>
          ) : (
            <div className={page ? 'space-y-6 py-6' : 'space-y-3 py-1'}>
              {messages.map((m, i) =>
                m.role === 'user' ? (
                  <div key={i} className="flex justify-end animate-msg-in">
                    <p
                      className={`max-w-[85%] rounded-2xl rounded-br-md bg-accent/15 border border-accent/25 text-text-primary leading-relaxed whitespace-pre-wrap ${
                        page ? 'px-4 py-2.5 text-sm' : 'px-3 py-2 text-[13px]'
                      }`}
                    >
                      {m.content}
                    </p>
                  </div>
                ) : (
                  <div key={i} className={`group flex animate-msg-in ${page ? 'gap-3' : 'gap-2'}`}>
                    <AssistantAvatar size={page ? 'md' : 'xs'} />
                    <div className="min-w-0 flex-1">
                      <AnswerBody answer={m.content} size={page ? 'md' : 'sm'} />
                      <button
                        type="button"
                        onClick={() => void copyAnswer(m.content, i)}
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
                <div className={`flex animate-msg-in ${page ? 'gap-3' : 'gap-2'}`}>
                  <AssistantAvatar size={page ? 'md' : 'xs'} />
                  {streaming ? (
                    <div className="min-w-0 flex-1">
                      <AnswerBody answer={streaming} size={page ? 'md' : 'sm'} />
                    </div>
                  ) : (
                    <span className="flex items-center gap-1 pt-2" aria-label="Thinking">
                      {[0, 1, 2].map((dot) => (
                        <span
                          key={dot}
                          className="typing-dot h-1.5 w-1.5 rounded-full bg-accent/70"
                          style={{ animationDelay: `${dot * 160}ms` }}
                        />
                      ))}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className={`shrink-0 ${page ? 'mx-auto w-full max-w-3xl' : ''}`}>
        {error && (
          <div className="shrink-0 mx-1 mt-2 flex items-start gap-2 rounded-lg border border-amber-400/25 bg-amber-400/5 px-2.5 py-2">
            <p className="flex-1 text-[11px] text-amber-400 leading-relaxed">{error}</p>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={retryLast}
                className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-amber-400 hover:text-amber-300 focus-ring rounded"
              >
                <RotateCcw size={11} />
                Retry
              </button>
            )}
          </div>
        )}

        {chatLocked ? (
          <ChatUpgrade wanted={wanted} page={page} />
        ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) void send(input.trim());
          }}
          className={`shrink-0 ${page ? 'pt-3' : 'mt-2 px-1'}`}
        >
          <div
            className={`flex items-end gap-2 rounded-2xl border border-border/60 bg-bg-tertiary/40 transition-[border-color,box-shadow] focus-within:border-accent/50 ${
              page ? 'p-2 shadow-lg shadow-black/25 focus-within:ring-4 focus-within:ring-accent/10' : 'p-1.5'
            }`}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends, Shift+Enter breaks the line. Skipped while the IME is composing, or
                // typing in a language that uses one would send half a word.
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  if (input.trim()) void send(input.trim());
                }
              }}
              rows={1}
              maxLength={600}
              placeholder={messages.length === 0 ? `Ask anything about ${active?.label ?? 'your trading'}…` : 'Ask a follow-up…'}
              disabled={busy}
              aria-label="Ask about your trading"
              /* text-base, not text-xs: iOS Safari zooms the page in on any input under 16px and
                 never zooms back out, which pushed the send button off the screen. */
              className={`min-w-0 flex-1 resize-none bg-transparent text-base text-text-primary placeholder:text-text-secondary/60 focus:outline-none disabled:opacity-60 ${
                page ? 'px-2.5 py-2 md:text-[15px]' : 'px-2 py-1.5 md:text-[13px]'
              }`}
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send"
              className={`grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-profit-bright to-accent text-bg-primary transition-opacity disabled:opacity-30 focus-ring ${
                page ? 'h-9 w-9' : 'h-8 w-8'
              }`}
            >
              <ArrowUp size={page ? 16 : 15} strokeWidth={2.5} />
            </button>
          </div>
          {page && (
            <div className="mt-2 flex items-center justify-between gap-3 px-1 text-[11px] text-text-secondary/70">
              <span>Enter to send · Shift + Enter for a new line</span>
              {remaining !== null && (
                <span className={`tabular-nums ${remaining <= 5 ? 'text-amber-400' : ''}`}>
                  {remaining} {remaining === 1 ? 'question' : 'questions'} left today
                </span>
              )}
            </div>
          )}
        </form>
        )}
      </div>
    </div>
  );
}

/** The plan the chat comes with, read from the plans so the prompt cannot name the wrong one. */
const CHAT_PLAN = lowestTierWith('aiAssistant');
const CHAT_PLAN_NAME = CHAT_PLAN ? TIER_PLANS[CHAT_PLAN].name : 'a higher plan';

/**
 * Where the message box goes when the chat is not on this plan.
 *
 * Says what the box would do and what it costs, and — once somebody has clicked a finding or a
 * question — names the thing they just tried to ask. "Ask about 'Your bigger positions are the
 * losing ones' on Gold" is an offer about their own trading; a padlock is a wall.
 */
function ChatUpgrade({ wanted, page }: { wanted: string | null; page: boolean }) {
  const plan = CHAT_PLAN ? TIER_PLANS[CHAT_PLAN] : null;
  return (
    <div className={`shrink-0 ${page ? 'pt-3' : 'mt-2 px-1'}`}>
      <div
        key={wanted ?? 'idle'}
        className={`flex flex-wrap items-center gap-3 rounded-2xl border border-accent/30 bg-accent/[0.06] p-3 ${
          page ? 'md:p-4' : ''
        } ${wanted ? 'animate-msg-in' : ''}`}
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent" aria-hidden>
          <Lock size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text-primary leading-snug">
            {wanted ? <>Ask about &ldquo;{wanted}&rdquo; on {CHAT_PLAN_NAME}</> : <>Ask follow-up questions on {CHAT_PLAN_NAME}</>}
          </p>
          {plan && (
            <p className="mt-0.5 text-xs text-text-secondary">
              {plan.limits.aiMessagesPerDay} questions a day about your own trades · from ${plan.price}/month
            </p>
          )}
        </div>
        {/* Its own row on a phone (and in the 400px dock): beside the text it squeezed the offer
            into four lines of two words each. */}
        <button type="button" onClick={goToPricing} className="btn-primary w-full sm:w-auto px-4 py-2 text-sm shrink-0 focus-ring">
          Upgrade to {CHAT_PLAN_NAME}
        </button>
      </div>
    </div>
  );
}

/** The assistant's mark: the same sparkle everywhere it speaks, sized to where it is speaking. */
function AssistantAvatar({ size }: { size: 'xs' | 'sm' | 'md' | 'lg' }) {
  const box = {
    xs: 'h-5 w-5 rounded-md mt-0.5',
    sm: 'h-6 w-6 rounded-lg',
    md: 'h-8 w-8 rounded-xl',
    lg: 'h-12 w-12 rounded-2xl mx-auto shadow-lg shadow-accent/20',
  }[size];
  const icon = { xs: 11, sm: 13, md: 15, lg: 22 }[size];
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center bg-gradient-to-br from-profit-bright/25 to-accent/25 text-accent ring-1 ring-accent/25 ${box}`}
    >
      <Sparkles size={icon} />
    </span>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2.5 px-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-secondary/70">
      {children}
    </p>
  );
}

const TONE: Record<Finding['tone'], { label: string; dot: string; text: string; card: string }> = {
  bad: {
    label: 'Worth fixing',
    dot: 'bg-loss-bright',
    text: 'text-loss-bright',
    card: 'border-loss-bright/25 bg-loss-bright/[0.04] hover:border-loss-bright/45',
  },
  good: {
    label: 'Working',
    dot: 'bg-profit-bright',
    text: 'text-profit-bright',
    card: 'border-profit-bright/25 bg-profit-bright/[0.04] hover:border-profit-bright/45',
  },
  neutral: {
    label: 'Worth a look',
    dot: 'bg-accent',
    text: 'text-accent',
    card: 'border-border/50 bg-bg-tertiary/25 hover:border-accent/45',
  },
};

/**
 * One opening finding, which asks about itself when clicked.
 *
 * On the page it is a card with its verdict named above the headline and an explicit "Ask about
 * this": the red full-width rows it replaced looked like error messages, and nothing on them said
 * they could be clicked. In the dock it stays the compact row.
 */
function FindingCard({
  finding,
  large,
  index,
  disabled,
  onAsk,
  askLabel = 'Ask about this',
}: {
  finding: Finding;
  large: boolean;
  index: number;
  disabled: boolean;
  onAsk: () => void;
  /** The card's call to action — the plan that answers it, when the chat is locked. */
  askLabel?: string;
}) {
  const tone = TONE[finding.tone];

  if (!large) {
    return (
      <button
        type="button"
        onClick={onAsk}
        disabled={disabled}
        className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors focus-ring disabled:opacity-50 ${tone.card}`}
      >
        <span className={`block text-xs font-semibold ${finding.tone === 'neutral' ? 'text-text-primary' : tone.text}`}>
          {finding.headline}
        </span>
        <span className="block text-[11px] text-text-secondary mt-1 leading-relaxed">{finding.detail}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onAsk}
      disabled={disabled}
      style={{ animationDelay: `${80 + index * 70}ms` }}
      className={`group flex h-full flex-col rounded-xl border p-3.5 text-left transition-colors focus-ring disabled:opacity-50 animate-msg-in ${tone.card}`}
    >
      <span className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${tone.text}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-hidden />
        {tone.label}
      </span>
      <span className="mt-2 block text-sm font-semibold leading-snug text-text-primary">{finding.headline}</span>
      <span className="mt-1.5 block text-xs leading-relaxed text-text-secondary">{finding.detail}</span>
      <span className="mt-auto pt-3 inline-flex items-center gap-1 text-xs font-medium text-accent">
        {askLabel}
        <ArrowRight size={12} className="transition-transform motion-safe:group-hover:translate-x-0.5" aria-hidden />
      </span>
    </button>
  );
}
