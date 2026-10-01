import { describe, expect, it } from 'vitest';
import { topAppFrame } from './errorFingerprint';

/*
 * Grouping an iPhone's errors.
 *
 * topAppFrame dropped stack line 0 unconditionally, on the assumption it repeats the message. V8
 * does that; WebKit does not — on Safari line 0 is already a frame. So every iOS report lost its
 * top frame, and one defect split into several rows.
 *
 * That is not cosmetic. The broker-sync failure that cost a customer appeared twice under two
 * fingerprints, 41 and 43 minutes apart, each showing "1 time". Two rows reading "1 time" look like
 * noise. One row reading "2 times, 1 user, mid-sync" is a bug report.
 */

describe('topAppFrame on a WebKit stack', () => {
  it('keeps the first frame instead of eating it', () => {
    // Safari's real shape: no message line, function@url.
    const stack = [
      'json@[native code]',
      'Ss@https://trendchasers.net/assets/JournalApp-glnQ1a7x.js:12:3456',
    ].join('\n');

    expect(topAppFrame(stack)).toContain('json@[native code]');
  });

  it('groups the same failure the same way when Safari inserts an async frame', () => {
    const withoutResume = ['json@[native code]', 'Ss@https://x/assets/JournalApp-aaaaaaaa.js:1:1'].join(
      '\n',
    );
    const withResume = [
      'json@[native code]',
      'asyncFunctionResume@[native code]',
      'Ss@https://x/assets/JournalApp-aaaaaaaa.js:1:1',
    ].join('\n');

    expect(topAppFrame(withResume)).toBe(topAppFrame(withoutResume));
  });

  it('survives a one-line stack rather than returning nothing', () => {
    // Dropping line 0 left this empty, which grouped it with every other frameless error.
    expect(topAppFrame('json@[native code]')).toContain('json@[native code]');
  });
});

describe('topAppFrame on a V8 stack', () => {
  it('still drops the message line', () => {
    const stack = [
      'TypeError: Cannot read properties of undefined',
      '    at Object.sync (https://trendchasers.net/assets/JournalApp-aaaaaaaa.js:1:1)',
    ].join('\n');

    const out = topAppFrame(stack);
    expect(out).not.toContain('TypeError');
    expect(out).toContain('Object.sync');
  });

  it('still walks past vendor frames to our own code', () => {
    const stack = [
      'Error: boom',
      '    at https://trendchasers.net/assets/firebase-aaaaaaaa.js:1:1',
      '    at Object.sync (https://trendchasers.net/assets/JournalApp-bbbbbbbb.js:1:1)',
    ].join('\n');

    expect(topAppFrame(stack)).toContain('Object.sync');
  });

  it('is stable across a redeploy, so a chunk hash does not split the group', () => {
    const before = 'Error: boom\n    at Object.sync (https://x/assets/JournalApp-aaaaaaaa.js:1:1)';
    const after = 'Error: boom\n    at Object.sync (https://x/assets/JournalApp-zzzzzzzz.js:1:1)';

    expect(topAppFrame(before)).toBe(topAppFrame(after));
  });
});
