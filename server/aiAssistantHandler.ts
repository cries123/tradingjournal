import type { IncomingHttpHeaders } from 'http';
import { assertCallerUid, BrokerRequestError } from './snaptradeAuth';
import { resolveAccess } from './entitlements';
import { consumeDaily, refundDaily, type SpendSource } from './usage';
import { lowestTierWith, TIER_PLANS, type Tier } from '../src/config/tiers';

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

/**
 * Used when the configured model is rejected outright (wrong name, or not enabled on this
 * account). Without it, one bad AI_MODEL value is a total outage for every user with no signal
 * anywhere except a function log nobody is watching — which is exactly how this failed in
 * production. A degraded assistant beats a dead one.
 */
export const AI_FALLBACK_MODEL = process.env.AI_FALLBACK_MODEL || 'gpt-4o-mini';
const AI_API_KEY = process.env.OPENAI_API_KEY;
const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.openai.com/v1';

export const AI_CONFIGURED = Boolean(AI_API_KEY?.trim());

/**
 * The daily cap now comes from the caller's plan (src/config/tiers.ts), not from an env var —
 * Gold gets 15 a day, Diamond 50, and anything below Gold gets none at all. That's also the only
 * thing bounding spend: exposure is exactly paid-users x their cap x model price.
 */

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

WHAT THE FIELDS MEAN
- holdTime: average minutes winners vs losers are held. holdsLosersLonger being true is a
  discipline finding worth naming plainly — cutting winners early while letting losers run.
- selfAssessment: the trader's own A-F grades against what those trades actually made.
  gradingInverted true means their best-graded trades made less than their worst-graded ones.
  Say so directly; it is the most useful thing a journal can tell someone.
- checklist: P&L on trades that met their own checklist threshold vs trades that didn't.
- ruleBreaches: days the trader broke limits THEY set. Refer to them as their own rules.
- weekdays: sorted worst first. Only comment if the spread is large relative to the trade counts.
- fees: total commissions. Worth mentioning when it's large next to netPnl.
- notes: the trader's own words on their biggest trades, when they've shared them. Quote them back
  when a pattern shows up across several. Never invent a note that isn't in the JSON.
- Every block carries its sample size. Say when a sample is thin instead of implying certainty.
- A null field means not enough data or not recorded — say you don't have it, don't guess.

COMPARING PERIODS
If a second period's stats are provided, the question is about what CHANGED. Lead with the
direction of the change and the size of it, and only mention figures present in both.

HOW TO WRITE
- Speak plainly to an experienced trader. No hedging padding, no "as an AI".
- Lead with the answer, then the evidence from the JSON.
- Quote the specific figures you're reasoning from.
- Be concise: a few short paragraphs at most. No headers unless genuinely comparing several things.
- It's fine to be blunt about a losing pattern. That's what a journal is for.`;

interface AiRequestBody {
  question?: string;
  facts?: unknown;
  /** A second period's stats, when the trader is asking what changed between two of them. */
  compareFacts?: unknown;
  history?: { role: 'user' | 'assistant'; content: string }[];
  /** Ask for the answer as an SSE token stream instead of one JSON blob. */
  stream?: boolean;
}

export interface AiAssistantResult {
  statusCode: number;
  body: Record<string, unknown>;
}

/**
 * Counts one question against the caller's plan allowance.
 *
 * The allowance is a property of what they pay for, so it's resolved from their entitlement on
 * every request rather than trusted from the client. Stored server-side in Firestore, keyed by
 * UTC day so it resets on its own with no cleanup job.
 */
type RateOutcome =
  | { ok: true; remaining: number; limit: number; tier: Tier; source: SpendSource; credits: number }
  | { ok: false; reason: 'capped' | 'not_included' | 'unavailable'; limit: number; tier: Tier };

async function consumeRateLimit(uid: string): Promise<RateOutcome> {
  const { tier, limits } = await resolveAccess(uid);
  const limit = limits.aiMessagesPerDay;
  const result = await consumeDaily('ai', uid, limit);

  return result.ok
    ? { ok: true, remaining: result.remaining, limit, tier, source: result.source, credits: result.credits }
    : { ok: false, reason: result.reason, limit, tier };
}

/** The message shown when a request is refused, phrased for why it was refused. */
function rateLimitRejection(outcome: Extract<RateOutcome, { ok: false }>): {
  statusCode: number;
  error: string;
  upgradeTo?: Tier;
} {
  if (outcome.reason === 'unavailable') {
    return { statusCode: 503, error: 'The assistant is briefly unavailable. Try again in a moment.' };
  }
  if (outcome.reason === 'not_included') {
    // Named from the tier table rather than hardcoded, so it stays true if the plans change.
    const needed = lowestTierWith('aiAssistant');
    const name = needed ? TIER_PLANS[needed].name : 'a paid plan';
    return {
      statusCode: 402,
      error: `AI trade analysis is part of ${name}. Upgrade your plan to ask the assistant about your journal.`,
      upgradeTo: needed ?? undefined,
    };
  }
  return {
    statusCode: 429,
    error: `You've used all ${outcome.limit} of today's AI messages on ${TIER_PLANS[outcome.tier].name}. They reset at midnight Eastern.`,
  };
}

/**
 * Calls the model. Isolated behind a single function and driven by AI_BASE_URL/AI_MODEL so
 * switching provider is an env change, not a rewrite — any OpenAI-compatible endpoint works.
 */
interface ModelCallOutcome {
  ok: boolean;
  status: number;
  answer?: string;
  detail?: string;
  /** Why the model stopped. 'length' with no answer is the reasoning-budget failure below. */
  finishReason?: string;
}

/**
 * Reasoning models spend part of the completion budget thinking before they write anything.
 *
 * This is what took the assistant down: with a 700-token budget, a reasoning model can burn the
 * entire allowance on hidden reasoning tokens and return HTTP 200 with empty content and
 * finish_reason "length" — which surfaced to every user as "The assistant returned an empty
 * answer." Nothing was wrong with the key, the model, or the prompt; the budget was simply too
 * small to reach the visible answer.
 */
function isReasoningModel(model: string): boolean {
  return /^(gpt-5|o1|o3|o4)/i.test(model);
}

/** Generous enough that reasoning tokens can't crowd out the answer. Answers stay short anyway
 *  because the system prompt asks for a few short paragraphs — unused budget costs nothing. */
const MAX_COMPLETION_TOKENS = Number(process.env.AI_MAX_TOKENS || 3000);

export function buildMessages(
  facts: unknown,
  question: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  compareFacts?: unknown,
): { role: string; content: string }[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: `The user's journal stats for this period:\n${JSON.stringify(facts)}` },
    ...(compareFacts
      ? [
          {
            role: 'system',
            content: `The comparison period's stats:\n${JSON.stringify(compareFacts)}`,
          },
        ]
      : []),
    ...history,
    { role: 'user', content: question },
  ];
}

async function callModel(
  model: string,
  facts: unknown,
  question: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  maxTokens = MAX_COMPLETION_TOKENS,
  compareFacts?: unknown,
): Promise<ModelCallOutcome> {
  const payload: Record<string, unknown> = {
    model,
    messages: buildMessages(facts, question, history, compareFacts),
    max_completion_tokens: maxTokens,
  };

  // Keep the thinking short: this task is "explain these numbers", not a puzzle, so a long
  // reasoning pass buys nothing and is what starves the answer.
  if (isReasoningModel(model)) payload.reasoning_effort = 'low';

  const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AI_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return { ok: false, status: res.status, detail: detail.slice(0, 500) };
  }

  const data = (await res.json().catch(() => ({}))) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
  };
  return {
    ok: true,
    status: res.status,
    answer: data.choices?.[0]?.message?.content?.trim(),
    finishReason: data.choices?.[0]?.finish_reason,
  };
}

/**
 * Calls the model, falling back once if the configured one is rejected.
 *
 * A 400/404 from the provider means the model name is wrong or not enabled on this account — a
 * configuration mistake, not a transient fault, so retrying the same name is pointless and the
 * assistant simply stays dead for everyone. Retrying once on a known-good model keeps the feature
 * alive while the owner fixes AI_MODEL, and logs loudly enough to be findable.
 */
async function askModel(
  facts: unknown,
  question: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  compareFacts?: unknown,
): Promise<string> {
  let outcome = await callModel(AI_MODEL, facts, question, history, MAX_COMPLETION_TOKENS, compareFacts);

  const modelRejected = !outcome.ok && (outcome.status === 400 || outcome.status === 404);
  if (modelRejected && AI_FALLBACK_MODEL && AI_FALLBACK_MODEL !== AI_MODEL) {
    console.error(
      `[ai-assistant] model "${AI_MODEL}" was rejected (${outcome.status}) — falling back to ` +
        `"${AI_FALLBACK_MODEL}". Fix AI_MODEL in your environment variables. Provider said: ` +
        `${outcome.detail ?? ''}`,
    );
    outcome = await callModel(AI_FALLBACK_MODEL, facts, question, history, MAX_COMPLETION_TOKENS, compareFacts);
  }

  // 200 OK, no text: the budget ran out before the model wrote anything. One more pass with room
  // to finish, then a non-reasoning model, rather than telling the user to "rephrase" a question
  // that was never the problem.
  if (outcome.ok && !outcome.answer) {
    console.error(
      `[ai-assistant] "${AI_MODEL}" returned an empty answer (finish_reason=` +
        `${outcome.finishReason ?? 'unknown'}) — retrying with a larger completion budget.`,
    );
    outcome = await callModel(AI_MODEL, facts, question, history, MAX_COMPLETION_TOKENS * 2, compareFacts);

    if (outcome.ok && !outcome.answer && AI_FALLBACK_MODEL !== AI_MODEL) {
      console.error(
        `[ai-assistant] "${AI_MODEL}" still returned nothing — falling back to ` +
          `"${AI_FALLBACK_MODEL}". Consider setting AI_MODEL to a non-reasoning model.`,
      );
      outcome = await callModel(AI_FALLBACK_MODEL, facts, question, history, MAX_COMPLETION_TOKENS, compareFacts);
    }
  }

  if (!outcome.ok) {
    console.error('[ai-assistant] model call failed:', outcome.status, outcome.detail ?? '');
    if (outcome.status === 401 || outcome.status === 403) {
      throw new BrokerRequestError(
        'The assistant isn\u2019t configured correctly \u2014 its API key was rejected. The site owner has been notified.',
        502,
      );
    }
    if (outcome.status === 429) {
      throw new BrokerRequestError('The assistant is busy right now. Try again in a moment.', 503);
    }
    throw new BrokerRequestError('The assistant is unavailable right now. Try again shortly.', 502);
  }

  if (!outcome.answer) {
    // Not the user's fault and not fixable by rephrasing — don't send them chasing that.
    throw new BrokerRequestError('The assistant is unavailable right now. Try again shortly.', 502);
  }
  return outcome.answer;
}

export interface StreamPreflight {
  ok: boolean;
  /** Set when the request should be refused outright — status and message for the response. */
  rejection?: { statusCode: number; error: string; upgradeTo?: Tier };
  messages?: { role: string; content: string }[];
  remaining?: number;
  /** The caller's plan allowance, so the UI can render "3 of 15 left" rather than a bare number. */
  limit?: number;
  tier?: Tier;
  /** Needed so the caller can hand back the counted message if the stream never delivers one. */
  uid?: string;
  /** Where that message was counted from, so the refund lands in the same place. */
  spentFrom?: SpendSource;
  /** Bonus messages still banked, already inside `remaining`. */
  credits?: number;
}

/**
 * Runs every check the normal path runs, then hands back the prepared messages.
 *
 * Split out so the streaming endpoint cannot accidentally become the unguarded door into the same
 * model: auth, the question limits, and the daily cap all still have to pass here before a single
 * token is generated, and the rate limit is consumed at the same point it would be otherwise.
 */
export async function prepareAssistantStream(
  headers: IncomingHttpHeaders,
  body: AiRequestBody,
): Promise<StreamPreflight> {
  if (!AI_CONFIGURED) {
    return {
      ok: false,
      rejection: {
        statusCode: 503,
        error: 'The assistant is not set up yet. Ask the site owner to add OPENAI_API_KEY.',
      },
    };
  }

  try {
    const uid = await assertCallerUid(headers);
    const question = typeof body.question === 'string' ? body.question.trim() : '';

    if (!question) return { ok: false, rejection: { statusCode: 400, error: 'Ask a question first.' } };
    if (question.length > MAX_QUESTION_CHARS) {
      return {
        ok: false,
        rejection: { statusCode: 400, error: `Keep questions under ${MAX_QUESTION_CHARS} characters.` },
      };
    }
    if (!body.facts) {
      return { ok: false, rejection: { statusCode: 400, error: 'No journal data to review yet.' } };
    }

    const limit = await consumeRateLimit(uid);
    if (!limit.ok) {
      return { ok: false, rejection: rateLimitRejection(limit) };
    }

    const history = Array.isArray(body.history)
      ? body.history
          .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
          .slice(-MAX_HISTORY_TURNS)
          .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_QUESTION_CHARS) }))
      : [];

    return {
      ok: true,
      messages: buildMessages(body.facts, question, history, body.compareFacts),
      remaining: limit.remaining,
      limit: limit.limit,
      tier: limit.tier,
      uid,
      spentFrom: limit.source,
      credits: limit.credits,
    };
  } catch (err) {
    if (err instanceof BrokerRequestError) {
      return { ok: false, rejection: { statusCode: err.statusCode, error: err.message } };
    }
    console.error('[ai-assistant] stream preflight failed:', err);
    return { ok: false, rejection: { statusCode: 500, error: 'Something went wrong. Try again.' } };
  }
}

/** Opens the upstream token stream. Streaming has no fallback retry — a stream that fails mid-flight
 *  can't be silently restarted without the user seeing the answer restart, so the client falls back
 *  to the normal endpoint instead. */
export async function openModelStream(
  messages: { role: string; content: string }[],
): Promise<Response> {
  const payload: Record<string, unknown> = {
    model: AI_MODEL,
    messages,
    max_completion_tokens: MAX_COMPLETION_TOKENS,
    stream: true,
  };
  if (isReasoningModel(AI_MODEL)) payload.reasoning_effort = 'low';

  return fetch(`${AI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AI_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });
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
      const rejection = rateLimitRejection(limit);
      return {
        statusCode: rejection.statusCode,
        body: { error: rejection.error, ...(rejection.upgradeTo ? { upgradeTo: rejection.upgradeTo } : {}) },
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

    let answer: string;
    try {
      answer = await askModel(body.facts, question, history, body.compareFacts);
    } catch (err) {
      // The allowance is spent before the model is called so a failing request can't be retried
      // for free in a loop. When the failure is ours, give it back — charging someone a message
      // for an answer they never received is the kind of small unfairness people remember.
      await refundDaily('ai', uid, limit.source);
      throw err;
    }

    return {
      statusCode: 200,
      body: { answer, remaining: limit.remaining, limit: limit.limit, tier: limit.tier, credits: limit.credits },
    };
  } catch (err) {
    if (err instanceof BrokerRequestError) {
      return { statusCode: err.statusCode, body: { error: err.message } };
    }
    console.error('[ai-assistant] failed:', err);
    return { statusCode: 500, body: { error: 'Something went wrong. Try again.' } };
  }
}
