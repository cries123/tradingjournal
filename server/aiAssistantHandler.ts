import type { IncomingHttpHeaders } from 'http';
import { assertCallerUid, BrokerRequestError } from './snaptradeAuth';
import { getAdminFirestore } from './firebaseAdmin';

/**
 * Backend for the journal assistant.
 *
 * Two rules shape everything here:
 *
 *  1. The model never computes. The client sends facts already derived by the same functions the
 *     dashboard renders from (see src/utils/journalFacts.ts), and the model's job is to explain
 *     them. A journal that misreports someone's P&L because a model did mental arithmetic is
 *     worse than a journal with no assistant at all.
 *
 *  2. It reviews what happened; it does not advise on what to trade next. That line is in the
 *     system prompt below, and it's the difference between a journaling feature and unlicensed
 *     financial advice.
 */

export const AI_MODEL = process.env.AI_MODEL || 'gpt-5-mini';
const AI_API_KEY = process.env.OPENAI_API_KEY;
const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.openai.com/v1';

export const AI_CONFIGURED = Boolean(AI_API_KEY?.trim());

/**
 * Per-user daily cap, and the only thing bounding spend.
 *
 * A question costs well under a cent, so the model price isn't the risk — the exposure is exactly
 * users x cap x price. At 200 users a 40/day cap has a ~$150/month ceiling; 15/day puts it near
 * $57 and is still far more than anyone reviewing a trading month actually asks. Raise it with
 * AI_DAILY_LIMIT if real usage ever justifies it.
 */
const DAILY_QUESTION_LIMIT = Number(process.env.AI_DAILY_LIMIT || 15);

/** Keeps a pasted essay from becoming a bill. */
const MAX_QUESTION_CHARS = 600;
const MAX_HISTORY_TURNS = 6;

const SYSTEM_PROMPT = `You are the review assistant inside Trend Chasers, a trading journal.

WHAT YOU ARE GIVEN
The user's stats for a period are provided as JSON, already computed by the app. Treat those
numbers as authoritative and final.

HARD RULES
- Never calculate, re-derive, estimate or correct a number. If a figure isn't in the JSON, say you
  don't have it rather than working it out. You will get arithmetic wrong and this is someone's
  money.
- Never recommend trades, entries, exits, position sizes, or securities. You review behaviour that
  already happened. If asked what to buy, what to trade, or how much to size, say plainly that you
  review past trading and can't advise on future positions, then offer a relevant observation about
  their history instead.
- Never predict market direction.
- Don't claim a pattern is statistically meaningful when the sample is small. If a setup has 3
  trades, say so and treat it as a hint, not a conclusion.
- If the data doesn't answer the question, say so.

HOW TO WRITE
- Speak plainly to an experienced trader. No hedging padding, no "as an AI".
- Lead with the answer, then the evidence from the JSON.
- Quote the specific figures you're reasoning from.
- Be concise: a few short paragraphs at most. No headers unless genuinely comparing several things.
- It's fine to be blunt about a losing pattern. That's what a journal is for.`;

interface AiRequestBody {
  question?: string;
  facts?: unknown;
  history?: { role: 'user' | 'assistant'; content: string }[];
}

export interface AiAssistantResult {
  statusCode: number;
  body: Record<string, unknown>;
}

/**
 * Counts one question against the caller's daily allowance.
 *
 * Stored server-side in Firestore rather than in the client, for the obvious reason that a limit
 * the client enforces is not a limit. Keyed by UTC day so it resets on its own with no cleanup job.
 */
async function consumeRateLimit(uid: string): Promise<{ ok: boolean; remaining: number }> {
  const day = new Date().toISOString().slice(0, 10);
  const ref = getAdminFirestore().doc(`aiUsage/${uid}_${day}`);

  try {
    return await getAdminFirestore().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const used = (snap.data()?.count as number | undefined) ?? 0;

      if (used >= DAILY_QUESTION_LIMIT) {
        return { ok: false, remaining: 0 };
      }

      tx.set(ref, { uid, day, count: used + 1, updatedAt: new Date().toISOString() }, { merge: true });
      return { ok: true, remaining: DAILY_QUESTION_LIMIT - (used + 1) };
    });
  } catch (err) {
    // Firestore being unavailable shouldn't hand out unlimited requests — fail closed, because
    // the failure mode of failing open is an unbounded bill.
    console.error('[ai-assistant] rate limit check failed:', err);
    return { ok: false, remaining: 0 };
  }
}

/**
 * Calls the model. Isolated behind a single function and driven by AI_BASE_URL/AI_MODEL so
 * switching provider is an env change, not a rewrite — any OpenAI-compatible endpoint works.
 */
async function askModel(
  facts: unknown,
  question: string,
  history: { role: 'user' | 'assistant'; content: string }[],
): Promise<string> {
  const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AI_API_KEY}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'system',
          content: `The user's journal stats for this period:\n${JSON.stringify(facts)}`,
        },
        ...history,
        { role: 'user', content: question },
      ],
      max_completion_tokens: 700,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('[ai-assistant] model call failed:', res.status, detail.slice(0, 400));
    throw new BrokerRequestError('The assistant is unavailable right now. Try again shortly.', 502);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const answer = data.choices?.[0]?.message?.content?.trim();
  if (!answer) {
    throw new BrokerRequestError('The assistant returned an empty answer. Try rephrasing.', 502);
  }
  return answer;
}

export async function handleAiAssistantRequest(
  headers: IncomingHttpHeaders,
  body: AiRequestBody,
): Promise<AiAssistantResult> {
  if (!AI_CONFIGURED) {
    return {
      statusCode: 503,
      body: { error: 'The assistant is not set up yet. Ask the site owner to add OPENAI_API_KEY.' },
    };
  }

  try {
    const uid = await assertCallerUid(headers);

    const question = typeof body.question === 'string' ? body.question.trim() : '';
    if (!question) {
      return { statusCode: 400, body: { error: 'Ask a question first.' } };
    }
    if (question.length > MAX_QUESTION_CHARS) {
      return {
        statusCode: 400,
        body: { error: `Keep questions under ${MAX_QUESTION_CHARS} characters.` },
      };
    }
    if (!body.facts) {
      return { statusCode: 400, body: { error: 'No journal data to review yet.' } };
    }

    const limit = await consumeRateLimit(uid);
    if (!limit.ok) {
      return {
        statusCode: 429,
        body: {
          error: `You've reached today's limit of ${DAILY_QUESTION_LIMIT} questions. It resets at midnight UTC.`,
        },
      };
    }

    // Trimmed to the recent turns: older context adds cost without improving an answer that is
    // grounded in the facts payload anyway.
    const history = Array.isArray(body.history)
      ? body.history
          .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
          .slice(-MAX_HISTORY_TURNS)
          .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_QUESTION_CHARS) }))
      : [];

    const answer = await askModel(body.facts, question, history);

    return { statusCode: 200, body: { answer, remaining: limit.remaining } };
  } catch (err) {
    if (err instanceof BrokerRequestError) {
      return { statusCode: err.statusCode, body: { error: err.message } };
    }
    console.error('[ai-assistant] failed:', err);
    return { statusCode: 500, body: { error: 'Something went wrong. Try again.' } };
  }
}
