import type { IncomingHttpHeaders } from 'node:http';
import { assertCallerUid } from './snaptradeAuth';
import { getAdminFirestore } from './firebaseAdmin';
import { consumeDaily, refundDaily } from './usage';

/**
 * The one-line read at the top of the dashboard.
 *
 * The banner it replaces was computed by a priority list of rules (src/utils/takeaway.ts). Those
 * rules are honest but they can only restate their own arithmetic: the last rule in the chain told
 * a trader down $3,039 that their win rate was below breakeven and they should "win more often or
 * let winners run further", which is the definition of a breakeven win rate read back to them.
 * Nothing in it looked at the fact that a single Tuesday was two thirds of the loss.
 *
 * Same contract as the assistant: the client computes every number (src/utils/journalFacts.ts) and
 * the model's only job is to decide which of them matters and say what to do about it. A model
 * doing arithmetic on a trader's P&L is how a journal ends up contradicting its own dashboard.
 *
 * Three things keep the cost of running this for every user bounded:
 *  1. A Firestore cache keyed by a hash of the period's trades. Paging back through old months is
 *     free, and a month only regenerates when its trades actually change.
 *  2. Its own daily counter, separate from the assistant's per-tier allowance.
 *  3. A small completion budget — this is two or three sentences, not an essay.
 */

const AI_API_KEY = process.env.OPENAI_API_KEY;
const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.openai.com/v1';
export const AI_MODEL = process.env.AI_TAKEAWAY_MODEL || process.env.AI_MODEL || 'gpt-5-mini';
export const AI_CONFIGURED = Boolean(AI_API_KEY?.trim());

/** Everyone gets this many generations a day, paid or not. A miss costs one; a cache hit costs none. */
const DAILY_LIMIT = Number(process.env.AI_TAKEAWAY_PER_DAY || 12);

/**
 * Reasoning models spend part of the completion budget thinking before they emit a token, so a
 * budget sized for the visible answer returns an empty string and finish_reason "length". The
 * assistant hit exactly this. Three sentences need very little; the thinking needs room.
 */
function isReasoningModel(model: string): boolean {
  return /^(gpt-5|o1|o3|o4)/i.test(model);
}
const MAX_COMPLETION_TOKENS = isReasoningModel(AI_MODEL) ? 2000 : 300;

export const SYSTEM_PROMPT = `You write the single most useful sentence or two a trading journal can
show someone about the month they just had. It appears at the top of their dashboard, above the
calendar. They have not asked a question — this is the app volunteering the one thing worth their
attention.

HARD RULES
- Never compute. Every figure you use must appear in the JSON you are given. Do not add, average,
  or infer numbers. If you want to say a day was a third of the month's loss, only say it if both
  figures are in the JSON and the ratio is obvious from them.
- Never recommend trades, entries, exits, sizing, or securities. You review what already happened.
- Never predict market direction.
- A null field means it was not recorded. Do not guess at it and do not mention its absence.
- Do not treat a 2-3 trade sample as a finding. Say "on a small sample" or pick something else.

WHAT MAKES THIS GOOD
Be specific to THIS month. The failure mode to avoid is restating a definition back at the trader:
"your win rate is below the breakeven win rate, so win more" tells them nothing they cannot read off
the tile above it. Look for the fact that actually explains the period — one day that ate the month,
a setup bleeding while the rest works, losers held twice as long as winners, a weekday that never
pays, fees that quietly exceed the net loss, their own graded-A trades underperforming their C's.
Prefer a concentrated cause over a diffuse one: "one Tuesday cost you $2.0k of a $3.0k month" is
worth more than "your win rate is low", because a trader can do something about the first.

Then say what to change. Concrete and behavioural — a rule they could follow tomorrow. Not "improve
your win rate"; something closer to "size that setup down until it shows an edge" or "you stop out
of your worst days late — a daily loss cap would have kept most of that Tuesday".

HOW TO WRITE
- Two or three sentences. This is a banner, not a report. Never use headers, bullets or markdown.
- Lead with the finding, then the figure that proves it, then what to change.
- Speak plainly to an experienced trader. No hedging, no preamble, no "as an AI", no compliments.
- If the month was genuinely good, say what worked and what to protect. Do not invent a problem.
- Write in second person. Do not start with "You" more than once.`;

interface TakeawayBody {
  facts?: unknown;
  /** Which period this is, e.g. "2026-07". Doubles as the cache document id. */
  periodKey?: string;
  /** Hash of the period's trades, computed client-side. Changes when the trades do. */
  factsHash?: string;
}

export interface TakeawayResult {
  statusCode: number;
  body: Record<string, unknown>;
}

const PERIOD_KEY_PATTERN = /^[0-9]{4}(-[0-9]{2})?$/;
const MAX_HASH_CHARS = 64;

function cacheDoc(uid: string, periodKey: string) {
  return getAdminFirestore().collection('users').doc(uid).collection('takeaways').doc(periodKey);
}

async function callModel(facts: unknown): Promise<{ ok: true; text: string } | { ok: false; detail: string }> {
  const payload: Record<string, unknown> = {
    model: AI_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'system', content: `The trader's stats for this period:\n${JSON.stringify(facts)}` },
      { role: 'user', content: 'Write the takeaway for this period.' },
    ],
    max_completion_tokens: MAX_COMPLETION_TOKENS,
  };

  const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AI_API_KEY}` },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    return { ok: false, detail: `${res.status} ${(await res.text().catch(() => '')).slice(0, 300)}` };
  }

  const data = (await res.json().catch(() => ({}))) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
  };
  const text = data.choices?.[0]?.message?.content?.trim() ?? '';
  if (!text) {
    return { ok: false, detail: `empty completion (finish_reason: ${data.choices?.[0]?.finish_reason ?? 'unknown'})` };
  }
  return { ok: true, text };
}

export async function handleTakeawayRequest(
  headers: IncomingHttpHeaders,
  body: TakeawayBody,
): Promise<TakeawayResult> {
  // Not an error the user needs to see. The dashboard keeps its computed banner and says nothing,
  // because "the site owner hasn't added an API key" is not the trader's problem to solve.
  if (!AI_CONFIGURED) return { statusCode: 204, body: {} };

  let uid: string;
  try {
    uid = await assertCallerUid(headers);
  } catch {
    return { statusCode: 401, body: { error: 'Sign in required' } };
  }

  const { facts, periodKey, factsHash } = body;
  if (!facts || typeof periodKey !== 'string' || !PERIOD_KEY_PATTERN.test(periodKey)) {
    return { statusCode: 400, body: { error: 'A period and its facts are required.' } };
  }
  if (typeof factsHash !== 'string' || !factsHash || factsHash.length > MAX_HASH_CHARS) {
    return { statusCode: 400, body: { error: 'A facts hash is required.' } };
  }

  // Cache first, before the quota. A hit must not cost the user a generation, or paging back
  // through the year would spend the day's allowance on months already written.
  try {
    const snap = await cacheDoc(uid, periodKey).get();
    const cached = snap.data();
    if (cached?.factsHash === factsHash && typeof cached.text === 'string') {
      return { statusCode: 200, body: { text: cached.text, cached: true } };
    }
  } catch (err) {
    // A cache that cannot be read is a slow path, not a failure. Fall through and generate.
    console.error('[takeaway] cache read failed:', err);
  }

  const spend = await consumeDaily('takeaway', uid, DAILY_LIMIT);
  if (!spend.ok) {
    // Silent by design: the computed banner is already on screen and still true. Telling someone
    // they have run out of a free thing they never asked for is noise.
    return { statusCode: 204, body: {} };
  }

  let result: Awaited<ReturnType<typeof callModel>>;
  try {
    result = await callModel(facts);
  } catch (err) {
    result = { ok: false, detail: err instanceof Error ? err.message : 'network error' };
  }

  if (!result.ok) {
    // The generation never happened, so it should not be charged for. Without this a provider
    // outage silently eats everyone's daily allowance and the banner stays computed all day even
    // after the outage clears.
    await refundDaily('takeaway', uid);
    console.error(`[takeaway] model call failed for ${periodKey}: ${result.detail}`);
    return { statusCode: 204, body: {} };
  }

  try {
    await cacheDoc(uid, periodKey).set({
      text: result.text,
      factsHash,
      model: AI_MODEL,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    // Worth returning anyway — the trader gets their takeaway, it just costs a generation again
    // next time.
    console.error('[takeaway] cache write failed:', err);
  }

  return { statusCode: 200, body: { text: result.text, cached: false } };
}
