import { useEffect, useState } from 'react';
import { fetchLiveBenchmark, type BenchmarkQuote } from '../services/benchmark';

export function useLiveBenchmark(symbol: string, enabled: boolean) {
  const [quote, setQuote] = useState<BenchmarkQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setQuote(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchLiveBenchmark(symbol)
      .then((q) => {
        if (!cancelled) setQuote(q);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load live benchmark');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [symbol, enabled]);

  return { quote, loading, error };
}
