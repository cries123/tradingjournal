export interface BenchmarkQuote {
  symbol: string;
  monthToDateReturnPct: number;
  periodReturnPct: number;
  asOf: string;
  source: 'yahoo' | 'manual';
}

/** Match the Netlify function's own Cache-Control so a month of navigation isn't a month of fetches. */
const CACHE_TTL_MS = 5 * 60 * 1000;

let cached: { at: number; quote: BenchmarkQuote | null } | null = null;
let inFlight: Promise<BenchmarkQuote | null> | null = null;

/**
 * Fetches the benchmark index's return from our own serverless endpoint.
 *
 * Returns null rather than throwing on every failure path — a market-data provider being down
 * should quietly hide one comparison chip, never break the dashboard around it. The result is
 * cached in-module (including the null) so remounting the dashboard doesn't re-fetch, and
 * concurrent callers share one request.
 */
export async function fetchBenchmark(symbol = 'SPY'): Promise<BenchmarkQuote | null> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.quote;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const res = await fetch(`/api/benchmark?symbol=${encodeURIComponent(symbol)}`);
      if (!res.ok) {
        cached = { at: Date.now(), quote: null };
        return null;
      }
      const data = (await res.json()) as BenchmarkQuote;
      const quote = typeof data?.monthToDateReturnPct === 'number' ? data : null;
      cached = { at: Date.now(), quote };
      return quote;
    } catch {
      cached = { at: Date.now(), quote: null };
      return null;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
