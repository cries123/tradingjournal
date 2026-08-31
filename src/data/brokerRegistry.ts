/**
 * Single source of truth for every broker Trend Chasers connects to through SnapTrade (the
 * broker-data connection provider — see server/snaptradeClient.ts). Both the client (connect UI,
 * badges, the public Brokers page) and the server (connect/sync/disconnect handler) import from
 * this file, so a broker only ever needs to be added or renamed in one place.
 *
 * `key` is the value sent to POST /api/broker-connect (see server/brokerConnectHandler.ts) and
 * must stay stable once shipped — it's how a user's stored connection maps back to a broker.
 */
/**
 * Operational state of one connector.
 *
 * Connections run through SnapTrade and, for some institutions, through a further network beneath
 * it — Schwab arrives via Akoya. Any of those can break independently of this app, and when they
 * do the user's only signal is being bounced to a blank page on a domain they have never heard of.
 * Saying so on the card is the difference between a known issue and a broken product.
 *
 * 'degraded' still lets someone try; 'down' does not, and the server refuses it too, so a stale
 * page cannot start a connection that is certain to fail.
 */
export interface BrokerStatusNote {
  kind: 'degraded' | 'down';
  /** Shown verbatim to users. Say what is happening and whether their existing data is affected. */
  message: string;
  /** ISO date the issue was first noted, so the copy can age honestly. */
  since?: string;
}

export interface BrokerRegistryEntry {
  /** Stable key used in broker-connect API calls, e.g. 'FIDELITY'. */
  key: string;
  /** Display name shown across the app. */
  name: string;
  /** Slug used to look up a badge/logo (see BrokerLogo.tsx) — kebab-case. */
  brokerId: string;
  /** Lowercase, alphanumeric-only substrings matched against SnapTrade's brokerage name /
   *  display_name (to resolve the real SnapTrade slug) and against a synced account's
   *  institution_name (to group accounts under the right card). Compared via matchesBrokerEntry,
   *  which normalizes both sides the same way, so punctuation/spacing differences don't matter. */
  matchNeedles: string[];
  /** If any of these also match, the broker is excluded even though a needle above matched —
   *  e.g. Webull Canada vs. Webull US. */
  excludeNeedles?: string[];
  /** Every connection this app opens is read-only (see connectionType: 'read' in
   *  server/brokerConnectHandler.ts) — this only reflects how rich SnapTrade's read access is
   *  for the institution, for the badge/copy on the connect page. */
  access: 'Read & sync' | 'Read-only';
  /** Whether a real logo file exists at /broker-logos/{brokerId}.png. Brokers without one show a
   *  generic name badge (see BrokerLogo.tsx) until an official logo asset is added. */
  hasLogo: boolean;
  /** Set when this connector is known to be broken or impaired. Absent means working. */
  status?: BrokerStatusNote;
}

/** Convenience for the common checks, so nothing has to remember the shape of the union. */
export function isBrokerDown(entry: Pick<BrokerRegistryEntry, 'status'>): boolean {
  return entry.status?.kind === 'down';
}

export const BROKER_REGISTRY: BrokerRegistryEntry[] = [
  {
    key: 'SCHWAB',
    name: 'Charles Schwab',
    brokerId: 'schwab',
    matchNeedles: ['schwab'],
    access: 'Read & sync',
    hasLogo: true,
    // Akoya — the network Schwab connections run through beneath SnapTrade — is returning
    // "Subscription unavailable" before the Schwab login is ever reached, so a new connection
    // cannot be established from our side at all. Existing connections and already-imported
    // trades are untouched. Remove this once SnapTrade confirms the connector is restored.
    status: {
      kind: 'down',
      message:
        'New Schwab connections are unavailable while our data provider resolves an issue with ' +
        'Schwab’s connection network. Trades you have already imported are unaffected, and ' +
        'existing connections keep working. Robinhood and manual entry are unaffected.',
      since: '2026-08-31',
    },
  },
  { key: 'ROBINHOOD', name: 'Robinhood', brokerId: 'robinhood', matchNeedles: ['robinhood'], access: 'Read-only', hasLogo: true },
  { key: 'WEBULL', name: 'Webull', brokerId: 'webull', matchNeedles: ['webull'], excludeNeedles: ['canada'], access: 'Read-only', hasLogo: true },
  { key: 'FIDELITY', name: 'Fidelity', brokerId: 'fidelity', matchNeedles: ['fidelity'], access: 'Read-only', hasLogo: true },
  { key: 'ETRADE', name: 'E*TRADE', brokerId: 'etrade', matchNeedles: ['etrade'], access: 'Read-only', hasLogo: true },
  { key: 'INTERACTIVE_BROKERS', name: 'Interactive Brokers', brokerId: 'interactive-brokers', matchNeedles: ['interactivebrokers', 'ibkr'], access: 'Read-only', hasLogo: true },
  { key: 'VANGUARD', name: 'Vanguard', brokerId: 'vanguard', matchNeedles: ['vanguard'], access: 'Read-only', hasLogo: true },
  { key: 'TASTYTRADE', name: 'tastytrade', brokerId: 'tastytrade', matchNeedles: ['tastytrade'], access: 'Read-only', hasLogo: true },
  { key: 'TRADESTATION', name: 'TradeStation', brokerId: 'tradestation', matchNeedles: ['tradestation'], access: 'Read-only', hasLogo: true },
  { key: 'TRADIER', name: 'Tradier', brokerId: 'tradier', matchNeedles: ['tradier'], access: 'Read-only', hasLogo: true },
  { key: 'PUBLIC', name: 'Public', brokerId: 'public', matchNeedles: ['public'], access: 'Read-only', hasLogo: true },
  { key: 'ALPACA', name: 'Alpaca', brokerId: 'alpaca', matchNeedles: ['alpaca'], access: 'Read-only', hasLogo: true },
  { key: 'MOOMOO', name: 'Moomoo', brokerId: 'moomoo', matchNeedles: ['moomoo'], access: 'Read-only', hasLogo: true },
  { key: 'CHASE', name: 'Chase', brokerId: 'chase', matchNeedles: ['chase'], access: 'Read-only', hasLogo: true },
  { key: 'CITI', name: 'Citi', brokerId: 'citi', matchNeedles: ['citi'], access: 'Read-only', hasLogo: true },
  { key: 'EDWARD_JONES', name: 'Edward Jones', brokerId: 'edward-jones', matchNeedles: ['edwardjones'], access: 'Read-only', hasLogo: true },
  { key: 'COINBASE', name: 'Coinbase', brokerId: 'coinbase', matchNeedles: ['coinbase'], access: 'Read-only', hasLogo: true },
  { key: 'TIAA', name: 'TIAA', brokerId: 'tiaa', matchNeedles: ['tiaa'], access: 'Read-only', hasLogo: true },
  { key: 'PNC', name: 'PNC Wealth Management', brokerId: 'pnc', matchNeedles: ['pnc'], access: 'Read-only', hasLogo: true },
];

export type BrokerRegistryKey = (typeof BROKER_REGISTRY)[number]['key'];

/** thinkorswim isn't its own SnapTrade connection — thinkorswim accounts are Schwab accounts
 *  under the hood, so connecting rides on the Schwab connection rather than getting its own
 *  connect button. Still listed as its own named "supported broker" on the public Brokers page. */
export const THINKORSWIM_DISPLAY = {
  name: 'Thinkorswim',
  brokerId: 'thinkorswim',
  ridesOnKey: 'SCHWAB',
} as const;

export function isBrokerRegistryKey(value: string | undefined | null): value is BrokerRegistryKey {
  if (!value) return false;
  return BROKER_REGISTRY.some((b) => b.key === value);
}

export function brokerRegistryEntry(key: string): BrokerRegistryEntry | undefined {
  return BROKER_REGISTRY.find((b) => b.key === key);
}

export function normalizeBrokerName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Whether `name` (a free-text institution/brokerage name, from SnapTrade or elsewhere) refers to
 *  the broker described by `entry`. Both sides are normalized the same way, so punctuation,
 *  spacing, and casing differences (e.g. "E*TRADE" vs "etrade") don't cause a miss. */
export function matchesBrokerEntry(name: string | null | undefined, entry: BrokerRegistryEntry): boolean {
  const norm = normalizeBrokerName(name ?? '');
  if (!norm) return false;
  const matched = entry.matchNeedles.some((n) => norm.includes(normalizeBrokerName(n)));
  const excluded = entry.excludeNeedles?.some((n) => norm.includes(normalizeBrokerName(n))) ?? false;
  return matched && !excluded;
}

/** Finds the registry entry (if any) matching a free-text broker/institution name. */
export function findBrokerEntryByName(name: string | null | undefined): BrokerRegistryEntry | undefined {
  return BROKER_REGISTRY.find((entry) => matchesBrokerEntry(name, entry));
}
