import { describe, expect, it } from 'vitest';
import { nextHistoryState, previousPathFromState } from './appHistory';
import { backLabelForPath, nameForPath } from './routeLabels';

describe('previousPathFromState', () => {
  it('returns the screen behind this one', () => {
    expect(previousPathFromState({ depth: 1, from: '/guides' })).toBe('/guides');
  });

  it('returns nothing for a page the visitor landed on directly', () => {
    // A fresh load, or arriving from a search result: history.state is null and back must not
    // leave the site.
    expect(previousPathFromState(null)).toBeNull();
    expect(previousPathFromState(undefined)).toBeNull();
    expect(previousPathFromState({})).toBeNull();
  });

  it('ignores a history entry written by something other than us', () => {
    expect(previousPathFromState({ depth: 'one', from: '/guides' })).toBeNull();
    expect(previousPathFromState({ depth: 1, from: 'https://example.com' })).toBeNull();
    expect(previousPathFromState({ depth: 1 })).toBeNull();
    expect(previousPathFromState('/guides')).toBeNull();
  });

  it('treats depth zero as no in-app history', () => {
    expect(previousPathFromState({ depth: 0, from: '/guides' })).toBeNull();
  });
});

describe('nextHistoryState', () => {
  it('records the path being left, and counts the push', () => {
    expect(nextHistoryState(null, '/')).toEqual({ depth: 1, from: '/' });
    expect(nextHistoryState({ depth: 1, from: '/' }, '/guides')).toEqual({
      depth: 2,
      from: '/guides',
    });
  });

  it('starts counting from a history entry that is not ours', () => {
    expect(nextHistoryState({ someoneElse: true }, '/guides')).toEqual({ depth: 1, from: '/guides' });
  });
});

describe('nameForPath', () => {
  it('names the sections a back link points at', () => {
    expect(nameForPath('/guides')).toBe('guides');
    expect(nameForPath('/brokers')).toBe('supported brokers');
    expect(nameForPath('/app')).toBe('the journal');
  });

  it('reads a detail page as its section', () => {
    expect(nameForPath('/guides/position-sizing')).toBe('guides');
    expect(nameForPath('/brokers/robinhood')).toBe('supported brokers');
  });

  it('ignores a trailing slash', () => {
    expect(nameForPath('/guides/')).toBe('guides');
    expect(nameForPath('/')).toBe('home');
  });

  it('falls back to home for an unknown path rather than inventing a name', () => {
    expect(nameForPath('/something-else')).toBe('home');
    expect(nameForPath(null)).toBe('home');
  });

  it('reads as a sentence', () => {
    expect(backLabelForPath('/guides')).toBe('Back to guides');
    expect(backLabelForPath(null)).toBe('Back to home');
  });
});
