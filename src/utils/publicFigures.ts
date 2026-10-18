/**
 * The rules behind the landing page's proof strip, shared by the function that publishes the
 * figures (server/publicStats.ts) and the admin tile that says how close each one is to showing.
 *
 * A proof strip reading "41 traders" is an argument against signing up, so a figure is withheld
 * below a floor; and a count is rounded down to two significant figures with a "+", so 12,437 is
 * published as 12,000+ — true for the whole hour it is cached while trades keep arriving.
 */
export const TRADES_FLOOR = 1_000;
export const TRADERS_FLOOR = 100;
/**
 * Combined P&L across every journal, in dollars. The floor is higher than the others because a
 * dollar figure is read as a performance claim: "$900 combined" says the product's users barely
 * make money, and anything negative says they lose it. Below this it is withheld and the trade
 * count takes its place, which is a fact about journaling rather than about trading.
 */
export const PNL_FLOOR = 10_000;

/** 12,437 → 12,000; 1,874 → 1,800; 437 → 430. Never rounds up, so the "+" is always true. */
export function roundDownForDisplay(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  const digits = Math.floor(Math.log10(n)) + 1;
  const unit = 10 ** Math.max(0, digits - 2);
  return Math.floor(n / unit) * unit;
}

/** What the strip shows for a raw count: the rounded figure, or null while it is under its floor. */
export function publishedFigure(n: number | null, floor: number): number | null {
  return n === null || n < floor ? null : roundDownForDisplay(n);
}
