import { useMemo, useRef, useState } from 'react';
import { ArrowUp, Sparkles } from 'lucide-react';
import type { Trade } from '../../types';
import { buildJournalFacts, suggestedQuestions } from '../../utils/journalFacts';
import { askAssistant, AssistantError, type AssistantMessage } from '../../services/aiAssistant';

interface AssistantPanelProps {
  trades: Trade[];
  periodLabel: string;
  /** Drops the card chrome when the dock already provides a frame and a title bar. */
  bare?: boolean;
}

/**
 * The journal assistant.
 *
 * Opens with questions generated from the trader's own data rather than an empty input, because a
 * blank box asks the user to already know what's interesting in their history — which is the thing
 * they came here to find out. Chat is the second layer, for the follow-up the chips can't predict.
 *
 * Every number the assistant sees is computed by the app first (see utils/journalFacts.ts), so its
 * answers can't disagree with the dashboard sitting above it.
 */
export function AssistantPanel({ trades, periodLabel, bare = false }: AssistantPanelProps) {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const facts = useMemo(() => buildJournalFacts(trades, periodLabel), [trades, periodLabel]);
  const suggestions = useMemo(() => (facts ? suggestedQuestions(facts) : []), [facts]);

  const send = async (question: string) => {
    if (!facts || busy) return;
    setError(null);
    setBusy(true);
    const nextHistory: AssistantMessage[] = [...messages, { role: 'user', content: question }];
    setMessages(nextHistory);
    setInput('');

    try {
      const reply = await askAssistant(question, facts, messages);
      setMessages([...nextHistory, { role: 'assistant', content: reply.answer }]);
      setRemaining(reply.remaining);
    } catch (err) {
      // Drop the optimistic user message back into the box so a failed send doesn't lose it.
      setMessages(messages);
      setInput(question);
      setError(err instanceof AssistantError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }));
    }
  };

  const shell = bare ? 'flex flex-col h-full' : 'panel-card p-3 md:p-4 flex flex-col';

  if (!facts) {
    return (
      <div className={bare ? 'p-2' : 'panel-card p-4 md:p-5'}>
        <div className="flex items-center gap-2 mb-1.5">
          <Sparkles size={15} className="text-accent" />
          <h3 className="text-sm font-semibold">Ask about your trading</h3>
        </div>
        <p className="text-xs text-text-secondary">
          Log a few trades and the assistant can review them with you.
        </p>
      </div>
    );
  }

  return (
    <div className={shell}>
      <div className="flex items-start justify-between gap-2 mb-2.5 shrink-0 px-1">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-accent shrink-0" />
          <div>
            <h3 className="text-[10px] md:text-sm font-semibold text-text-primary">
              Ask about your trading
            </h3>
            <p className="text-[10px] text-text-secondary mt-0.5">
              Reviews {periodLabel} — it reads your stats, it doesn&apos;t give trade advice
            </p>
          </div>
        </div>
        {remaining !== null && remaining <= 5 && (
          <span className="text-[10px] text-amber-400 shrink-0">{remaining} left today</span>
        )}
      </div>

      {messages.length > 0 && (
        <div
          ref={scrollRef}
          className={`space-y-3 mb-3 pr-1 ${bare ? '' : 'max-h-[340px] overflow-y-auto'}`}
        >
          {messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === 'user'
                  ? 'ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-accent/15 border border-accent/25 px-3 py-2'
                  : 'max-w-[92%] rounded-2xl rounded-bl-sm bg-bg-tertiary/60 border border-border/40 px-3 py-2'
              }
            >
              <p className="text-xs leading-relaxed whitespace-pre-wrap text-text-primary">
                {m.content}
              </p>
            </div>
          ))}
          {busy && (
            <p className="text-xs text-text-secondary flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              Reading your stats…
            </p>
          )}
        </div>
      )}

      {messages.length === 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3 px-1">
          {suggestions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => void send(s.question)}
              disabled={busy}
              className="text-[11px] px-2.5 py-1.5 rounded-full border border-border/60 text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors focus-ring disabled:opacity-50"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-[11px] text-amber-400 mb-2 px-1">{error}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim()) void send(input.trim());
        }}
        className={`flex items-center gap-2 shrink-0 px-1 ${bare ? 'mt-auto pt-2' : ''}`}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={600}
          placeholder="Ask about a setup, a symbol, a losing streak…"
          className="input-field flex-1 py-2 text-xs"
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          aria-label="Send"
          className="shrink-0 w-8 h-8 rounded-lg bg-accent/15 border border-accent/30 text-accent flex items-center justify-center disabled:opacity-40 focus-ring"
        >
          <ArrowUp size={15} />
        </button>
      </form>
    </div>
  );
}
