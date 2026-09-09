import { describe, expect, it } from 'vitest';
import {
  appendToThread,
  EMPTY_STORE,
  MAX_MESSAGES_PER_THREAD,
  MAX_THREADS,
  migrateLegacyThread,
  newThread,
  parseStore,
  pruneMessages,
  relativeAge,
  removeThread,
  titleFor,
  upsertThread,
  type AssistantThread,
  type ThreadMessage,
} from './assistantThreads';

const msg = (role: 'user' | 'assistant', content: string, at = 1_000): ThreadMessage => ({
  role,
  content,
  at,
});

const thread = (id: string, over: Partial<AssistantThread> = {}): AssistantThread => ({
  ...newThread(id, 1_000),
  ...over,
});

describe('titleFor', () => {
  it('uses a short question as-is', () => {
    expect(titleFor('Why is my ORB setup losing?')).toBe('Why is my ORB setup losing?');
  });

  it('collapses whitespace', () => {
    expect(titleFor('  Why   is\nthis  ')).toBe('Why is this');
  });

  it('cuts a long question at a word, not mid-syllable', () => {
    const title = titleFor(
      'Why do I keep holding my losing trades so much longer than my winning ones every single day',
    );
    expect(title.endsWith('…')).toBe(true);
    expect(title.length).toBeLessThanOrEqual(53);
    expect(title).not.toContain('  ');
    // The cut lands on a word boundary rather than slicing one in half.
    expect(title.slice(0, -1).split(' ').pop()).not.toBe('');
    expect(title.startsWith('Why do I keep holding my losing trades')).toBe(true);
  });

  it('never leaves punctuation dangling before the ellipsis', () => {
    expect(titleFor('Review my whole period, including the losses, and tell me what to fix')).not.toMatch(
      /[ ,.;:!?—-]…$/,
    );
  });

  it('falls back for an empty question', () => {
    expect(titleFor('   ')).toBe('New chat');
  });
});

describe('appendToThread', () => {
  it('names an unnamed thread from the first question', () => {
    const next = appendToThread(thread('a'), [msg('user', 'Is my win rate good enough?')], 2_000);
    expect(next.title).toBe('Is my win rate good enough?');
    expect(next.updatedAt).toBe(2_000);
  });

  it('keeps the original name when the conversation continues', () => {
    // Re-titling on every turn renames the conversation somebody just found in the list.
    const first = appendToThread(thread('a'), [msg('user', 'First question')], 2_000);
    const second = appendToThread(first, [msg('user', 'A completely different follow-up')], 3_000);
    expect(second.title).toBe('First question');
  });

  it('keeps the name after the question that produced it falls off the end', () => {
    // The real reason the name is only ever set once. A long conversation drops its oldest turns,
    // and a title recomputed from "the first message still in the thread" would silently rename a
    // conversation somebody has been coming back to for a week.
    let current = appendToThread(thread('a'), [msg('user', 'Why is my ORB setup losing?')], 1);
    for (let i = 0; i < MAX_MESSAGES_PER_THREAD; i++) {
      current = appendToThread(current, [msg('user', `follow-up number ${i}`)], 2 + i);
    }

    expect(current.messages.some((m) => m.content === 'Why is my ORB setup losing?')).toBe(false);
    expect(current.title).toBe('Why is my ORB setup losing?');
  });

  it('leaves a thread unnamed until somebody actually asks something', () => {
    const next = appendToThread(thread('a'), [msg('assistant', 'Hello')], 2_000);
    expect(next.title).toBe('New chat');
  });

  it('keeps the end of a conversation that outgrows the cap', () => {
    const many = Array.from({ length: MAX_MESSAGES_PER_THREAD + 5 }, (_, i) =>
      msg('user', `q${i}`),
    );
    const next = appendToThread(thread('a'), many, 2_000);
    expect(next.messages).toHaveLength(MAX_MESSAGES_PER_THREAD);
    expect(next.messages[next.messages.length - 1].content).toBe(
      `q${MAX_MESSAGES_PER_THREAD + 4}`,
    );
  });
});

describe('pruneMessages', () => {
  it('leaves a conversation under the cap untouched', () => {
    const messages = [msg('user', 'a'), msg('assistant', 'b')];
    expect(pruneMessages(messages)).toBe(messages);
  });
});

describe('upsertThread', () => {
  it('moves the touched thread to the front', () => {
    const store = { threads: [thread('a'), thread('b'), thread('c')], activeId: 'a' };
    const next = upsertThread(store, thread('c', { title: 'Updated' }));

    expect(next.threads.map((t) => t.id)).toEqual(['c', 'a', 'b']);
    expect(next.activeId).toBe('c');
  });

  it('never keeps two copies of the same conversation', () => {
    const store = { threads: [thread('a')], activeId: 'a' };
    const next = upsertThread(store, thread('a', { title: 'Renamed' }));
    expect(next.threads).toHaveLength(1);
    expect(next.threads[0].title).toBe('Renamed');
  });

  it('drops the oldest once the list is full', () => {
    const full = {
      threads: Array.from({ length: MAX_THREADS }, (_, i) => thread(`t${i}`)),
      activeId: 't0',
    };
    const next = upsertThread(full, thread('new'));

    expect(next.threads).toHaveLength(MAX_THREADS);
    expect(next.threads[0].id).toBe('new');
    expect(next.threads.some((t) => t.id === `t${MAX_THREADS - 1}`)).toBe(false);
  });
});

describe('removeThread', () => {
  it('opens the newest remaining conversation when the open one is deleted', () => {
    // Landing on a blank screen after deleting one thread reads as having deleted all of them.
    const store = { threads: [thread('a'), thread('b')], activeId: 'a' };
    const next = removeThread(store, 'a');
    expect(next.activeId).toBe('b');
  });

  it('leaves the open conversation alone when a different one is deleted', () => {
    const store = { threads: [thread('a'), thread('b')], activeId: 'a' };
    expect(removeThread(store, 'b').activeId).toBe('a');
  });

  it('ends with nothing open once the last one goes', () => {
    const next = removeThread({ threads: [thread('a')], activeId: 'a' }, 'a');
    expect(next).toEqual(EMPTY_STORE);
  });
});

describe('parseStore', () => {
  it('reads back what was written', () => {
    const store = upsertThread(EMPTY_STORE, appendToThread(thread('a'), [msg('user', 'Hi')], 5));
    expect(parseStore(JSON.parse(JSON.stringify(store)) as unknown)).toEqual(store);
  });

  it('returns an empty history for junk rather than throwing', () => {
    expect(parseStore(null)).toEqual(EMPTY_STORE);
    expect(parseStore('nonsense')).toEqual(EMPTY_STORE);
    expect(parseStore({ threads: 'nope' })).toEqual(EMPTY_STORE);
  });

  it('drops a malformed thread and keeps the rest', () => {
    const parsed = parseStore({
      threads: [{ id: 'good', title: 'Kept', messages: [] }, { title: 'No id' }, 42],
      activeId: 'good',
    });
    expect(parsed.threads.map((t) => t.id)).toEqual(['good']);
  });

  it('drops a message that is not a message', () => {
    const parsed = parseStore({
      threads: [
        {
          id: 'a',
          title: 'x',
          messages: [{ role: 'user', content: 'ok' }, { role: 'system', content: 'no' }, null],
        },
      ],
      activeId: 'a',
    });
    expect(parsed.threads[0].messages).toEqual([{ role: 'user', content: 'ok', at: 0 }]);
  });

  it('falls back to the newest thread when the stored active id is gone', () => {
    const parsed = parseStore({
      threads: [{ id: 'a', title: 'x', messages: [] }],
      activeId: 'deleted',
    });
    expect(parsed.activeId).toBe('a');
  });
});

describe('migrateLegacyThread', () => {
  it('turns the old single thread into the first saved conversation', () => {
    const store = migrateLegacyThread(
      [msg('user', 'Why do I hold losers longer?', 10), msg('assistant', 'Because…', 20)],
      'migrated',
      99,
    );

    expect(store.threads).toHaveLength(1);
    expect(store.activeId).toBe('migrated');
    expect(store.threads[0].title).toBe('Why do I hold losers longer?');
    expect(store.threads[0].createdAt).toBe(10);
    expect(store.threads[0].updatedAt).toBe(20);
  });

  it('creates nothing from an empty or unreadable legacy slot', () => {
    expect(migrateLegacyThread([], 'x', 1)).toEqual(EMPTY_STORE);
    expect(migrateLegacyThread('garbage', 'x', 1)).toEqual(EMPTY_STORE);
  });
});

describe('relativeAge', () => {
  const now = Date.parse('2026-08-10T12:00:00Z');

  it('describes recent conversations in minutes and hours', () => {
    expect(relativeAge(now - 30_000, now)).toBe('just now');
    expect(relativeAge(now - 5 * 60_000, now)).toBe('5m ago');
    expect(relativeAge(now - 3 * 3_600_000, now)).toBe('3h ago');
    expect(relativeAge(now - 3 * 86_400_000, now)).toBe('3d ago');
  });

  it('falls back to a date once a week has passed', () => {
    expect(relativeAge(now - 30 * 86_400_000, now)).not.toMatch(/ago$/);
  });

  it('does not report a clock skew as a negative age', () => {
    expect(relativeAge(now + 60_000, now)).toBe('just now');
  });
});
