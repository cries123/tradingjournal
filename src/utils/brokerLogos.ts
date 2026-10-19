import { resolveBroker } from './brokerIds';

/**
 * Official broker logos (transparent PNGs), used to indicate a supported integration only — Trend
 * Chasers is not affiliated with, and not endorsed by, any of these brokers.
 *
 * In a .ts of its own so both the broker grid's BrokerLogo and the sidebar's small logo square read
 * one list. Brokers without an entry have no official file on hand yet and show a generic badge —
 * add a file to public/broker-logos/ and register it here once one is available.
 */
export const BROKER_LOGOS: Record<string, { src: string; name: string }> = {
  thinkorswim: { src: '/broker-logos/thinkorswim.png', name: 'thinkorswim' },
  schwab: { src: '/broker-logos/schwab.png', name: 'Charles Schwab' },
  robinhood: { src: '/broker-logos/robinhood.png', name: 'Robinhood' },
  webull: { src: '/broker-logos/webull.png', name: 'Webull' },
  fidelity: { src: '/broker-logos/fidelity.png', name: 'Fidelity' },
  etrade: { src: '/broker-logos/etrade.png', name: 'E*TRADE' },
  'interactive-brokers': { src: '/broker-logos/interactive-brokers.png', name: 'Interactive Brokers' },
  vanguard: { src: '/broker-logos/vanguard.png', name: 'Vanguard' },
  tastytrade: { src: '/broker-logos/tastytrade.png', name: 'tastytrade' },
  tradestation: { src: '/broker-logos/tradestation.png', name: 'TradeStation' },
  tradier: { src: '/broker-logos/tradier.png', name: 'Tradier' },
  public: { src: '/broker-logos/public.png', name: 'Public' },
  alpaca: { src: '/broker-logos/alpaca.png', name: 'Alpaca' },
  moomoo: { src: '/broker-logos/moomoo.png', name: 'Moomoo' },
  chase: { src: '/broker-logos/chase.png', name: 'Chase' },
  citi: { src: '/broker-logos/citi.png', name: 'Citi' },
  'edward-jones': { src: '/broker-logos/edward-jones.png', name: 'Edward Jones' },
  coinbase: { src: '/broker-logos/coinbase.png', name: 'Coinbase' },
  tiaa: { src: '/broker-logos/tiaa.png', name: 'TIAA' },
  pnc: { src: '/broker-logos/pnc.png', name: 'PNC Wealth Management' },
};

/** The logo file for a broker or institution name, or null when there is none on hand. */
export function brokerLogoSrc(broker: string | null | undefined): string | null {
  if (!broker) return null;
  const resolved = resolveBroker(broker);
  return resolved ? (BROKER_LOGOS[resolved.brokerId]?.src ?? null) : null;
}
