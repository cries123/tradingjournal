import { BROKER_REGISTRY, THINKORSWIM_DISPLAY } from './brokerRegistry';

export const SUPPORTED_BROKERS = [
  {
    name: THINKORSWIM_DISPLAY.name,
    detail: 'Automatic sync via Schwab',
    methods: ['Syncs through the Charles Schwab connection', 'Round-trip trade matching', 'Manual entry always available'],
  },
  ...BROKER_REGISTRY.map((b) => ({
    name: b.name,
    detail: 'Automatic sync',
    methods: ['Read-only connection via SnapTrade', 'Round-trip trade matching', 'Manual entry always available'],
  })),
] as const;

// Popular brokers we don't yet have a confirmed SnapTrade integration for — manual/CSV entry
// still works for any of these today, this list is just what's next on the roadmap.
export const COMING_SOON_BROKERS = [
  'Ally Invest',
  'SoFi Invest',
  'M1 Finance',
  'Firstrade',
];
