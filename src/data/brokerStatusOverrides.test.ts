import { describe, expect, it } from 'vitest';
import type { BrokerRegistryEntry } from './brokerRegistry';
import {
  applyBrokerStatusOverrides,
  parseBrokerStatusOverrides,
  resolveBrokerStatus,
} from './brokerStatusOverrides';

const working: BrokerRegistryEntry = {
  key: 'ROBINHOOD',
  name: 'Robinhood',
  brokerId: 'robinhood',
  matchNeedles: ['robinhood'],
  access: 'Read & sync',
  hasLogo: true,
};

const broken: BrokerRegistryEntry = {
  ...working,
  key: 'SCHWAB',
  name: 'Charles Schwab',
  status: { kind: 'down', message: 'Schwab is finishing its review.', since: '2026-08-30' },
};

describe('resolveBrokerStatus', () => {
  it('falls back to the registry when nothing is overridden', () => {
    expect(resolveBrokerStatus(broken, {})?.kind).toBe('down');
    expect(resolveBrokerStatus(working, {})).toBeUndefined();
  });

  it('takes a working broker down', () => {
    const status = resolveBrokerStatus(working, {
      ROBINHOOD: { kind: 'down', message: 'Robinhood is refusing new connections.' },
    });
    expect(status?.kind).toBe('down');
    expect(status?.message).toBe('Robinhood is refusing new connections.');
  });

  it('brings a broker the registry calls broken back up — the reason this exists', () => {
    // Testing whether Schwab has recovered used to mean shipping a release to find out.
    expect(resolveBrokerStatus(broken, { SCHWAB: { kind: 'ok' } })).toBeUndefined();
  });

  it('never renders an empty warning box', () => {
    const status = resolveBrokerStatus(broken, { SCHWAB: { kind: 'down', message: '   ' } });
    expect(status?.message.trim().length).toBeGreaterThan(0);
  });

  it('leaves other brokers alone', () => {
    const out = applyBrokerStatusOverrides({ SCHWAB: { kind: 'ok' } }, [working, broken]);
    expect(out.find((b) => b.key === 'ROBINHOOD')?.status).toBeUndefined();
    expect(out.find((b) => b.key === 'SCHWAB')?.status).toBeUndefined();
  });
});

describe('parseBrokerStatusOverrides', () => {
  it('keeps only the shapes it understands', () => {
    const parsed = parseBrokerStatusOverrides({
      SCHWAB: { kind: 'down', message: 'nope' },
      JUNK: { kind: 'exploded' },
      ALSO_JUNK: 'not an object',
      NESTED: null,
    });
    expect(Object.keys(parsed)).toEqual(['SCHWAB']);
  });

  it('survives a missing or malformed document', () => {
    expect(parseBrokerStatusOverrides(undefined)).toEqual({});
    expect(parseBrokerStatusOverrides('nonsense')).toEqual({});
    expect(parseBrokerStatusOverrides(42)).toEqual({});
  });

  it('caps a runaway message rather than rendering it', () => {
    const parsed = parseBrokerStatusOverrides({ X: { kind: 'down', message: 'x'.repeat(5000) } });
    expect(parsed.X.message!.length).toBeLessThanOrEqual(500);
  });
});
