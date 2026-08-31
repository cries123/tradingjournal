import { describe, expect, it } from 'vitest';
import { BROKER_REGISTRY, brokerRegistryEntry, isBrokerDown } from './brokerRegistry';
import { SUPPORTED_BROKERS } from './brokers';

describe('broker status', () => {
  it('treats a broker with no status as working', () => {
    expect(isBrokerDown({ status: undefined })).toBe(false);
  });

  it('blocks only "down", not "degraded"', () => {
    // Degraded still lets someone try — it may work, and refusing outright would be worse than a
    // warning. Down is a certainty, so it is refused.
    expect(isBrokerDown({ status: { kind: 'degraded', message: 'slow' } })).toBe(false);
    expect(isBrokerDown({ status: { kind: 'down', message: 'off' } })).toBe(true);
  });

  it('every status carries a message, because the message is the whole point', () => {
    for (const entry of BROKER_REGISTRY) {
      if (!entry.status) continue;
      expect(entry.status.message.trim().length, `${entry.key} status message`).toBeGreaterThan(20);
    }
  });

  it('keeps Schwab reachable in the registry while it is down', () => {
    // Down must not mean removed: existing connections still sync and the key has to keep
    // resolving, or a user with a live Schwab connection loses access to their own account.
    const schwab = brokerRegistryEntry('SCHWAB');
    expect(schwab).toBeDefined();
    expect(schwab?.name).toBe('Charles Schwab');
  });
});

describe('the public brokers page agrees with the registry', () => {
  it('never advertises a down broker as working', () => {
    // Someone reads this page before signing up. Listing a broker as "One-tap import" while its
    // connect button is disabled is how a new user finds out afterwards.
    const downNames = BROKER_REGISTRY.filter((b) => b.status?.kind === 'down').map((b) => b.name);
    for (const name of downNames) {
      const listed = SUPPORTED_BROKERS.find((b) => b.name === name);
      expect(listed?.detail, `${name} on the public page`).toBe('Temporarily unavailable');
    }
  });

  it('marks thinkorswim unavailable whenever Schwab is, since it has no connection of its own', () => {
    const schwabDown = BROKER_REGISTRY.find((b) => b.key === 'SCHWAB')?.status?.kind === 'down';
    const tos = SUPPORTED_BROKERS.find((b) => b.name.toLowerCase().includes('thinkorswim'));
    expect(tos).toBeDefined();
    if (schwabDown) expect(tos?.detail).toBe('Temporarily unavailable');
  });
});
