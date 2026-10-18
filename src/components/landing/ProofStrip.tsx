import { useEffect, useState } from 'react';
import { CountUp } from '../motion/CountUp';
import { useInView } from '../../hooks/useInView';
import { fetchPublicStats, type PublicStats } from '../../services/publicStats';
import { proofFigures } from './proofFigures';

const whole = (n: number) => Math.round(n).toLocaleString('en-US');

/**
 * Four figures under the hero. Which four, and why, is proofFigures.ts.
 *
 * The figures count up the first time the strip scrolls into view, and are plain text before
 * that, so the snapshot and screen readers have the final values.
 */
export function ProofStrip() {
  const [stats, setStats] = useState<PublicStats | null>(null);
  const { ref, inView } = useInView(0.3);

  useEffect(() => {
    let cancelled = false;
    void fetchPublicStats().then((s) => {
      if (!cancelled) setStats(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const figures = proofFigures(stats);

  return (
    <section aria-label="Trend Chasers in numbers" className="relative z-10 border-y border-white/5 py-10 md:py-14">
      <div ref={ref}>
      <dl className="mx-auto grid max-w-[1200px] grid-cols-2 gap-x-6 gap-y-10 px-4 md:grid-cols-4 md:px-6">
        {figures.map((f) => (
          <div key={f.key} className="text-center">
            <dt className="sr-only">{f.label}</dt>
            <dd className="public-display text-4xl tabular-nums sm:text-5xl md:text-6xl">
              {f.prefix}
              {inView && f.value > 0 ? <CountUp value={f.value} from={0} format={whole} /> : whole(f.value)}
              {f.suffix && <span className="text-accent">{f.suffix}</span>}
            </dd>
            <dd aria-hidden className="mx-auto mt-3 max-w-[16rem] text-sm leading-snug text-text-secondary">
              {f.label}
            </dd>
          </div>
        ))}
      </dl>
      </div>
    </section>
  );
}
