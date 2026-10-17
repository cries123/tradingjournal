import { describe, expect, it } from 'vitest';
import { isTawkTitleNudge } from './useLiveChat';

/*
 * Tawk flashes "1 new message" into the tab title whenever its automated greeting fires, so every
 * visitor's tab claimed a message nobody had sent. The guard restores the page's own title; this
 * pins down which titles count as the nudge and which are the page's.
 */
describe('isTawkTitleNudge', () => {
  it('recognises the widget’s nudge, singular and plural', () => {
    expect(isTawkTitleNudge('1 new message')).toBe(true);
    expect(isTawkTitleNudge('3 new messages')).toBe(true);
    expect(isTawkTitleNudge('(1) New message')).toBe(true);
  });

  it('leaves the page’s own titles alone', () => {
    expect(isTawkTitleNudge('Trend Chasers — Trading Journal & P&L Calendar')).toBe(false);
    expect(isTawkTitleNudge('Pricing — Trend Chasers Trading Journal')).toBe(false);
    expect(isTawkTitleNudge('Journal — Trend Chasers')).toBe(false);
    expect(isTawkTitleNudge('')).toBe(false);
  });
});
