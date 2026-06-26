import type { Trade } from '../types';

/** Map common tickers to an exchange prefix TradingView understands */
function tvExchangePrefix(symbol: string): string {
  const upper = symbol.toUpperCase();
  if (['SPY', 'QQQ', 'IWM', 'DIA', 'VIX', 'GLD', 'SLV'].includes(upper)) return 'AMEX';
  if (upper.length <= 4) return 'NASDAQ';
  return 'NYSE';
}

export function buildTradingViewUrl(trade: Partial<Trade>): string {
  const symbol = (trade.symbol || 'SPY').toUpperCase().replace(/[^A-Z0-9.]/g, '');
  const prefix = tvExchangePrefix(symbol);
  const params = new URLSearchParams({
    symbol: `${prefix}:${symbol}`,
  });

  if (trade.date) {
    params.set('utm_source', 'trendchasers');
    params.set('utm_medium', 'trade_replay');
  }

  return `https://www.tradingview.com/chart/?${params.toString()}`;
}

/** Deep link that opens symbol page with date context in notes */
export function buildTradingViewReplayUrl(trade: Partial<Trade>): string {
  const base = buildTradingViewUrl(trade);
  if (!trade.date) return base;
  const d = new Date(`${trade.date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return base;
  const params = new URLSearchParams(base.split('?')[1] ?? '');
  params.set('interval', '5');
  return `https://www.tradingview.com/chart/?${params.toString()}`;
}
