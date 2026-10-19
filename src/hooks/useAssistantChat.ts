import { useCallback, useMemo, useState } from 'react';
import type { Trade } from '../types';
import type { TradingRules } from '../types/strategy';
import { openingFindings } from '../utils/assistantOpening';
import { buildJournalFacts, suggestedQuestions } from '../utils/journalFacts';
import { AssistantError, streamAssistant, type AssistantMessage } from '../services/aiAssistant';
import { useAssistantThreads } from './useAssistantThreads';
import { useEntitlement } from '../context/useEntitlement';
import { lowestTierWith, TIER_PLANS } from '../config/tiers';

/** The plan the chat comes with, read from the plans so no prompt can name the wrong one. */
const CHAT_PLAN = lowestTierWith('aiAssistant');
export const CHAT_PLAN_NAME = CHAT_PLAN ? TIER_PLANS[CHAT_PLAN].name : 'a higher plan';

export type AssistantScope = 'month' | 'year' | 'all';

export interface AssistantPeriod {
  scope: AssistantScope;
  label: string;
  trades: Trade[];
}

export interface AssistantChatOptions {
  /** One entry per period the trader can ask about, in the order they should appear. */
  periods: AssistantPeriod[];
  /* The whole rules object. The subset declared here before had no maxConsecutiveLosses, so a
     stop-after-N-losers rule never reached the model even when the trader had set one. */
  rules?: TradingRules;
  /**
   * The opening screen without the chat: a plan that has the Performance screen but not the
   * assistant (Silver). The findings and suggested questions are computed here in the browser —
   * no model call, no cost — so they are shown for real, and asking anything opens the upgrade
   * instead of sending. Saved conversations are not shown; continuing one is the paid part.
   */
  chatLocked?: boolean;
}

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
 * The assistant's state and its one way of asking, for whichever surface is drawing it.
 *
 * The dock and the Assistant page used to be one component with a `layout` switch through it.
 * The approved page spreads the conversation across three columns — the period and its figures in
 * the chat's header, what the assistant can see in a rail beside it, the starting points in both —
 * and a component that owned the period could not hand it to its neighbours. So the state lives
 * here and each surface draws it its own way. Everything that decides what is sent is still in one
 * place: the facts, the notes opt-in, Compare, the locked chat, the allowance.
 *
 * Every number it sees is computed by the app first (see utils/journalFacts.ts), so its answers
 * cannot disagree with the dashboard.
 */
export function useAssistantChat({ periods, rules, chatLocked = false }: AssistantChatOptions) {
  const { messages: savedMessages, append, rollbackTo } = useAssistantThreads();
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
  const [shareNotes, setShareNotesState] = useState(readNotesOptIn);
  const [compareScope, setCompareScope] = useState<AssistantScope | null>(null);
  /** The answer as it arrives, before it's committed to the thread. */
  const [streaming, setStreaming] = useState('');

  const active = periods.find((p) => p.scope === scope) ?? periods[0];
  const compare = compareScope && compareScope !== scope ? periods.find((p) => p.scope === compareScope) ?? null : null;

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

  /*
   * What the screen says before anybody types.
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

  /** Notes are the trader's own words, so sharing them is their decision, remembered per browser. */
  const setShareNotes = useCallback((on: boolean) => {
    setShareNotesState(on);
    try {
      localStorage.setItem(NOTES_OPT_IN_KEY, on ? '1' : '0');
    } catch {
      // Preference just won't persist; the session still honours it.
    }
  }, []);

  const send = async (question: string) => {
    if (!facts || busy || !active) return;
    const historyLength = messages.length;
    const history: AssistantMessage[] = messages.map((m) => ({ role: m.role, content: m.content }));
    // Taken now, not when the answer lands: the period is what this question was asked about.
    const source = {
      period: active.label,
      trades: facts.tradeCount,
      ...(compare ? { compare: compare.label } : {}),
    };

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
      append([{ role: 'assistant', content: reply.answer, source }]);
      setRemaining(reply.remaining);
      // Keeps the allowance meter honest without another round trip — the server has already
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

  /**
   * A finding, a suggested question or a follow-up was clicked: ask it, or — with the chat locked —
   * say where it can be asked. The one path every click goes through, so no surface can reach the
   * send without passing the lock.
   */
  const ask = (question: string, label: string) => {
    if (chatLocked) setWanted(label);
    else void send(question);
  };

  /** The composer's submit: the typed question, trimmed, if there is one. */
  const submit = () => {
    const question = input.trim();
    if (question) ask(question, question);
  };

  const retryLast = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUser) void send(lastUser.content);
  };

  return {
    periods,
    scope,
    setScope,
    active,
    compare,
    compareScope: compare ? compareScope : null,
    setCompareScope,
    facts,
    findings,
    suggestions,
    unreadNotes,
    shareNotes,
    setShareNotes,
    messages,
    busy,
    streaming,
    error,
    remaining,
    wanted,
    input,
    setInput,
    ask,
    submit,
    retryLast,
    chatLocked,
  };
}

export type AssistantChat = ReturnType<typeof useAssistantChat>;

/** The questions left today, the way the meter, the composer and the phone header all count them. */
export function useQuestionsLeft() {
  const { tier, limits, usage } = useEntitlement();
  // `?? 0` throughout: a plan with no allowance arrives with the field missing, not as zero.
  const perDay = limits.aiMessagesPerDay ?? 0;
  const left = Math.max(0, perDay - (usage.aiMessagesUsed ?? 0)) + (usage.aiCredits ?? 0);
  return { perDay, left, planName: TIER_PLANS[tier]?.name ?? '' };
}
/** "Copied" for a moment after a copy, keyed by whichever answer was copied. */
export function useCopied() {
  const [copied, setCopied] = useState<number | null>(null);
  const copy = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(index);
      setTimeout(() => setCopied((c) => (c === index ? null : c)), 1600);
    } catch {
      // Clipboard blocked — silently skip rather than throwing an error at someone for a nicety.
    }
  };
  return { copied, copy };
}
