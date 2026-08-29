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
export async function askAssistant(
  question: string,
  facts: JournalFacts,
  history: AssistantMessage[] = [],
): Promise<AssistantReply> {
  if (!isFirebaseConfigured()) {
    throw new AssistantError('Sign in to use the assistant.');
  }

  const user = getFirebaseAuth().currentUser;
  if (!user) {
    throw new AssistantError('Sign in to use the assistant.');
  }

  const token = await user.getIdToken();
  const res = await fetch('/api/ai-assistant', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ question, facts, history }),
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
