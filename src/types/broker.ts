export type BrokerIntegrationId = 'schwab' | 'tos' | 'robinhood';

export interface BrokerConnection {
  id: BrokerIntegrationId;
  /** User-facing label, e.g. account nickname */
  label: string;
  connectedAt: string;
  lastSyncAt?: string;
  lastSyncError?: string;
  /** Masked token hint for UI, e.g. ••••1234 */
  tokenHint?: string;
  autoSync: boolean;
}

export interface BrokerSyncRequest {
  broker: BrokerIntegrationId;
  accessToken: string;
  refreshToken?: string;
  accountId?: string;
  sinceDate?: string;
}

export interface BrokerSyncResult {
  trades: Array<{
    date: string;
    symbol: string;
    pnl: number;
    side?: 'long' | 'short';
    setup?: string;
    notes?: string;
    fees?: number;
    quantity?: number;
    entryTime?: string;
    exitTime?: string;
    assetClass?: 'stock' | 'option';
    externalId?: string;
  }>;
  imported: number;
  skipped: number;
  message?: string;
}

export const BROKER_INTEGRATIONS: {
  id: BrokerIntegrationId;
  name: string;
  description: string;
  oauthEnvKey: string;
}[] = [
  {
    id: 'schwab',
    name: 'Charles Schwab',
    description: 'OAuth or developer API token — syncs account transactions.',
    oauthEnvKey: 'SCHWAB_CLIENT_ID',
  },
  {
    id: 'tos',
    name: 'thinkorswim',
    description: 'Uses Schwab API (TOS accounts migrated to Schwab credentials).',
    oauthEnvKey: 'SCHWAB_CLIENT_ID',
  },
  {
    id: 'robinhood',
    name: 'Robinhood',
    description: 'Personal access token from Robinhood developer settings.',
    oauthEnvKey: 'ROBINHOOD_CLIENT_ID',
  },
];
