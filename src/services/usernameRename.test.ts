import { describe, expect, it } from 'vitest';
import {
  decideRename,
  renameAvailableAt,
  RENAME_COOLDOWN_DAYS,
  type RenameRequest,
} from '../../server/usernameRename';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-09-10T12:00:00.000Z');

function request(overrides: Partial<RenameRequest> = {}): RenameRequest {
  return {
    uid: 'u1',
    current: 'oldname',
    lastChangedAt: null,
    requested: 'newname',
    ownerOfRequested: null,
    ...overrides,
  };
}

describe('renameAvailableAt', () => {
  it('is null for an account that has never renamed', () => {
    expect(renameAvailableAt(null)).toBeNull();
    expect(renameAvailableAt(undefined)).toBeNull();
  });

  it('is the cooldown past the last change', () => {
    const at = renameAvailableAt('2026-09-01T00:00:00.000Z');
    expect(at).toBe(new Date(Date.parse('2026-09-01T00:00:00.000Z') + RENAME_COOLDOWN_DAYS * DAY).toISOString());
  });

  it('treats an unreadable timestamp as never renamed rather than locking the account', () => {
    // A corrupt value must not be the thing that stops somebody changing their own username
    // forever, and Date.parse of junk is NaN — which every comparison would silently pass.
    expect(renameAvailableAt('not a date')).toBeNull();
  });
});

describe('decideRename', () => {
  it('allows a free name on an account that has never renamed', () => {
    expect(decideRename(request(), NOW)).toEqual({ ok: true, normalized: 'newname' });
  });

  it('normalizes before deciding', () => {
    expect(decideRename(request({ requested: '  NewName  ' }), NOW)).toEqual({
      ok: true,
      normalized: 'newname',
    });
  });

  it('refuses a name that could never be valid', () => {
    const result = decideRename(request({ requested: 'no' }), NOW);
    expect(result).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('refuses a reserved name', () => {
    expect(decideRename(request({ requested: 'admin' }), NOW)).toMatchObject({
      ok: false,
      reason: 'invalid',
    });
  });

  it('refuses a name somebody else owns', () => {
    expect(decideRename(request({ ownerOfRequested: 'someone-else' }), NOW)).toMatchObject({
      ok: false,
      reason: 'taken',
    });
  });

  it('lets somebody re-claim a name they retired themselves', () => {
    // The whole point of never releasing an old handle is that it stays THEIRS — so taking it back
    // has to work, or "reserved for you" is just "gone".
    expect(decideRename(request({ ownerOfRequested: 'u1' }), NOW)).toEqual({
      ok: true,
      normalized: 'newname',
    });
  });

  it('says so when the name is already theirs', () => {
    const result = decideRename(request({ requested: 'oldname', ownerOfRequested: 'u1' }), NOW);
    expect(result).toMatchObject({ ok: false, reason: 'unchanged' });
  });

  it('answers "already yours" before it answers "too soon"', () => {
    // Otherwise somebody who retypes their own name is told to come back in three weeks, and the
    // no-op write that follows would start a fresh cooldown over a change that never happened.
    const result = decideRename(
      request({
        requested: 'oldname',
        ownerOfRequested: 'u1',
        lastChangedAt: new Date(NOW - DAY).toISOString(),
      }),
      NOW,
    );
    expect(result).toMatchObject({ reason: 'unchanged' });
  });

  it('refuses inside the cooldown and says how long is left', () => {
    const result = decideRename(
      { ...request(), lastChangedAt: new Date(NOW - 10 * DAY).toISOString() },
      NOW,
    );
    expect(result).toMatchObject({ ok: false, reason: 'too-soon' });
    expect(result.ok === false && result.message).toContain('20 days');
  });

  it('allows it again once the cooldown has passed', () => {
    const result = decideRename(
      { ...request(), lastChangedAt: new Date(NOW - (RENAME_COOLDOWN_DAYS + 1) * DAY).toISOString() },
      NOW,
    );
    expect(result).toEqual({ ok: true, normalized: 'newname' });
  });

  it('rounds the wait up, so the last day never reads as "0 days"', () => {
    const result = decideRename(
      { ...request(), lastChangedAt: new Date(NOW - (RENAME_COOLDOWN_DAYS * DAY) + 1000).toISOString() },
      NOW,
    );
    expect(result.ok === false && result.message).toContain('1 day');
  });

  it('lets an account with no username yet claim one', () => {
    expect(decideRename(request({ current: null }), NOW)).toEqual({
      ok: true,
      normalized: 'newname',
    });
  });
});
