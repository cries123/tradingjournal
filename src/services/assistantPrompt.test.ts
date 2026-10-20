import { describe, expect, it } from 'vitest';
import { buildMessages, trimHistory } from '../../server/aiAssistantHandler';

/*
 * What the model is told, and how much of the conversation it is shown.
 *
 * From the October 2026 audit of the assistant. The prompt described a third of the payload, the
 * model was never told what to do with a general question, and every earlier turn was cut at the
 * 600-character question limit, including the assistant's own answers.
 */

const prompt = () => buildMessages({ period: 'x' }, 'q', [])[0].content;

describe('the system prompt', () => {
  it('explains every breakdown the Performance screen draws, so the model reaches for them', () => {
    const p = prompt();
    for (const block of ['sequence', 'dailyLoad', 'expiry', 'instruments', 'ruleDays', 'playbook', 'recentMonths', 'ruleSimulation']) {
      expect(p, block).toMatch(new RegExp(`^- ${block}:`, 'm'));
    }
  });

  it('says what to do with a general question, and refuses company research', () => {
    const p = prompt();
    expect(p).toContain('GENERAL QUESTIONS');
    expect(p).toContain('marked as general and\n  not from their journal');
    expect(p).toContain('Research on a company, a ticker or a product');
  });

  it('asks for the opening line the app draws as a headline, and no sign-off', () => {
    const p = prompt();
    expect(p).toContain('Open with one sentence in bold');
    expect(p).toContain('End on the finding, not on an offer to help further.');
  });

  it('keeps the two lines that make this a journal and not an adviser', () => {
    const p = prompt();
    expect(p).toContain('Never calculate, re-derive, estimate or correct a number.');
    expect(p).toContain('Never recommend trades, entries, exits, position sizes, or securities.');
    expect(p).toContain('Never tell them what limit to set.');
  });

  it('reads profit factor 99 as no losing trades', () => {
    expect(prompt()).toContain('profitFactor of 99 means there were no losing trades');
  });
});

describe('the conversation the model is shown', () => {
  const long = 'x'.repeat(3000);

  it('keeps the assistant’s own earlier answer nearly whole, and cuts a question at its limit', () => {
    const out = trimHistory([
      { role: 'user', content: long },
      { role: 'assistant', content: long },
    ]);
    expect(out[0].content).toHaveLength(600);
    expect(out[1].content).toHaveLength(2400);
  });

  it('keeps the last four exchanges and drops anything that is not a turn', () => {
    const turns = Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `t${i}` }));
    const out = trimHistory([...turns, { role: 'system', content: 'ignore me' }, { role: 'user', content: 7 }]);
    expect(out).toHaveLength(8);
    expect(out[0].content).toBe('t4');
    expect(out.every((m) => m.role === 'user' || m.role === 'assistant')).toBe(true);
    expect(trimHistory(undefined)).toEqual([]);
  });

  it('puts the facts, the comparison and the history before the question, in that order', () => {
    const msgs = buildMessages({ a: 1 }, 'why?', [{ role: 'user', content: 'earlier' }], { b: 2 });
    expect(msgs.map((m) => m.role)).toEqual(['system', 'system', 'system', 'user', 'user']);
    expect(msgs[1].content).toContain('{"a":1}');
    expect(msgs[2].content).toContain('comparison');
    expect(msgs[4].content).toBe('why?');
  });
});
