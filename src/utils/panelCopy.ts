/**
 * The words on a bar row's meta: "247 trades · 40% win", never "247t · 40%".
 *
 * In a .ts of its own because the panels that use it are components, and a helper exported from a
 * component file is what react-refresh/only-export-components rejects.
 */
export function tradesMeta(trades: number, winRate: number, unit = 'trade'): string {
  return `${trades} ${unit}${trades === 1 ? '' : 's'} · ${Math.round(winRate)}% win`;
}
