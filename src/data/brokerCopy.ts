import { BROKER_REGISTRY, THINKORSWIM_DISPLAY } from './brokerRegistry';

/**
 * Marketing copy about broker support, derived from the registry rather than typed out.
 *
 * The landing page used to name "Schwab or Robinhood" in eleven places. Every one of them was
 * written when those were the only two brokers, and none of them were updated when the registry
 * grew to twenty — so the hero advertised two brokers while the FAQ directly below it (which
 * already computed its number from the registry) advertised twenty, and the section listing all
 * twenty logos sat under a sentence saying "more brokers are on the way".
 *
 * Everything here recomputes from BROKER_REGISTRY, so adding a broker updates the whole site.
 */

/** thinkorswim isn't its own registry entry — it rides on the Schwab connection — but it is a
 *  broker a trader would count, so it's included wherever we state a number or list names. */
export const SUPPORTED_BROKER_COUNT = BROKER_REGISTRY.length + 1;

export const SUPPORTED_BROKER_NAMES: string[] = [
  THINKORSWIM_DISPLAY.name,
  ...BROKER_REGISTRY.map((b) => b.name),
];

/**
 * The handful of names most readers will recognise, for sentences that need examples rather than
 * a full list. Pinned to specific brokers instead of just slicing the registry so the examples
 * stay recognisable if the registry is ever reordered — anything missing is simply skipped.
 */
const HEADLINE_ORDER = [
  'Charles Schwab',
  'Fidelity',
  'Robinhood',
  'Interactive Brokers',
  'Webull',
  'E*TRADE',
];

export const HEADLINE_BROKERS: string[] = HEADLINE_ORDER.filter((name) =>
  SUPPORTED_BROKER_NAMES.includes(name),
);

/** e.g. "Schwab, Fidelity, and Robinhood" — Oxford comma, because the rest of the copy uses it. */
export function listBrokers(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

/** "Schwab, Fidelity, and Robinhood" — short names, for tight spots like the hero paragraph. */
export const SHORT_BROKER_EXAMPLES = listBrokers(
  HEADLINE_BROKERS.slice(0, 3).map((n) => (n === 'Charles Schwab' ? 'Schwab' : n)),
);

/** "Schwab, Fidelity, Robinhood, and Interactive Brokers" — for slightly roomier copy. */
export const BROKER_EXAMPLES = listBrokers(
  HEADLINE_BROKERS.slice(0, 4).map((n) => (n === 'Charles Schwab' ? 'Schwab' : n)),
);

/** "20 brokers" / "1 broker" — used mid-sentence, so it carries its own noun. */
export const BROKER_COUNT_PHRASE = `${SUPPORTED_BROKER_COUNT} broker${
  SUPPORTED_BROKER_COUNT === 1 ? '' : 's'
}`;
