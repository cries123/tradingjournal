import { useCallback, useEffect, useState } from 'react';
import type { AssistantMessage } from '../services/aiAssistant';

const STORAGE_KEY = 'trend-chasers-assistant-thread';
/** Enough to pick a conversation back up; not so much that it outgrows its storage slot. */
const MAX_STORED = 40;

export interface StoredMessage extends AssistantMessage {
  at: number;
}

function read(): StoredMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is StoredMessage =>
        typeof m === 'object' && m !== null
        && (('role' in m && (m.role === 'user' || m.role === 'assistant')))
        && 'content' in m && typeof (m as StoredMessage).content === 'string',
    );
  } catch {
    return [];
  }
}

/**
 * Keeps the conversation alive across opening and closing the assistant.
 *
 * The panel is unmounted whenever the dock closes, so every message vanished the moment you looked
 * at the chart the answer was about. Asking a follow-up meant retyping the setup from scratch —
 * which quietly made the chat single-turn in practice, however many turns it supported.
 *
 * Deliberately localStorage and not Firestore. The thread is a convenience for one person on one
 * device, it costs a read to fetch and a write per message to keep in sync, and this journal has
 * already had one outage caused by reading more from Firestore than it needed to.
 */
export function useAssistantThread() {
  const [messages, setMessages] = useState<StoredMessage[]>(read);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED)));
    } catch {
      // Private browsing or a full quota — the thread just won't outlive the session.
    }
  }, [messages]);

  const append = useCallback((next: AssistantMessage[]) => {
    setMessages((prev) => [...prev, ...next.map((m) => ({ ...m, at: Date.now() }))]);
  }, []);

  /** Drops the optimistic user turn when a send fails, so a failure doesn't leave a ghost. */
  const rollbackTo = useCallback((count: number) => {
    setMessages((prev) => prev.slice(0, count));
  }, []);

  const clear = useCallback(() => {
    setMessages([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to do — the in-memory clear is what the user actually sees.
    }
  }, []);

  return { messages, append, rollbackTo, clear };
}
