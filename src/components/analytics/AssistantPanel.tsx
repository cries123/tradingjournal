import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Check, Copy, GitCompare, Lock, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import type { Trade } from '../../types';
import { buildJournalFacts, suggestedQuestions } from '../../utils/journalFacts';
import { AssistantError, streamAssistant, type AssistantMessage } from '../../services/aiAssistant';
import { useAssistantThread } from '../../hooks/useAssistantThread';
import { useEntitlement } from '../../context/useEntitlement';
import { AnswerBody } from './AnswerBody';

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
  rules?: { enabled: boolean; maxDailyLoss?: number; maxTradesPerDay?: number; maxDailyGain?: number };
  /** Drops the card chrome when the dock already provides a frame and a title bar. */
  bare?: boolean;
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
export function AssistantPanel({ periods, rules, bare = false }: AssistantPanelProps) {
  const { messages, append, rollbackTo, clear } = useAssistantThread();
  const { limits, noteUsage } = useEntitlement();
  const [scope, setScope] = useState<AssistantScope>(periods[0]?.scope ?? 'month');
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
        ? buildJournalFacts(active.trades, active.label, { includeNotes: shareNotes, rules })
        : null,
    [active, shareNotes, rules],
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
        aiMessagesUsed: Math.max(0, limits.aiMessagesPerDay - reply.remaining),
        aiMessagesRemaining: reply.remaining,
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

  if (!facts) {
    return (
      <div className={bare ? 'p-4' : 'panel-card p-4 md:p-5'}>
        <div className="flex items-center gap-2 mb-1.5">
          <Sparkles size={15} className="text-accent" />
          <h3 className="text-sm font-semibold">Ask about your trading</h3>
        </div>
        <p className="text-xs text-text-secondary leading-relaxed">
          {periods.length > 1
            ? 'No trades in this period yet. Log a few, or switch period above, and the assistant can review them with you.'
            : 'Log a few trades and the assistant can review them with you.'}
        </p>
        {periods.length > 1 && (
          <PeriodTabs periods={periods} scope={scope} onChange={setScope} className="mt-3" />
        )}
      </div>
    );
  }

  return (
    <div className={bare ? 'flex flex-col h-full min-h-0' : 'panel-card p-3 md:p-4 flex flex-col'}>
      <div className="shrink-0 px-1 pb-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent">
              <Sparkles size={13} />
            </span>
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
            {messages.length > 0 && (
              <button
                type="button"
                onClick={clear}
                aria-label="Clear conversation"
                title="Clear conversation"
                className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60 transition-colors focus-ring"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>

        {periods.length > 1 && (
          <PeriodTabs periods={periods} scope={scope} onChange={setScope} className="mt-2.5" />
        )}

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {periods.length > 1 && (
            <label className="flex items-center gap-1.5 text-[10px] text-text-secondary">
              <GitCompare size={11} className="shrink-0" />
              <span>Compare to</span>
              <select
                value={compareScope ?? ''}
                onChange={(e) => setCompareScope((e.target.value || null) as AssistantScope | null)}
                className="rounded border border-border/60 bg-bg-tertiary/50 px-1.5 py-0.5 text-[10px] text-text-primary focus-ring"
                aria-label="Compare against another period"
              >
                <option value="">nothing</option>
                {periods
                  .filter((p) => p.scope !== scope)
                  .map((p) => (
                    <option key={p.scope} value={p.scope}>
                      {p.label}
                    </option>
                  ))}
              </select>
            </label>
          )}

          {/* Notes are the trader's own words, so sharing them with the model is their decision to
              make rather than a default the app picks for them. */}
          <label className="flex items-center gap-1.5 text-[10px] text-text-secondary cursor-pointer">
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
              className="h-3 w-3 accent-[color:var(--color-accent)]"
            />
            <Lock size={10} className="shrink-0" />
            Let it read my trade notes
          </label>
        </div>
      </div>

      <div
        ref={scrollRef}
        className={`flex-1 min-h-0 overflow-y-auto px-1 ${bare ? '' : 'max-h-[340px]'}`}
      >
        {messages.length === 0 ? (
          <div className="py-1">
            <p className="text-[11px] text-text-secondary mb-2">
              Reviewing <span className="text-text-primary font-medium">{active?.label}</span>
              {compare && (
                <>
                  {' '}vs <span className="text-text-primary font-medium">{compare.label}</span>
                </>
              )}{' '}
              — {facts.tradeCount} {facts.tradeCount === 1 ? 'trade' : 'trades'}. Start here:
            </p>
            <div className="flex flex-col gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => void send(s.question)}
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
                <div key={i} className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-md bg-accent/15 border border-accent/25 px-3 py-2 text-[13px] leading-relaxed text-text-primary">
                    {m.content}
                  </p>
                </div>
              ) : (
                <div key={i} className="group flex gap-2">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-accent/15 text-accent">
                    <Sparkles size={11} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <AnswerBody answer={m.content} />
                    <button
                      type="button"
                      onClick={() => void copyAnswer(m.content, i)}
                      className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-text-secondary/60 hover:text-text-primary transition-colors focus-ring rounded md:opacity-0 md:group-hover:opacity-100"
                    >
                      {copied === i ? <Check size={10} /> : <Copy size={10} />}
                      {copied === i ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              ),
            )}

            {busy && (
              <div className="flex gap-2">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-accent/15 text-accent">
                  <Sparkles size={11} />
                </span>
                {streaming ? (
                  <div className="min-w-0 flex-1">
                    <AnswerBody answer={streaming} />
                  </div>
                ) : (
                  <span className="flex items-center gap-1 pt-1" aria-label="Thinking">
                    {[0, 150, 300].map((delay) => (
                      <span
                        key={delay}
                        className="h-1.5 w-1.5 rounded-full bg-accent/70 motion-safe:animate-pulse"
                        style={{ animationDelay: `${delay}ms` }}
                      />
                    ))}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

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

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim()) void send(input.trim());
        }}
        className="shrink-0 mt-2 px-1"
      >
        <div className="flex items-end gap-2 rounded-2xl border border-border/60 bg-bg-tertiary/40 p-1.5 transition-colors focus-within:border-accent/40">
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
            placeholder="Ask a follow-up…"
            disabled={busy}
            aria-label="Ask about your trading"
            /* text-base, not text-xs: iOS Safari zooms the page in on any input under 16px and
               never zooms back out, which pushed the send button off the screen. */
            className="min-w-0 flex-1 resize-none bg-transparent px-2 py-1.5 text-base md:text-[13px] text-text-primary placeholder:text-text-secondary/60 focus:outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Send"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-accent text-bg-primary transition-opacity disabled:opacity-30 focus-ring"
          >
            <ArrowUp size={15} strokeWidth={2.5} />
          </button>
        </div>
      </form>
    </div>
  );
}

function PeriodTabs({
  periods,
  scope,
  onChange,
  className = '',
}: {
  periods: AssistantPeriod[];
  scope: AssistantScope;
  onChange: (scope: AssistantScope) => void;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-0.5 rounded-lg bg-bg-tertiary/50 p-0.5 ${className}`}>
      {periods.map((p) => (
        <button
          key={p.scope}
          type="button"
          onClick={() => onChange(p.scope)}
          aria-pressed={p.scope === scope}
          className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors focus-ring ${
            p.scope === scope
              ? 'bg-bg-secondary text-text-primary shadow-sm'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
