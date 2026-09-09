import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { AssistantMessage } from '../services/aiAssistant';
import {
  appendToThread,
  EMPTY_STORE,
  migrateLegacyThread,
  newThread,
  parseStore,
  pruneMessages,
  removeThread,
  upsertThread,
  type AssistantThread,
  type ThreadStore,
} from '../utils/assistantThreads';

const STORAGE_KEY = 'trend-chasers-assistant-threads';
/** The single-thread slot this replaced. Read once, to carry an in-flight conversation across. */
const LEGACY_KEY = 'trend-chasers-assistant-thread';

function makeId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // Fall through to the timestamp form below.
  }
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function load(): ThreadStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return parseStore(JSON.parse(raw) as unknown);

    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const migrated = migrateLegacyThread(JSON.parse(legacy) as unknown, makeId(), Date.now());
      if (migrated.threads.length > 0) return migrated;
    }
  } catch {
    // Private browsing, a full quota, or a corrupted slot. An empty history and a working
    // assistant is the right answer to all three.
  }
  return EMPTY_STORE;
}

/**
 * One store for the whole tab, not one per component.
 *
 * The dock and the Assistant tab are both on screen in the same session, and with a plain useState
 * each they would hold two copies of the same history: ask a question in the bubble and the tab's
 * thread list, mounted a moment earlier, would still be showing yesterday's. A module-level store
 * with subscribers means there is exactly one history and both surfaces are looking at it.
 */
let current: ThreadStore | null = null;
const listeners = new Set<() => void>();

function snapshot(): ThreadStore {
  if (current === null) current = load();
  return current;
}

/** The server has no localStorage and no conversations; render the empty history there. */
function serverSnapshot(): ThreadStore {
  return EMPTY_STORE;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function update(next: (prev: ThreadStore) => ThreadStore): void {
  const value = next(snapshot());
  if (value === current) return;
  current = value;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // The history just won't outlive the session.
  }
  for (const listener of listeners) listener();
}

/**
 * The assistant's saved conversations, for whichever surface is showing it.
 *
 * Dock and tab read the same store on purpose: a question asked from the bubble on the dashboard
 * is the same conversation you find on the Assistant tab afterwards. Two histories would just be
 * a reasonable person concluding the app lost one of them.
 */
export function useAssistantThreads() {
  const store = useSyncExternalStore(subscribe, snapshot, serverSnapshot);

  const active = useMemo(
    () => store.threads.find((t) => t.id === store.activeId) ?? null,
    [store],
  );

  const messages = active?.messages ?? [];

  /** Adds turns to the open conversation, opening one first if there isn't one. */
  const append = useCallback((next: AssistantMessage[]) => {
    const now = Date.now();
    const stamped = next.map((m) => ({ role: m.role, content: m.content, at: now }));
    update((prev) => {
      const thread = prev.threads.find((t) => t.id === prev.activeId) ?? newThread(makeId(), now);
      return upsertThread(prev, appendToThread(thread, stamped, now));
    });
  }, []);

  /** Drops the optimistic user turn when a send fails, so a failure doesn't leave a ghost. */
  const rollbackTo = useCallback((count: number) => {
    update((prev) => {
      const thread = prev.threads.find((t) => t.id === prev.activeId);
      if (!thread) return prev;
      return upsertThread(prev, {
        ...thread,
        messages: pruneMessages(thread.messages.slice(0, count)),
      });
    });
  }, []);

  /**
   * Starts a fresh conversation.
   *
   * An empty thread is not written to the list — it becomes real when the first question is asked.
   * Otherwise pressing "New chat" three times leaves three identical "New chat" rows in a history
   * whose whole job is being scannable.
   */
  const startNew = useCallback(() => {
    update((prev) => (prev.activeId === null ? prev : { ...prev, activeId: null }));
  }, []);

  const selectThread = useCallback((id: string) => {
    update((prev) => (prev.threads.some((t) => t.id === id) ? { ...prev, activeId: id } : prev));
  }, []);

  const deleteThread = useCallback((id: string) => {
    update((prev) => removeThread(prev, id));
  }, []);

  const clearAll = useCallback(() => {
    update(() => EMPTY_STORE);
    try {
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      // The in-memory clear is what the user actually sees.
    }
  }, []);

  return {
    threads: store.threads as readonly AssistantThread[],
    activeId: store.activeId,
    active,
    messages,
    append,
    rollbackTo,
    startNew,
    selectThread,
    deleteThread,
    clearAll,
  };
}
