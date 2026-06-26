import type { BrokerSyncRequest, BrokerSyncResult } from '../src/types/broker';
import { parseBrokerCsv } from '../src/utils/parseCsvRouter';

interface SchwabTransaction {
  transactionId?: string;
  activityId?: string;
  netAmount?: number;
  amount?: number;
  transactionDate?: string;
  tradeDate?: string;
  symbol?: string;
  description?: string;
  fees?: number;
  quantity?: number;
  price?: number;
  type?: string;
  positionEffect?: string;
}

interface SchwabAccount {
  accountNumber?: string;
  hashValue?: string;
}

function isoDate(raw?: string): string {
  if (!raw) return new Date().toISOString().slice(0, 10);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function mapSchwabTransactions(rows: SchwabTransaction[]): BrokerSyncResult['trades'] {
  const trades: BrokerSyncResult['trades'] = [];

  for (const row of rows) {
    const amount = row.netAmount ?? row.amount;
    if (amount == null || amount === 0) continue;
    const type = (row.type ?? row.description ?? '').toLowerCase();
    if (!type.includes('trade') && !row.symbol) continue;

    const symbol = (row.symbol ?? 'UNKNOWN').toUpperCase();
    trades.push({
      date: isoDate(row.transactionDate ?? row.tradeDate),
      symbol,
      pnl: amount,
      side: (row.quantity ?? 0) < 0 ? 'short' : 'long',
      fees: row.fees,
      quantity: row.quantity != null ? Math.abs(row.quantity) : undefined,
      notes: row.description,
      externalId: row.transactionId ?? row.activityId,
      assetClass: 'stock',
    });
  }

  return trades;
}

async function fetchSchwabTransactions(req: BrokerSyncRequest): Promise<BrokerSyncResult['trades']> {
  const base = 'https://api.schwabapi.com/trader/v1';
  const headers = { Authorization: `Bearer ${req.accessToken}`, Accept: 'application/json' };

  let accountHash = req.accountId;
  if (!accountHash) {
    const accountsRes = await fetch(`${base}/accounts/accountNumbers`, { headers });
    if (!accountsRes.ok) {
      const err = await accountsRes.text();
      throw new Error(`Schwab accounts failed (${accountsRes.status}): ${err.slice(0, 200)}`);
    }
    const accounts = (await accountsRes.json()) as SchwabAccount[];
    accountHash = accounts[0]?.hashValue ?? accounts[0]?.accountNumber;
    if (!accountHash) throw new Error('No Schwab accounts found for this token.');
  }

  const start = req.sinceDate ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const end = new Date().toISOString().slice(0, 10);
  const url = `${base}/accounts/${encodeURIComponent(accountHash)}/transactions?startDate=${start}&endDate=${end}&types=TRADE`;

  const txRes = await fetch(url, { headers });
  if (!txRes.ok) {
    const err = await txRes.text();
    throw new Error(`Schwab transactions failed (${txRes.status}): ${err.slice(0, 200)}`);
  }

  const payload = (await txRes.json()) as { transactions?: SchwabTransaction[] } | SchwabTransaction[];
  const rows = (Array.isArray(payload) ? payload : payload.transactions ?? []) as SchwabTransaction[];
  return mapSchwabTransactions(rows);
}

async function fetchRobinhoodTransactions(req: BrokerSyncRequest): Promise<BrokerSyncResult['trades']> {
  const headers = {
    Authorization: `Bearer ${req.accessToken}`,
    Accept: 'application/json',
  };

  const res = await fetch('https://api.robinhood.com/options/orders/?state=filled&page_size=100', { headers });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Robinhood sync failed (${res.status}): ${err.slice(0, 200)}`);
  }

  const data = (await res.json()) as { results?: Array<Record<string, unknown>> };
  const trades: BrokerSyncResult['trades'] = [];

  for (const order of data.results ?? []) {
    const pnl = Number(order.processed_premium ?? order.price ?? 0);
    if (!pnl) continue;
    trades.push({
      date: isoDate(String(order.updated_at ?? order.created_at ?? '')),
      symbol: String(order.chain_symbol ?? order.symbol ?? 'UNKNOWN').toUpperCase(),
      pnl,
      side: String(order.direction ?? 'debit').includes('credit') ? 'short' : 'long',
      quantity: Number(order.quantity ?? 0) || undefined,
      externalId: String(order.id ?? ''),
      assetClass: order.chain_symbol ? 'option' : 'stock',
    });
  }

  return trades;
}

/** Fallback: user pastes a CSV export URL or raw CSV in accessToken field prefixed with csv: */
function parseCsvTokenPayload(token: string): BrokerSyncResult['trades'] {
  const csv = token.startsWith('csv:') ? token.slice(4) : token;
  return parseBrokerCsv(csv).map((t) => ({
    date: t.date,
    symbol: t.symbol,
    pnl: t.pnl,
    side: t.side,
    setup: t.setup,
    notes: t.notes,
    fees: t.fees,
    quantity: t.quantity,
    entryTime: t.entryTime,
    exitTime: t.exitTime,
    assetClass: t.assetClass === 'option' ? 'option' : t.assetClass === 'stock' ? 'stock' : undefined,
  }));
}

export async function handleBrokerSyncRequest(body: BrokerSyncRequest): Promise<BrokerSyncResult> {
  const { broker, accessToken, sinceDate } = body;

  if (!accessToken?.trim()) {
    throw new Error('Missing access token');
  }

  let trades: BrokerSyncResult['trades'] = [];

  if (accessToken.startsWith('csv:') || accessToken.includes('Date,Action,Symbol')) {
    trades = parseCsvTokenPayload(accessToken);
  } else {
    switch (broker) {
      case 'schwab':
      case 'tos':
        trades = await fetchSchwabTransactions(body);
        break;
      case 'robinhood':
        trades = await fetchRobinhoodTransactions(body);
        break;
      default:
        throw new Error(`Unsupported broker: ${broker}`);
    }
  }

  if (sinceDate) {
    trades = trades.filter((t) => t.date >= sinceDate);
  }

  return {
    trades,
    imported: trades.length,
    skipped: 0,
    message: trades.length ? `Synced ${trades.length} trades` : 'No new trades in range',
  };
}
