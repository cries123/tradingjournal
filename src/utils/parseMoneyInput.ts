/**
 * Reads a number out of a field a person typed or pasted into.
 *
 * The CSV importers already accept what brokers actually emit — "$1,274.22", "(1,274.22)" for a
 * loss — because that is what lands in an export. The manual form did not: it used
 * `<input type="number">`, which silently refuses a pasted value containing a dollar sign or a
 * thousands separator, so pasting the same figure straight off a broker statement left the box
 * empty with no explanation.
 *
 * The three outcomes are kept apart on purpose. A form has to tell "nothing entered" from "zero"
 * from "not a number": blank is a legitimate answer for an optional field, 0.00 is a real P/L on a
 * scratched trade, and garbage deserves a message rather than being quietly read as zero — which
 * is what the CSV parsers do, correctly, for their own case, where a bad cell should not abort an
 * import of two hundred good rows.
 */
export type MoneyInput =
  | { kind: 'empty' }
  | { kind: 'value'; value: number }
  | { kind: 'invalid' };

/** Accounting notation: (1,234.56) means -1234.56. */
const WRAPPED_IN_PARENS = /^\((.*)\)$/;

export function parseMoneyInput(raw: string): MoneyInput {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: 'empty' };

  const parenMatch = WRAPPED_IN_PARENS.exec(trimmed);
  const negatedByParens = parenMatch !== null;
  const body = (parenMatch?.[1] ?? trimmed).trim();

  // Currency symbols, thousands separators and internal spaces are noise a person legitimately
  // pastes; everything else has to survive the check below.
  const cleaned = body.replace(/[$£€¥,\s]/g, '');
  if (!cleaned) return { kind: 'invalid' };

  // Deliberately stricter than parseFloat, which happily reads "12abc" as 12 and would turn a
  // typo into a saved trade.
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(cleaned)) return { kind: 'invalid' };

  const value = Number(cleaned);
  if (!Number.isFinite(value)) return { kind: 'invalid' };

  // A minus inside parentheses is a contradiction, not a double negative.
  if (negatedByParens) return { kind: 'value', value: -Math.abs(value) };
  return { kind: 'value', value };
}

/** Money is added and subtracted here, so binary floating point noise is trimmed at the edge. */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
