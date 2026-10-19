/**
 * Saved assistant conversations.
 *
 * The assistant used to keep exactly one thread, in one localStorage slot, and "clear" was the
 * only way out of it. That made every conversation disposable: the answer to "why is my ORB setup
 * losing" — which took a day's allowance to get — was gone the moment you asked about something
 * else. Threads are the fix, and they are the reason the assistant is worth opening twice.
 *
 * Everything here is pure and does no storage of its own, so the rules about what survives a
 * reload can be tested without a browser. The hook in useAssistantThreads.ts owns the reading and
 * writing.
 *
 * Still localStorage rather than Firestore, for the reason the single thread was: a conversation
 * is a convenience for one person on one device, syncing it costs a read on load and a write per
 * message, and this journal has already had one outage caused by asking Firestore for more than it
 * needed. The shape below is deliberately serialisable as-is, so moving it later is a transport
 * change rather than a rewrite.
 */

export type ThreadRole = 'user' | 'assistant';

/**
 * What an answer was worked out from: the period it was handed and how many trades were in it.
 *
 * Recorded when the answer lands, because by the time somebody reopens the conversation the
 * period on screen may be a different one — and "From your journal · September 2026 · 26 trades"
 * under an answer is only worth printing if it is the period that answer actually saw. Optional:
 * conversations saved before this was recorded simply have no source line.
 */
export interface AnswerSource {
  /** The period as the screen named it: "September 2026", "2026", "All time". */
  period: string;
  trades: number;
  /** The second period, when the question was asked with Compare on. */
  compare?: string;
}

export interface ThreadMessage {
  role: ThreadRole;
  content: string;
  /** Epoch ms. Only used for ordering and the "2 days ago" label. */
  at: number;
  /** Assistant turns only. */
  source?: AnswerSource;
}

export interface AssistantThread {
  id: string;
  /** Taken from the first question asked, so the list reads as a list of questions. */
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ThreadMessage[];
}

export interface ThreadStore {
  threads: AssistantThread[];
  activeId: string | null;
}

/** Conversations kept. Past this the oldest drops off, so the slot cannot grow without bound. */
export const MAX_THREADS = 25;

/** Turns kept per conversation — enough to pick one back up, not enough to outgrow its slot. */
export const MAX_MESSAGES_PER_THREAD = 40;

/** Longest a generated title gets before it is cut at a word boundary. */
export const MAX_TITLE_LENGTH = 52;

export const EMPTY_STORE: ThreadStore = { threads: [], activeId: null };

/**
 * A conversation's name, from the question that started it.
 *
 * Cut at a word rather than mid-syllable, and never left ending in punctuation, because the list
 * is read at a glance and "Why is my ORB setup los…" is legible where "Why is my ORB setup l" is
 * just wrong.
 */
export function titleFor(question: string): string {
  const clean = question.replace(/\s+/g, ' ').trim();
  if (!clean) return 'New chat';
  if (clean.length <= MAX_TITLE_LENGTH) return clean;

  const cut = clean.slice(0, MAX_TITLE_LENGTH);
  const lastSpace = cut.lastIndexOf(' ');
  const stem = (lastSpace > MAX_TITLE_LENGTH * 0.5 ? cut.slice(0, lastSpace) : cut).replace(
    /[\s,.;:!?—-]+$/,
    '',
  );
  return `${stem}…`;
}

export function newThread(id: string, now: number): AssistantThread {
  return { id, title: 'New chat', createdAt: now, updatedAt: now, messages: [] };
}

/** Drops the oldest turns past the cap, keeping the end of the conversation. */
export function pruneMessages(messages: ThreadMessage[]): ThreadMessage[] {
  return messages.length <= MAX_MESSAGES_PER_THREAD
    ? messages
    : messages.slice(messages.length - MAX_MESSAGES_PER_THREAD);
}

/**
 * Puts a thread back into the store, most recently used first.
 *
 * Front-of-list rather than sorted-on-read: the list a person sees has to be stable while they are
 * looking at it, and re-sorting by updatedAt on every render moves the row out from under the
 * cursor the moment an answer lands.
 */
export function upsertThread(store: ThreadStore, thread: AssistantThread): ThreadStore {
  const rest = store.threads.filter((t) => t.id !== thread.id);
  return {
    threads: [thread, ...rest].slice(0, MAX_THREADS),
    activeId: thread.id,
  };
}

export function removeThread(store: ThreadStore, id: string): ThreadStore {
  const threads = store.threads.filter((t) => t.id !== id);
  return {
    threads,
    // Falling back to the newest remaining thread, not to null: deleting the open conversation
    // should land on another one, not on an empty screen that looks like everything was deleted.
    activeId: store.activeId === id ? (threads[0]?.id ?? null) : store.activeId,
  };
}

/**
 * Adds turns to a thread, naming it from the first question.
 *
 * The title is only ever set once, from the opening question. Re-titling on every user turn would
 * rename a conversation you had already found in the list, which is the one thing a history is for.
 */
export function appendToThread(
  thread: AssistantThread,
  messages: ThreadMessage[],
  now: number,
): AssistantThread {
  const next = pruneMessages([...thread.messages, ...messages]);
  const firstQuestion = next.find((m) => m.role === 'user');
  const named = thread.title !== 'New chat' && thread.title.trim().length > 0;

  return {
    ...thread,
    title: named ? thread.title : firstQuestion ? titleFor(firstQuestion.content) : thread.title,
    messages: next,
    updatedAt: now,
  };
}

function isMessage(value: unknown): value is ThreadMessage {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Partial<ThreadMessage>;
  return (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string';
}

/** A stored source, or nothing — a malformed one is dropped, never allowed to break the thread. */
function readSource(value: unknown): AnswerSource | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const s = value as Partial<AnswerSource>;
  if (typeof s.period !== 'string' || !s.period.trim()) return undefined;
  if (typeof s.trades !== 'number' || !Number.isFinite(s.trades) || s.trades < 0) return undefined;
  return typeof s.compare === 'string' && s.compare.trim()
    ? { period: s.period, trades: s.trades, compare: s.compare }
    : { period: s.period, trades: s.trades };
}

function readMessages(value: unknown): ThreadMessage[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isMessage).map((m) => {
    const source = m.role === 'assistant' ? readSource(m.source) : undefined;
    return {
      role: m.role,
      content: m.content,
      at: typeof m.at === 'number' && Number.isFinite(m.at) ? m.at : 0,
      ...(source ? { source } : {}),
    };
  });
}

/**
 * Reads whatever is in storage into a store, discarding anything that isn't a conversation.
 *
 * Permissive on purpose. A person with a corrupted slot should get an empty history and a working
 * assistant, never a blank screen — so a bad thread is dropped rather than thrown.
 */
export function parseStore(raw: unknown): ThreadStore {
  if (typeof raw !== 'object' || raw === null) return EMPTY_STORE;
  const source = raw as { threads?: unknown; activeId?: unknown };
  if (!Array.isArray(source.threads)) return EMPTY_STORE;

  const threads: AssistantThread[] = [];
  for (const entry of source.threads) {
    if (typeof entry !== 'object' || entry === null) continue;
    const t = entry as Partial<AssistantThread>;
    if (typeof t.id !== 'string' || !t.id) continue;
    const messages = readMessages(t.messages);
    threads.push({
      id: t.id,
      title: typeof t.title === 'string' && t.title.trim() ? t.title : 'New chat',
      createdAt: typeof t.createdAt === 'number' ? t.createdAt : 0,
      updatedAt: typeof t.updatedAt === 'number' ? t.updatedAt : 0,
      messages: pruneMessages(messages),
    });
    if (threads.length >= MAX_THREADS) break;
  }

  const activeId =
    typeof source.activeId === 'string' && threads.some((t) => t.id === source.activeId)
      ? source.activeId
      : (threads[0]?.id ?? null);

  return { threads, activeId };
}

/**
 * Turns the old single-thread slot into the first saved conversation.
 *
 * Run once, only when there is no thread store yet. Somebody mid-conversation when this shipped
 * should find it still there under a name, rather than discover the assistant forgot everything
 * the day it learned to remember.
 */
export function migrateLegacyThread(raw: unknown, id: string, now: number): ThreadStore {
  const messages = readMessages(raw);
  if (messages.length === 0) return EMPTY_STORE;

  const firstQuestion = messages.find((m) => m.role === 'user');
  const thread: AssistantThread = {
    id,
    title: firstQuestion ? titleFor(firstQuestion.content) : 'Earlier chat',
    createdAt: messages[0]?.at || now,
    updatedAt: messages[messages.length - 1]?.at || now,
    messages: pruneMessages(messages),
  };
  return { threads: [thread], activeId: id };
}

/** The period the conversation's latest answer was about, or null before it has one. */
export function threadSource(thread: AssistantThread): AnswerSource | null {
  for (let i = thread.messages.length - 1; i >= 0; i--) {
    const source = thread.messages[i].source;
    if (source) return source;
  }
  return null;
}

export type ThreadGroupLabel = 'Today' | 'This week' | 'Earlier';

/** How far back "This week" reaches: the last seven days, not the calendar week. */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The conversation list in the three groups the design names: Today, This week, Earlier.
 *
 * Today is the reader's own calendar day, not the last 24 hours — something asked at 11 p.m.
 * is not "today" at 9 the next morning. This week is the seven days before that, rather than the
 * calendar week, so on a Monday it still holds Friday. Order inside each group is the list's own
 * (most recently used first), which keeps a row from jumping while somebody reads.
 */
export function groupThreads(
  threads: readonly AssistantThread[],
  now: number,
): { label: ThreadGroupLabel; threads: AssistantThread[] }[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const today = startOfToday.getTime();

  const groups: Record<ThreadGroupLabel, AssistantThread[]> = { Today: [], 'This week': [], Earlier: [] };
  for (const t of threads) {
    const label: ThreadGroupLabel =
      t.updatedAt >= today ? 'Today' : now - t.updatedAt < WEEK_MS ? 'This week' : 'Earlier';
    groups[label].push(t);
  }
  return (['Today', 'This week', 'Earlier'] as const)
    .filter((label) => groups[label].length > 0)
    .map((label) => ({ label, threads: groups[label] }));
}

/**
 * Conversations whose title or any turn mentions the search, ignoring case.
 *
 * The turns as well as the title, because the title is only the opening question and what
 * somebody remembers is usually the answer — "the one where it said ORB was losing".
 */
export function searchThreads(threads: readonly AssistantThread[], query: string): AssistantThread[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...threads];
  return threads.filter(
    (t) => t.title.toLowerCase().includes(q) || t.messages.some((m) => m.content.toLowerCase().includes(q)),
  );
}

/** "Just now" / "3h ago" / "Mar 4" — the age of a conversation, at list density. */
export function relativeAge(at: number, now: number): string {
  const ms = now - at;
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
