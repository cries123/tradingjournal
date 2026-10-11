import { describe, expect, it } from 'vitest';
import { currentView, popView, pushView } from './viewStack';

describe('viewStack', () => {
  it('goes back to the screen you came from, not to a fixed one', () => {
    // The reported case was brokers -> request a broker -> back landing on the dashboard. That
    // screen is gone; the rule is the same for any drill-down, such as support -> brokers.
    let stack = ['dashboard'];
    stack = pushView(stack, 'support');
    stack = pushView(stack, 'brokers');
    expect(currentView(popView(stack, 'dashboard'), 'dashboard')).toBe('support');
  });

  it('lands on the dashboard when there is nothing behind the current screen', () => {
    expect(currentView(popView(['settings'], 'dashboard'), 'dashboard')).toBe('dashboard');
    expect(popView([], 'dashboard')).toEqual(['dashboard']);
  });

  it('ignores navigating to the screen already showing', () => {
    expect(pushView(['dashboard', 'brokers'], 'brokers')).toEqual(['dashboard', 'brokers']);
  });

  it('treats navigating to the screen behind you as going back', () => {
    // Otherwise dashboard -> settings -> dashboard -> settings grows without bound.
    expect(pushView(['dashboard', 'settings'], 'dashboard')).toEqual(['dashboard']);
  });

  it('does not grow past the cap, and drops the oldest first', () => {
    let stack: string[] = ['a'];
    for (const v of ['b', 'c', 'd', 'e']) stack = pushView(stack, v, 3);
    expect(stack).toEqual(['c', 'd', 'e']);
    expect(currentView(stack, 'a')).toBe('e');
  });

  it('never mutates the stack it was given', () => {
    const original = ['dashboard', 'brokers'];
    pushView(original, 'settings');
    popView(original, 'dashboard');
    expect(original).toEqual(['dashboard', 'brokers']);
  });
});
