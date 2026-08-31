import { getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase';
import type { JournalFacts } from '../utils/journalFacts';

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantReply {
  answer: string;
  /** Questions left in today's allowance, so the UI can warn before it runs out. */
  remaining: number;
}

export class AssistantError extends Error {
  /** True when the user has hit their daily cap — worth saying differently to a real failure. */
  rateLimited: boolean;

  constructor(message: string, rateLimited = false) {
    super(message);
    this.name = 'AssistantError';
    this.rateLimited = rateLimited;
  }
}

/**
 * Asks the journal assistant a question.
 *
 * Sends the already-computed facts rather than raw trades: the server never needs the trade list,
 * the payload is a couple of hundred tokens instead of tens of thousands, and the model is given
 * numbers it cannot get wrong rather than data it might miscount.
 */
export interface AskOptions {
  /** A second period's facts, when the question is about what changed between two of them. */
  compareFacts?: JournalFacts | null;
}

/**
 * Streams an answer, calling back as each token arrives.
 *
 * Falls back to the buffered endpoint on any failure, deliberately. The non-streaming path has the
 * model fallback and the empty-answer retry, neither of which can be done halfway through a stream
 * the user is already reading — so when streaming fails the right move is to start over quietly on
 * the path that can recover, not to show someone half an answer and an error.
 */
export async function streamAssistant(
  question: string,
  facts: JournalFacts,
  history: AssistantMessage[] = [],
  onToken: (token: string) => void,
  options: AskOptions = {},
): Promise<AssistantReply> {
  const token = await requireIdToken();

  let res: Response;
  try {
    res = await fetch('/api/ai-assistant-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ question, facts, history, compareFacts: options.compareFacts ?? undefined }),
    });
  } catch {
    return askAssistant(question, facts, history, options);
  }

  // A refusal the user needs to see — the daily cap, a bad question — is reported as itself rather
  // than retried on the other endpoint, which would only burn a second question to say the same
  // thing. Server faults fall back.
  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (res.status === 429 || res.status === 400 || res.status === 401 || res.status === 503) {
      throw new AssistantError(data.error ?? 'The assistant is unavailable right now.', res.status === 429);
    }
    return askAssistant(question, facts, history, options);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let answer = '';
  let remaining = 0;
  let failed = false;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';

    for (const frame of frames) {
      const eventLine = frame.split('\n').find((l) => l.startsWith('event:'));
      const dataLine = frame.split('\n').find((l) => l.startsWith('data:'));
      if (!dataLine) continue;
      const event = eventLine?.slice(6).trim() ?? 'message';

      let payload: { token?: string; remaining?: number; error?: string };
      try {
        payload = JSON.parse(dataLine.slice(5).trim()) as typeof payload;
      } catch {
        continue;
      }

      if (event === 'meta' && typeof payload.remaining === 'number') remaining = payload.remaining;
      else if (event === 'error') failed = true;
      else if (payload.token) {
        answer += payload.token;
        onToken(payload.token);
      }
    }
  }

  if (failed || !answer.trim()) {
    return askAssistant(question, facts, history, options);
  }

  return { answer, remaining };
}

export async function requireIdToken(): Promise<string> {
  if (!isFirebaseConfigured()) throw new AssistantError('Sign in to use the assistant.');
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new AssistantError('Sign in to use the assistant.');
  return user.getIdToken();
}

export async function askAssistant(
  question: string,
  facts: JournalFacts,
  history: AssistantMessage[] = [],
  options: AskOptions = {},
): Promise<AssistantReply> {
  const token = await requireIdToken();
  const res = await fetch('/api/ai-assistant', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      question,
      facts,
      history,
      compareFacts: options.compareFacts ?? undefined,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as { answer?: string; error?: string; remaining?: number };

  if (!res.ok) {
    throw new AssistantError(data.error ?? 'The assistant is unavailable right now.', res.status === 429);
  }
  if (!data.answer) {
    throw new AssistantError('The assistant returned an empty answer.');
  }

  return { answer: data.answer, remaining: data.remaining ?? 0 };
}
