export interface BenchmarkQuote {
  symbol: string;
  monthToDateReturnPct: number;
  periodReturnPct: number;
  asOf: string;
  source: 'yahoo' | 'manual';
}

export async function fetchLiveBenchmark(symbol = 'SPY'): Promise<BenchmarkQuote | null> {
  const upper = symbol.toUpperCase();

  try {
    const res = await fetch(`/api/benchmark?symbol=${encodeURIComponent(upper)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as BenchmarkQuote | { error?: string };
    if (!('symbol' in data)) return null;
    return data;
  } catch {
    return null;
  }
}
