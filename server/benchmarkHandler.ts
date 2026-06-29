export interface BenchmarkQuote {
  symbol: string;
  monthToDateReturnPct: number;
  periodReturnPct: number;
  asOf: string;
  source: 'yahoo' | 'manual';
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: (number | null)[] }> };
    }>;
  };
}

function monthStartTimestamp(): number {
  const now = new Date();
  return Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);
}

export async function fetchBenchmarkQuote(symbol = 'SPY'): Promise<BenchmarkQuote | null> {
  const upper = symbol.toUpperCase();
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(upper)}?interval=1d&range=3mo`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; TrendChasers/1.0)',
      Accept: 'application/json',
    },
  });

  if (!res.ok) return null;

  const data = (await res.json()) as YahooChartResponse;
  const result = data.chart?.result?.[0];
  if (!result) return null;

  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const timestamps = result.timestamp ?? [];
  const valid: { t: number; c: number }[] = [];

  for (let i = 0; i < timestamps.length; i++) {
    const c = closes[i];
    if (c != null && c > 0) valid.push({ t: timestamps[i], c });
  }

  if (valid.length < 2) return null;

  const monthStart = monthStartTimestamp();
  const monthBars = valid.filter((b) => b.t >= monthStart);
  const startPrice = monthBars.length > 0 ? monthBars[0].c : valid[valid.length - 2].c;
  const endPrice = valid[valid.length - 1].c;
  const periodStart = valid[0].c;

  const mtd = startPrice > 0 ? ((endPrice - startPrice) / startPrice) * 100 : 0;
  const period = periodStart > 0 ? ((endPrice - periodStart) / periodStart) * 100 : 0;

  return {
    symbol: upper,
    monthToDateReturnPct: Math.round(mtd * 100) / 100,
    periodReturnPct: Math.round(period * 100) / 100,
    asOf: new Date(valid[valid.length - 1].t * 1000).toISOString().slice(0, 10),
    source: 'yahoo',
  };
}

export async function handleBenchmarkRequest(symbol: string | null | undefined): Promise<{
  statusCode: number;
  body: BenchmarkQuote | { error: string };
}> {
  const normalized = (symbol || 'SPY').trim().toUpperCase();
  if (!/^[A-Z0-9.-]{1,12}$/.test(normalized)) {
    return { statusCode: 400, body: { error: 'Invalid symbol' } };
  }

  try {
    const quote = await fetchBenchmarkQuote(normalized);
    if (!quote) {
      return { statusCode: 502, body: { error: 'Benchmark data unavailable' } };
    }
    return { statusCode: 200, body: quote };
  } catch {
    return { statusCode: 502, body: { error: 'Benchmark fetch failed' } };
  }
}
