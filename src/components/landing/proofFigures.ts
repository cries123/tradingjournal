import { SUPPORTED_BROKER_COUNT } from '../../data/brokerCopy';
import type { PublicStats } from '../../services/publicStats';
import { lowestPaidPrice } from '../../seo/pricingClaims';

export interface ProofFigure {
  key: string;
  value: number;
  /** Rendered after the number: "+" for a rounded-down live figure. */
  suffix?: string;
  prefix?: string;
  label: string;
}

/** How many of the four places go to live figures when the server has them. */
const LIVE_SLOTS = 2;

/**
 * The four figures under the hero, the way a broker's site states its years and its countries.
 *
 * Two are fixed facts the product can always stand behind — the broker count, read from the same
 * registry the connect screen uses, and the price of starting. Two are live from
 * /api/public-stats, and they only appear once the server says they are big enough to be worth
 * saying (see server/publicStats.ts). Until then — or for a visitor with no JavaScript, or a
 * prerendered snapshot — their places are taken by two more fixed facts, so the strip is never a
 * row of zeros and never claims a number nobody counted.
 *
 * Combined P&L is the first live figure because it is the one a trader cares about; the trade
 * count stands in for it only while the P&L is withheld — under its floor, or negative — since a
 * count of entries is a fact about journaling, not a claim about trading.
 */
export function proofFigures(stats: PublicStats | null): ProofFigure[] {
  const live: ProofFigure[] = [];
  if (stats?.pnl) {
    live.push({ key: 'pnl', value: stats.pnl, prefix: '$', suffix: '+', label: 'combined P&L across every journal' });
  } else if (stats?.trades) {
    live.push({ key: 'trades', value: stats.trades, suffix: '+', label: 'trades journaled' });
  }
  if (stats?.traders) live.push({ key: 'traders', value: stats.traders, suffix: '+', label: 'traders keeping a journal' });

  // Facts, not counts: the price is read from the plans like every other price on the site, and
  // the zero is the read-only promise put as a number.
  const fixed: ProofFigure[] = [
    { key: 'sync-price', value: lowestPaidPrice(), prefix: '$', label: 'a month for one-tap broker sync' },
    { key: 'read-only', value: 0, label: 'trades we can place for you — every connection is read-only' },
  ];

  return [
    { key: 'brokers', value: SUPPORTED_BROKER_COUNT, label: 'brokers you can import from' },
    ...live,
    ...fixed.slice(0, LIVE_SLOTS - live.length),
    { key: 'price', value: 0, prefix: '$', label: 'to start a journal — no card needed' },
  ];
}
