import { describe, expect, it } from 'vitest';
import {
  appendToThread,
  EMPTY_STORE,
  groupThreads,
  MAX_MESSAGES_PER_THREAD,
  MAX_THREADS,
  migrateLegacyThread,
  newThread,
  parseStore,
  pruneMessages,
  relativeAge,
  removeThread,
  searchThreads,
  threadSource,
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

describe('answer sources', () => {
  it('survive a reload, so an old answer still says which period it saw', () => {
    const store = parseStore({
      threads: [
        {
          id: 'a',
          title: 'Why red?',
          messages: [
            { role: 'user', content: 'Why red?', at: 1 },
            { role: 'assistant', content: 'Because.', at: 2, source: { period: 'September 2026', trades: 26 } },
            { role: 'assistant', content: 'And vs the year.', at: 3, source: { period: 'September 2026', trades: 26, compare: '2026' } },
          ],
        },
      ],
      activeId: 'a',
    });
    expect(store.threads[0].messages[1].source).toEqual({ period: 'September 2026', trades: 26 });
    expect(store.threads[0].messages[2].source).toEqual({ period: 'September 2026', trades: 26, compare: '2026' });
  });

  it('drop a malformed source and keep the message', () => {
    // A bad source must never cost somebody the answer it was attached to.
    const store = parseStore({
      threads: [
        {
          id: 'a',
          messages: [
            { role: 'assistant', content: 'One.', at: 1, source: { period: '', trades: 3 } },
            { role: 'assistant', content: 'Two.', at: 2, source: { period: 'May 2026', trades: -1 } },
            { role: 'assistant', content: 'Three.', at: 3, source: 'May 2026' },
          ],
        },
      ],
    });
    expect(store.threads[0].messages.map((m) => m.content)).toEqual(['One.', 'Two.', 'Three.']);
    expect(store.threads[0].messages.every((m) => m.source === undefined)).toBe(true);
  });

  it('are only read from answers', () => {
    const store = parseStore({
      threads: [{ id: 'a', messages: [{ role: 'user', content: 'Q', at: 1, source: { period: 'May 2026', trades: 3 } }] }],
    });
    expect(store.threads[0].messages[0].source).toBeUndefined();
  });

  it('name the conversation after its latest answer’s period', () => {
    const t = thread('a', {
      messages: [
        { ...msg('assistant', 'A'), source: { period: '2026', trades: 200 } },
        msg('user', 'Q'),
        { ...msg('assistant', 'B'), source: { period: 'September 2026', trades: 26 } },
        msg('user', 'Q2'),
      ],
    });
    expect(threadSource(t)).toEqual({ period: 'September 2026', trades: 26 });
    expect(threadSource(thread('b', { messages: [msg('user', 'Q')] }))).toBeNull();
  });
});

describe('groupThreads', () => {
  /*
   * Every time below is built from local calendar parts, so the groups must come out the same in
   * any time zone — and the loop is what proves it: the machine that runs this suite is on UTC,
   * which is how a day-boundary bug survived here once before.
   */
  const ZONES = ['UTC', 'America/New_York', 'Asia/Tokyo', 'Pacific/Auckland'];

  it('splits Today, This week and Earlier on the reader’s own calendar day', () => {
    const original = process.env.TZ;
    try {
      for (const zone of ZONES) {
        process.env.TZ = zone;
        const now = new Date(2026, 9, 19, 9, 0).getTime();
        const at = (d: number, h: number) => new Date(2026, 9, d, h, 0).getTime();
        const threads = [
          thread('morning', { updatedAt: at(19, 0) + 30 * 60_000 }),
          // Ten hours ago, but yesterday: not "today" at 9 a.m.
          thread('last-night', { updatedAt: at(18, 23) }),
          thread('friday', { updatedAt: at(16, 15) }),
          thread('old', { updatedAt: at(11, 9) - 60_000 }),
        ];
        const groups = groupThreads(threads, now);
        expect(groups.map((g) => [g.label, g.threads.map((t) => t.id)]), zone).toEqual([
          ['Today', ['morning']],
          ['This week', ['last-night', 'friday']],
          ['Earlier', ['old']],
        ]);
      }
    } finally {
      process.env.TZ = original;
    }
  });

  it('leaves out a group with nothing in it and keeps the list’s own order', () => {
    const now = new Date(2026, 9, 19, 9, 0).getTime();
    const groups = groupThreads([thread('b', { updatedAt: now - 1000 }), thread('a', { updatedAt: now - 5000 })], now);
    expect(groups).toEqual([{ label: 'Today', threads: [expect.objectContaining({ id: 'b' }), expect.objectContaining({ id: 'a' })] }]);
  });
});

describe('searchThreads', () => {
  const threads = [
    thread('orb', { title: 'Why is ORB losing?', messages: [msg('user', 'Why is ORB losing?')] }),
    thread('red', { title: 'Why did September go red?', messages: [msg('assistant', 'Mostly the 4th trade of the day.')] }),
  ];

  it('finds a conversation by its title, ignoring case', () => {
    expect(searchThreads(threads, 'orb').map((t) => t.id)).toEqual(['orb']);
  });

  it('finds one by what the answer said, which is what people remember', () => {
    expect(searchThreads(threads, '4TH TRADE').map((t) => t.id)).toEqual(['red']);
  });

  it('returns everything for an empty search', () => {
    expect(searchThreads(threads, '   ').map((t) => t.id)).toEqual(['orb', 'red']);
  });
});