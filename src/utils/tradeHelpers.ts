import type { Trade } from '../types';

/** Net P&L after fees (pnl field is net when fees are set). */
export function effectivePnl(trade: Trade): number {
  if (trade.grossPnl != null && trade.fees != null) {
    return trade.grossPnl - trade.fees;
  }
  if (trade.fees != null) return trade.pnl - trade.fees;
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
