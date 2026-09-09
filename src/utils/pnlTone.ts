/**
 * The colour a P&L figure is written in.
 *
 * One function rather than a ternary at each call site: green-above-zero is a rule the whole app
 * shares, and the places that inlined it had already drifted into using three different pairs of
 * classes for the same idea.
 */
export function pnlClass(value: number): string {
  return value >= 0 ? 'text-profit-bright' : 'text-loss-bright';
}
