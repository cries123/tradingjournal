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
/** Four exchanges. The facts payload carries the context; older turns add cost, not accuracy. */
const MAX_HISTORY_TURNS = 8;
/**
 * The assistant's own earlier answers are kept whole, or nearly so.
 *
 * Every turn used to be cut at the question limit, 600 characters, and an answer with a table
 * in it is longer than that. So the model saw only the start of what it had just said, and a
 * follow-up like "what did Sep 28 do differently?" was answered without the answer it followed.
 */
const MAX_ANSWER_CHARS = 2400;

/**
 * How much thinking a reasoning model does before it writes.
 *
 * 'low' was chosen when the whole completion budget was 700 tokens and the thinking starved the
 * answer. With room to finish, 'medium' is the better default for a question like "which of
 * these three groups explains the month": it costs a few hundred reasoning tokens a message, about
 * a fifth of a cent, and it is what separates a restated table from a read of it.
 */
const REASONING_EFFORT = process.env.AI_REASONING_EFFORT?.trim() || 'medium';

/** The recent turns, each role cut at its own limit. */
export function trimHistory(history: unknown): { role: 'user' | 'assistant'; content: string }[] {
  if (!Array.isArray(history)) return [];
  return (history as { role?: unknown; content?: unknown }[])
    .filter((m): m is { role: 'user' | 'assistant'; content: string } => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_HISTORY_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, m.role === 'assistant' ? MAX_ANSWER_CHARS : MAX_QUESTION_CHARS) }));
}

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
- If the data doesn't answer the question, say so, then name the nearest thing it does answer.
- Never tell them what limit to set. You may say what their own data shows past their third
  trade or on their busiest days, and that the Rule simulator in the app can replay a cap or a
  daily stop against their journal. The number is theirs to pick.

GENERAL QUESTIONS
- A question about trading vocabulary or mechanics (what assignment is, what 0DTE means, how a
  profit factor is read) gets a short plain answer from general knowledge, marked as general and
  not from their journal, then one line tying it to their figures if one applies.
- Research on a company, a ticker or a product, or whether something is a good investment, is
  outside this assistant. Say so in one sentence and return to their journal.
- Anything else unrelated to their trading: one sentence saying what you are for.

WHAT THE FIELDS MEAN
- holdTime: average minutes winners vs losers are held. holdsLosersLonger being true is a
  discipline finding worth naming plainly — cutting winners early while letting losers run.
- selfAssessment: the trader's own A-F grades against what those trades actually made.
  gradingInverted true means their best-graded trades made less than their worst-graded ones.
  Say so directly; it is the most useful thing a journal can tell someone.
- checklist: P&L on trades that met their own checklist threshold vs trades that didn't.
- ruleBreaches: days the trader broke limits THEY set. Refer to them as their own rules. It lists the first ten only; ruleBreachCount is how many there were in all.
- weekdays: sorted worst first. Only comment if the spread is large relative to the trade counts.
- fees: total commissions. Worth mentioning when it's large next to netPnl.
- notes: the trader's own words on their biggest trades, when they've shared them. Quote them back
  when a pattern shows up across several. Never invent a note that isn't in the JSON.
- dayNotes: the trader's own words about whole sessions and their own 1-5 "Followed my plan"
  rating, on the biggest days, beside each day's result. Same rule: quote them when a pattern
  shows, never invent one. byRating is per day on days they rated 4-5 against days rated 1-2; a
  plan they say they followed that loses, or a low rating on a winning day, is worth saying
  plainly. A rated day that contradicts its result is a finding about their self-assessment.

THE BLOCKS THAT ARE ALMOST ALWAYS THERE
Most traders here sync from a broker that sends a date with no fill time and nothing
hand-entered, so holdTime, rMultiple, selfAssessment and checklist are usually null. These
compute from the fills alone and are the ones you can nearly always reason from. Reach for them
before you tell someone you have nothing.
- breakeven: the win rate their own payoff ratio REQUIRES, next to the one they have. gap is
  winRate minus requiredWinRate; negative is a losing expectancy and the single most useful
  thing you can tell them. Say both numbers. It also points at the fix: a gap can close by
  winning more often or by losing less per loss, and avgWin against avgLoss says which is
  further away.
- sizing: ratio is average loser size over average winner size. Above 1 means the big positions
  are the losing ones — a sizing problem dressed as a strategy problem. biggestQuarterPerTrade
  against restPerTrade is the same question per trade, and is the honest comparison when both
  halves lose money.
- tilt: what the trade after a loss is worth against the trade after a win, within the same day.
  A negative delta is the price of the trade they took to get it back.
- costs: commissions, and what share of gross profit they ate. Worth raising unprompted when
  shareOfGross is large.
- ruleSimulation: what THEIR OWN limits would have done to this period had they kept them.
  difference is simulated minus actual. winnersGivenUp and lossesAvoided are both there and both
  belong in the answer: a rule that saves money still costs real winners, and quoting only the
  saving is selling a rule rather than testing one. Never suggest a limit they have not set —
  this block only exists because they set one.
- sequence: where each trade fell in its day — 1st, 2nd, 3rd, then the rest pooled ("4th+").
  This is the Performance screen's usual headline and the first place to look for "where does my
  money go": a day whose first trades pay and whose later ones give it back is an overtrading
  finding, and the opposite shape is worth saying too before anybody stops trading after two.
- dailyLoad: whole days grouped by how many trades were in them, with the average per day. Busy
  days that lose next to quiet days that win is the clearest case for a daily cap a journal can
  make, and it needs nothing hand-entered.
- expiry: options by how long they had left when opened. 0DTE against the longer-dated is the
  split that matters most to a same-day trader.
- instruments: calls, puts and shares separately.
- ruleDays: the days a limit of theirs was crossed, as a group, against the days none was — per
  day, not per trade, because a broken day holds more trades. This is what answers "what happened
  on the days I broke my rules compared with the days I didn't".
- playbook: their own checklist, rule by rule, per trade when it was ticked against when it was
  not; costOfSkipping is followed minus skipped. Sorted most expensive to skip first. A rule that
  pays to skip is a finding too.
- profitFactor of 99 means there were no losing trades, not a factor of ninety-nine.
- Every block carries its sample size. Say when a sample is thin instead of implying certainty.
- A null field means not enough data or not recorded — say you don't have it, don't guess.

- recentMonths: the last few months, oldest first, four numbers each. This is the only block
  that spans periods, so it is the only place a run can be seen. Say when something has held
  for several months rather than treating this period as new — "the third month your
  breakevenGap has been negative" is worth more than the same figure stated once. Do not
  extrapolate it forwards.

COMPARING PERIODS
If a second period's stats are provided, the question is about what CHANGED. Lead with the
direction of the change and the size of it, and only mention figures present in both.

HOW TO WRITE
- Speak plainly to an experienced trader. No hedging padding, no "as an AI".
- Open with one sentence in bold that is the answer on its own. The app draws it as the
  headline. Then the evidence from the JSON.
- Quote the specific figures you're reasoning from, with their sign: +$412, -$286.
- Be concise: a few short paragraphs at most. Bullets for a list of findings, a small table when
  comparing three or more groups (sequence, dailyLoad, expiry). No headers.
- End on the finding, not on an offer to help further.
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
  if (isReasoningModel(model)) payload.reasoning_effort = REASONING_EFFORT;

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

/**
 * One written review of a period, for a job rather than a person.
 *
 * The weekly recap email has always been a stats table, and a stats table is exactly what the
 * dashboard already shows — which is why the recap's job is retention and not insight. This asks
 * the same assistant the same way a trader would, from the same JournalFacts, so the words in the
 * email cannot disagree with the numbers underneath them.
 *
 * Returns null rather than throwing on any failure. Nobody is waiting on this: a model outage at
 * two in the morning must degrade to the templated recap that has always worked, not cancel
 * everybody's Sunday email.
 */
export async function writeReview(facts: unknown, question: string): Promise<string | null> {
  if (!AI_CONFIGURED) return null;
  try {
    return await askModel(facts, question, []);
  } catch (err) {
    console.warn('[ai-assistant] review generation failed, falling back:', err);
    return null;
  }
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

    const history = trimHistory(body.history);

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
  if (isReasoningModel(AI_MODEL)) payload.reasoning_effort = REASONING_EFFORT;

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
    const history = trimHistory(body.history);

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
