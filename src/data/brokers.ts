export const SUPPORTED_BROKERS = [
  {
    name: 'Thinkorswim',
    detail: 'Automatic sync via Schwab',
    methods: ['Syncs through the Charles Schwab connection', 'Round-trip trade matching', 'Manual entry always available'],
  },
  {
    name: 'Schwab',
    detail: 'Automatic sync',
    methods: ['Read-only connection via SnapTrade', 'Round-trip trade matching', 'Manual entry always available'],
  },
  {
    name: 'Robinhood',
    detail: 'Automatic sync',
    methods: ['Read-only connection via SnapTrade', 'Round-trip trade matching', 'Manual entry always available'],
  },
  {
    name: 'Webull',
    detail: 'Automatic sync',
    methods: ['Read-only connection via SnapTrade', 'Round-trip trade matching', 'Manual entry always available'],
  },
] as const;

export const COMING_SOON_BROKERS = [
  'Interactive Brokers',
  'Tastytrade',
  'E*TRADE',
  'Fidelity',
  'TradeStation',
];
