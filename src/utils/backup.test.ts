import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import type { UserSettings } from '../types/settings';
import type { DayNote } from '../services/dayNotes';
import { buildBackup, parseBackup } from './backup';

/*
 * The backup file is the last line of defence for everything in this app, and it had no tests.
 *
 * Two directions matter and they pull against each other. A file written by a build that is now
 * live in somebody's downloads folder has to keep restoring forever, and a file that has been
 * truncated or hand-edited has to be refused rather than half-applied. Everything below is one or
 * the other.
 */

const settings = { currency: 'USD', setupTags: ['breakout'] } as unknown as UserSettings;

const trade = (over: Partial<Trade> = {}): Trade =>
  ({ id: 't1', date: '2026-09-29', symbol: 'SPY', pnl: 120, ...over }) as Trade;

const note = (over: Partial<DayNote> = {}): DayNote => ({
  date: '2026-09-29',
  note: 'waited for the retest',
  discipline: 4,
  updatedAt: '2026-09-29T21:00:00.000Z',
  ...over,
});

const fileFrom = (backup: unknown): string => JSON.stringify(backup);

describe('buildBackup', () => {
  it('carries the written journal, not just the trades', () => {
    // The gap this closes: day notes live in their own subcollection, so they were never in the
    // trades array, and a file calling itself a full backup silently had none of them.
    const backup = buildBackup([trade()], settings, [note()]);

    expect(backup.dayNotes).toHaveLength(1);
    expect(backup.dayNotes[0].note).toBe('waited for the retest');
    expect(backup.trades).toHaveLength(1);
    expect(backup.version).toBe(2);
  });

  it('round trips through a file', () => {
    const parsed = parseBackup(fileFrom(buildBackup([trade()], settings, [note()])));

    expect(parsed.trades).toHaveLength(1);
    expect(parsed.dayNotes).toEqual([note()]);
    expect(parsed.settings.setupTags).toEqual(['breakout']);
    expect(parsed.exportedAt).toBeTruthy();
  });
});

describe('parseBackup', () => {
  it('still restores a version 1 file, which has no day notes at all', () => {
    /*
     * Every backup anyone already has is version 1. If a missing dayNotes key were treated as
     * corruption, the version bump would have broken restore for every existing file — which is a
     * worse outcome than the gap it was closing.
     */
    const v1 = fileFrom({
      app: 'trend-chasers',
      version: 1,
      exportedAt: '2026-06-01T12:00:00.000Z',
      settings,
      trades: [trade()],
    });

    const parsed = parseBackup(v1);
    expect(parsed.trades).toHaveLength(1);
    expect(parsed.dayNotes).toEqual([]);
  });

  it('refuses a file from a newer build rather than dropping what it does not understand', () => {
    const future = fileFrom({ app: 'trend-chasers', version: 99, trades: [] });
    expect(() => parseBackup(future)).toThrow(/newer version/i);
  });

  it('refuses a malformed day note, because the rest of the file is suspect too', () => {
    const bad = fileFrom({
      app: 'trend-chasers',
      version: 2,
      trades: [trade()],
      dayNotes: [note(), { date: 'yesterday', note: 'oops' }],
    });

    expect(() => parseBackup(bad)).toThrow(/1 malformed day note/);
  });

  it('refuses day notes that are not a list', () => {
    const bad = fileFrom({ app: 'trend-chasers', version: 2, trades: [], dayNotes: { a: 1 } });
    expect(() => parseBackup(bad)).toThrow(/malformed/i);
  });

  it('accepts a note with no discipline rating and no updatedAt', () => {
    // Both are optional in life: a note typed without rating the day, and a note restored from a
    // file that has already been through a restore.
    const sparse = fileFrom({
      app: 'trend-chasers',
      version: 2,
      trades: [],
      dayNotes: [{ date: '2026-09-29', note: 'flat day' }],
    });

    expect(parseBackup(sparse).dayNotes).toHaveLength(1);
  });

  it('counts malformed trades rather than importing them', () => {
    const bad = fileFrom({
      app: 'trend-chasers',
      version: 2,
      trades: [trade(), { id: 'x', date: 'nope', symbol: 'SPY', pnl: 1 }],
    });

    expect(() => parseBackup(bad)).toThrow(/1 malformed trade/);
  });

  it('rejects a file that is not a Trend Chasers backup', () => {
    expect(() => parseBackup(fileFrom({ app: 'something-else', version: 1, trades: [] }))).toThrow(
      /not a Trend Chasers backup/,
    );
    expect(() => parseBackup('not json at all')).toThrow(/valid JSON/);
  });

  it('leaves the coach share token behind', () => {
    // The token belongs to the account that created it; restoring one onto another account would
    // point a coach at the wrong journal.
    const withToken = fileFrom({
      app: 'trend-chasers',
      version: 2,
      trades: [],
      settings: { ...settings, coachShareToken: 'secret', currency: 'USD' },
    });

    expect(parseBackup(withToken).settings).not.toHaveProperty('coachShareToken');
  });
});
