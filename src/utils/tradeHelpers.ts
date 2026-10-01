import type { Trade } from '../types';
import { formatCurrency } from './format';

/**
 * Net P&L.
 *
 * Fees are subtracted ONLY when there is a gross to net them against. The trade form labels its
 * field "Net P/L ($)" and types.ts says the same, so a hand-entered pnl is already net — the old
 * middle branch took the fees off a second time, and every screen that reads this disagreed with
 * the one that read trade.pnl directly. Somebody who recorded $100 net with $2 of fees saw $98
 * on one screen and $100 on another, with no way to tell which was lying.
 *
 * Imported trades are unaffected: they carry grossPnl, so they take the first branch.
 */
export function effectivePnl(trade: Trade): number {
  if (trade.grossPnl != null && trade.fees != null) {
    return trade.grossPnl - trade.fees;
  }
  return trade.pnl;
}

export function tradeTags(trade: Trade): string[] {
  const tags = new Set<string>();
  if (trade.setup) tags.add(trade.setup);
  trade.tags?.forEach((t) => tags.add(t));
  return [...tags];
}

export function holdTimeMinutes(trade: Trade): number | null {
  if (!trade.entryTime || !trade.exitTime) return null;
  const [eh, em] = trade.entryTime.split(':').map(Number);
  const [xh, xm] = trade.exitTime.split(':').map(Number);
  if ([eh, em, xh, xm].some((n) => Number.isNaN(n))) return null;
  return xh * 60 + xm - (eh * 60 + em);
}

/**
 * Names a trade in the delete confirmation, and says what else goes with it.
 *
 * There was no confirmation at all: a 14px X beside a 14px edit pencil deleted a trade on one tap,
 * with no undo. A day of 0DTE is a list of rows that look alike, so "Delete this trade?" on its own
 * would not tell anyone whether the right one is about to go — which is most of what a confirmation
 * is for. The annotations get their own sentence because a re-sync restores the fill and never the
 * thinking written on it.
 */
export function describeTradeForDeletion(trade: Trade): string {
  const what = trade.contract?.trim() || trade.symbol;
  const size = trade.quantity ? ` · ${trade.quantity}` : '';
  const written = [
    trade.notes?.trim() ? 'notes' : null,
    trade.tags?.length ? 'tags' : null,
    trade.setup?.trim() ? 'setup' : null,
    trade.grade ? 'grade' : null,
    typeof trade.rMultiple === 'number' ? 'R multiple' : null,
  ].filter((part): part is string => part !== null);

  const parts = [`${what}${size} · ${formatCurrency(trade.pnl)}.`];
  if (written.length) {
    const list =
      written.length === 1
        ? written[0]
        : `${written.slice(0, -1).join(', ')} and ${written[written.length - 1]}`;
    parts.push(`The ${list} you saved on it go too, and a broker sync cannot bring those back.`);
  }
  parts.push('This cannot be undone.');
  return parts.join(' ');
}

export function marketSessionFromTime(time?: string): string | null {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const mins = h * 60 + m;
  if (mins < 570) return 'Premarket';
  if (mins < 630) return 'Open';
  if (mins < 720) return 'Midday';
  if (mins < 960) return 'Close';
  return 'After hours';
}
