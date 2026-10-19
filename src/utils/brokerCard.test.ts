import { describe, expect, it } from 'vitest';
import { brokerCardState } from './brokerCard';

const base = { institutions: [] as string[], hasBrokerTrades: false, syncsPerDay: 10, syncsUsed: 2 };

describe('brokerCardState', () => {
  it('offers to connect when nothing says a broker is linked', () => {
    expect(brokerCardState(base).connected).toBe(false);
  });

  it('names the institutions this browser last saw, once each', () => {
    const s = brokerCardState({ ...base, institutions: ['Schwab', 'Schwab', 'Robinhood'] });
    expect(s.connected).toBe(true);
    expect(s.name).toBe('Schwab, Robinhood');
  });

  it('still shows the card on another device, where only the trades say a broker is linked', () => {
    const s = brokerCardState({ ...base, hasBrokerTrades: true });
    expect(s.connected).toBe(true);
    expect(s.name).toBe('Your broker');
  });

  it('states the allowance the server enforces', () => {
    expect(brokerCardState({ ...base, institutions: ['Schwab'] }).allowance).toBe('8 of 10 syncs left today');
  });

  it('marks a spent allowance and never goes below zero', () => {
    const s = brokerCardState({ ...base, institutions: ['Schwab'], syncsUsed: 12 });
    expect(s.allowance).toBe('0 of 10 syncs left today');
    expect(s.allowanceSpent).toBe(true);
  });

  it('says nothing about the allowance while it is still loading', () => {
    expect(brokerCardState({ ...base, institutions: ['Schwab'], syncsUsed: null }).allowance).toBeNull();
  });

  it('says nothing about an allowance a plan does not have', () => {
    expect(brokerCardState({ ...base, hasBrokerTrades: true, syncsPerDay: 0 }).allowance).toBeNull();
  });
});
