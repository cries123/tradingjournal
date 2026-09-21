import { describe, it, expect } from 'vitest';
import { parseRoutePath } from './useRoute';

/**
 * The path parser, and mostly the /r/ branch.
 *
 * It is tested because it shipped broken once: the trailing-slash regex lost a backslash, which
 * turned the rest of the line into a comment. Nothing else in the app would have caught that —
 * a record page would simply have rendered the landing page instead.
 */
describe('parseRoutePath', () => {
  it('reads a published record slug', () => {
    expect(parseRoutePath('/r/jaryn')).toEqual({ route: 'track-record', recordSlug: 'jaryn' });
  });

  it('lowercases the slug, because the document id is a lowercased username', () => {
    expect(parseRoutePath('/r/JaRyN').recordSlug).toBe('jaryn');
  });

  it('tolerates a trailing slash', () => {
    // The branch that was broken. A pasted link very often carries one.
    expect(parseRoutePath('/r/jaryn/')).toEqual({ route: 'track-record', recordSlug: 'jaryn' });
  });

  it('falls back to landing when there is no slug after /r/', () => {
    expect(parseRoutePath('/r/')).toEqual({ route: 'landing' });
  });

  it('does not treat /report-bug as a record', () => {
    // /r/ is a prefix of nothing else only because the check requires the second slash — this is
    // the test that keeps it that way.
    expect(parseRoutePath('/report-bug').route).toBe('report-bug');
    expect(parseRoutePath('/request-broker').route).toBe('request-broker');
    expect(parseRoutePath('/refunds').route).toBe('refunds');
  });

  it('still reads the other slug routes', () => {
    expect(parseRoutePath('/guides/free-trading-journal')).toEqual({
      route: 'guide',
      guideSlug: 'free-trading-journal',
    });
    expect(parseRoutePath('/brokers/charles-schwab')).toEqual({
      route: 'broker-guide',
      brokerSlug: 'charles-schwab',
    });
    expect(parseRoutePath('/guides').route).toBe('guides');
    expect(parseRoutePath('/brokers').route).toBe('brokers');
  });

  it('sends anything unrecognised to the landing page', () => {
    expect(parseRoutePath('/nope').route).toBe('landing');
    expect(parseRoutePath('/').route).toBe('landing');
  });
});
