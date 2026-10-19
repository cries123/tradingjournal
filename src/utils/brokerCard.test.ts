import { describe, expect, it } from 'vitest';
import { brokerCardState } from './brokerCard';

const base = { institutions: [] as string[], hasBrokerTrades: false, syncsPerDay: 10, syncsUsed: 2, syncedAt: null };

describe('brokerCardState', () => {
  it('offers to connect when nothing says a broker is linked', () => {
    expect(brokerCardState(base).connected).toBe(false);
  });

  it('names the institutions this browser last saw, once each, and logos the first', () => {
    const s = brokerCardState({ ...base, institutions: ['Charles Schwab', 'Charles Schwab', 'Robinhood'] });
    expect(s.connected).toBe(true);
    expect(s.name).toBe('Charles Schwab, Robinhood');
    expect(s.institution).toBe('Charles Schwab');
  });

  it('still shows the card on another device, where only the trades say a broker is linked', () => {
    const s = brokerCardState({ ...base, hasBrokerTrades: true });
    expect(s).toMatchObject({ connected: true, name: 'Your broker', institution: null });
  });

  it('states the allowance the server enforces', () => {
    expect(brokerCardState({ ...base, institutions: ['Schwab'] })).toMatchObject({ left: 8, perDay: 10, spent: false });
  });

  it('marks a spent allowance and never goes below zero', () => {
    expect(brokerCardState({ ...base, institutions: ['Schwab'], syncsUsed: 12 })).toMatchObject({ left: 0, spent: true });
  });

  it('says nothing about the allowance while it is still loading, or on a plan without one', () => {
    expect(brokerCardState({ ...base, institutions: ['Schwab'], syncsUsed: null }).left).toBeNull();
    expect(brokerCardState({ ...base, hasBrokerTrades: true, syncsPerDay: 0 }).left).toBeNull();
  });

  it('carries the last sync only for a connected broker', () => {
    expect(brokerCardState({ ...base, hasBrokerTrades: true, syncedAt: 5 }).syncedAt).toBe(5);
    expect(brokerCardState({ ...base, syncedAt: 5 }).syncedAt).toBeNull();
  });
});
