export const SUPPORTED_BROKERS = [
  {
    name: 'Thinkorswim',
    detail: 'Screenshot AI + CSV',
    methods: ['AI screenshot parsing from mobile/desktop', 'Schwab account statement CSV (TOS export)'],
  },
  {
    name: 'Schwab',
    detail: 'Account statement CSV',
    methods: ['Account Trade History CSV export', 'Round-trip trade matching'],
  },
  {
    name: 'Robinhood',
    detail: 'Screenshot AI parsing',
    methods: ['AI screenshot parsing from the mobile app', 'Position & P/L screen capture'],
  },
] as const;

export const COMING_SOON_BROKERS = [
  'Interactive Brokers',
  'Webull',
  'Tastytrade',
  'E*TRADE',
  'Fidelity',
  'TradeStation',
];
