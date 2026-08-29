import { useEffect, useState } from 'react';
import { fetchBenchmark, type BenchmarkQuote } from '../services/benchmark';

/**
 * Loads the benchmark quote for the "you vs the market" comparison.
 *
 * `enabled` exists so we don't spend a request on users who can't see the result anyway — the
 * comparison needs an account size to turn dollars into a percentage, and without one the chip
 * is hidden regardless of what the market did.
 */
export function useBenchmark(enabled: boolean, symbol = 'SPY'): BenchmarkQuote | null {
  const [quote, setQuote] = useState<BenchmarkQuote | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    void fetchBenchmark(symbol).then((result) => {
      if (!cancelled) setQuote(result);
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, symbol]);

  return quote;
}
