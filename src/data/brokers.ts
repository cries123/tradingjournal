import { BROKER_REGISTRY, THINKORSWIM_DISPLAY } from './brokerRegistry';

const SCHWAB_STATUS = BROKER_REGISTRY.find((b) => b.key === 'SCHWAB')?.status;

export const SUPPORTED_BROKERS = [
  {
    name: THINKORSWIM_DISPLAY.name,
    // thinkorswim has no connection of its own — it arrives through Schwab, so it is unavailable
    // exactly when Schwab is. Listing it as working while Schwab is down would be a lie by
    // omission on the page people check before signing up.
    detail: SCHWAB_STATUS?.kind === 'down' ? 'Temporarily unavailable' : 'One-tap import via Schwab',
    methods: ['Syncs through the Charles Schwab connection', 'Round-trip trade matching', 'Manual entry always available'],
    status: SCHWAB_STATUS,
  },
  ...BROKER_REGISTRY.map((b) => ({
    name: b.name,
    // A public page that lists a broker as working while its connect button is disabled is worse
    // than one that says nothing — someone signs up for it and finds out afterwards.
    detail: b.status?.kind === 'down' ? 'Temporarily unavailable' : 'One-tap import',
    methods: ['Read-only connection via SnapTrade', 'Round-trip trade matching', 'Manual entry always available'],
    status: b.status,
  })),
];

// Popular brokers we don't yet have a confirmed SnapTrade integration for — manual/CSV entry
// still works for any of these today, this list is just what's next on the roadmap.
export const COMING_SOON_BROKERS = [
  'Ally Invest',
  'SoFi Invest',
  'M1 Finance',
  'Firstrade',
];
