import { BROKER_REGISTRY, type BrokerRegistryEntry, type BrokerStatusNote } from './brokerRegistry';

/**
 * Broker availability, editable without a deploy.
 *
 * Schwab's status was a hardcoded block in the registry, which meant every flip — disable it
 * because it is broken, enable it to test whether it still is — was a code change and a Netlify
 * build. That is a slow, paid way to toggle a boolean, and it guarantees the status is out of date
 * whenever it matters most.
 *
 * An override lives in Firestore and beats whatever the registry says, in both directions: it can
 * take a working broker down, and it can bring one up that the registry still declares broken. The
 * registry keeps its entries as the default, so nothing is lost if the document is empty.
 */

export type BrokerStatusKind = BrokerStatusNote['kind'] | 'ok';

export interface BrokerStatusOverride {
  /** 'ok' clears whatever the registry says — the escape hatch for a stale hardcoded block. */
  kind: BrokerStatusKind;
  message?: string;
  since?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export type BrokerStatusOverrides = Record<string, BrokerStatusOverride>;

export const BROKER_STATUS_DOC = 'config/brokerStatus';

/** The status actually in force for one broker: the override if there is one, else the registry. */
export function resolveBrokerStatus(
  entry: BrokerRegistryEntry,
  overrides: BrokerStatusOverrides | null | undefined,
): BrokerStatusNote | undefined {
  const override = overrides?.[entry.key];
  if (!override) return entry.status;
  if (override.kind === 'ok') return undefined;

  return {
    kind: override.kind,
    // An override with no message would render an empty warning box, which reads as a bug. The
    // registry's own copy is the better fallback, and a generic line is better than nothing.
    message:
      override.message?.trim() ||
      entry.status?.message ||
      'This broker is temporarily unavailable. Your imported trades are unaffected.',
    since: override.since ?? entry.status?.since,
  };
}

/** The registry with every status resolved, ready to render. */
export function applyBrokerStatusOverrides(
  overrides: BrokerStatusOverrides | null | undefined,
  registry: BrokerRegistryEntry[] = BROKER_REGISTRY,
): BrokerRegistryEntry[] {
  return registry.map((entry) => {
    const status = resolveBrokerStatus(entry, overrides);
    return status === entry.status ? entry : { ...entry, status };
  });
}

/** Only the shapes we accept — anything else in the document is ignored rather than trusted. */
export function parseBrokerStatusOverrides(raw: unknown): BrokerStatusOverrides {
  if (!raw || typeof raw !== 'object') return {};

  const out: BrokerStatusOverrides = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const v = value as Record<string, unknown>;
    const kind = v.kind;
    if (kind !== 'ok' && kind !== 'down' && kind !== 'degraded') continue;

    out[key] = {
      kind,
      message: typeof v.message === 'string' ? v.message.slice(0, 500) : undefined,
      since: typeof v.since === 'string' ? v.since : undefined,
      updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : undefined,
      updatedBy: typeof v.updatedBy === 'string' ? v.updatedBy : undefined,
    };
  }
  return out;
}
