import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import {
  checkInvite,
  checkNote,
  coachWindowStart,
  forCoach,
  isInvitableEmail,
  mayCoach,
  MAX_NOTE_LENGTH,
  normalizeInvite,
  seatState,
  type CoachSeat,
} from '../../server/coachSeat';

const seat = (over: Partial<CoachSeat> = {}): CoachSeat => ({
  ownerUid: 'owner',
  coachEmail: 'coach@example.com',
  coachUid: null,
  invitedAt: '2026-08-01T00:00:00.000Z',
  acceptedAt: null,
  ...over,
});

describe('normalizeInvite', () => {
  it('lowercases and trims, and does nothing else', () => {
    expect(normalizeInvite('  Coach@Example.COM ')).toBe('coach@example.com');
  });

  it('leaves dots and plus-aliases alone', () => {
    // Folding these is an abuse-prevention move, where treating two addresses as one person is the
    // point. Here the same move would hand a journal to a different mailbox than the trader typed.
    expect(normalizeInvite('first.last+desk@gmail.com')).toBe('first.last+desk@gmail.com');
  });
});

describe('isInvitableEmail', () => {
  it('accepts an ordinary address', () => {
    expect(isInvitableEmail('coach@example.com')).toBe(true);
    expect(isInvitableEmail('  Coach@Sub.Example.co.uk')).toBe(true);
  });

  it('rejects the shapes that are certainly a typo', () => {
    for (const bad of ['', '   ', 'coach', 'coach@', '@example.com', 'coach@example', 'a b@c.com']) {
      expect(isInvitableEmail(bad)).toBe(false);
    }
  });

  it('rejects an address longer than any real one', () => {
    expect(isInvitableEmail(`${'a'.repeat(250)}@example.com`)).toBe(false);
  });
});

describe('checkInvite', () => {
  it('refuses an unentitled account before looking at the address', () => {
    expect(checkInvite({ entitled: false, ownerEmail: 'me@x.com', email: 'coach@x.com' })).toEqual({
      ok: false,
      reason: 'not-entitled',
    });
  });

  it('refuses inviting yourself', () => {
    // Harmless — you can already read your own journal — but it produces a seat that looks active
    // and never delivers a coach, and the trader is left wondering why nothing happened.
    expect(checkInvite({ entitled: true, ownerEmail: 'Me@X.com', email: ' me@x.com ' })).toEqual({
      ok: false,
      reason: 'self',
    });
  });

  it('normalises the accepted address', () => {
    expect(checkInvite({ entitled: true, ownerEmail: 'me@x.com', email: ' Coach@X.COM ' })).toEqual({
      ok: true,
      email: 'coach@x.com',
    });
  });
});

describe('seatState', () => {
  it('reads pending until the invitation is bound to an account', () => {
    expect(seatState(null)).toBe('none');
    expect(seatState(seat())).toBe('pending');
    expect(seatState(seat({ coachUid: 'c1' }))).toBe('active');
  });
});

describe('mayCoach', () => {
  it('lets nobody near a journal with no seat', () => {
    expect(mayCoach(null, { uid: 'anyone', email: 'coach@example.com' })).toBe(false);
  });

  it('matches on uid once the seat is bound', () => {
    const bound = seat({ coachUid: 'c1' });
    expect(mayCoach(bound, { uid: 'c1', email: 'other@example.com' })).toBe(true);
    // The address alone must stop working once a seat belongs to an account, or a trader who
    // changed their coach's email would leave the old account still holding access.
    expect(mayCoach(bound, { uid: 'c2', email: 'coach@example.com' })).toBe(false);
  });

  it('matches on the invited address before the coach has signed up', () => {
    expect(mayCoach(seat(), { uid: 'new-account', email: 'Coach@Example.com' })).toBe(true);
    expect(mayCoach(seat(), { uid: 'someone', email: 'else@example.com' })).toBe(false);
  });

  it('refuses a caller with no address against an unbound seat', () => {
    expect(mayCoach(seat(), { uid: 'someone', email: null })).toBe(false);
  });
});

describe('checkNote', () => {
  it('trims and accepts', () => {
    expect(checkNote('  cut the fourth trade  ')).toEqual({ ok: true, body: 'cut the fourth trade' });
  });

  it('refuses nothing at all', () => {
    expect(checkNote('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(checkNote(undefined)).toEqual({ ok: false, reason: 'empty' });
    expect(checkNote(42)).toEqual({ ok: false, reason: 'empty' });
  });

  it('refuses one longer than the cap', () => {
    expect(checkNote('x'.repeat(MAX_NOTE_LENGTH))).toEqual({
      ok: true,
      body: 'x'.repeat(MAX_NOTE_LENGTH),
    });
    expect(checkNote('x'.repeat(MAX_NOTE_LENGTH + 1))).toEqual({ ok: false, reason: 'too-long' });
  });
});

describe('coachWindowStart', () => {
  it('opens a fixed window back from today', () => {
    expect(coachWindowStart('2026-08-10', 90)).toBe('2026-05-12');
  });

  it('is the same window in every timezone', () => {
    const original = process.env.TZ;
    try {
      for (const zone of ['UTC', 'America/New_York', 'Pacific/Kiritimati']) {
        process.env.TZ = zone;
        expect(coachWindowStart('2026-11-08', 90)).toBe('2026-08-10');
      }
    } finally {
      process.env.TZ = original;
    }
  });
});

describe('forCoach', () => {
  it('keeps what a review needs and drops what it does not', () => {
    const shared = forCoach({
      id: 't1',
      date: '2026-08-03',
      symbol: 'SPY',
      pnl: -120,
      notes: 'chased the open',
      grade: 'D',
      accountId: 'live',
      accountType: 'margin',
      sourceId: 'snaptrade:a:b',
      strategyId: 's1',
      savedAt: '2026-08-03T20:00:00.000Z',
    } as Trade);

    // The trader's own words stay — a coach reviewing a spreadsheet is not a coach.
    expect(shared.notes).toBe('chased the open');
    expect(shared.grade).toBe('D');
    expect(shared.pnl).toBe(-120);

    for (const hidden of ['accountId', 'accountType', 'sourceId', 'strategyId', 'savedAt']) {
      expect(hidden in shared).toBe(false);
    }
  });
});
