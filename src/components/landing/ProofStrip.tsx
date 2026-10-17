import { useEffect, useState } from 'react';
import { CountUp } from '../motion/CountUp';
import { useInView } from '../../hooks/useInView';
import { SUPPORTED_BROKER_COUNT } from '../../data/brokerCopy';
import { fetchPublicStats, type PublicStats } from '../../services/publicStats';
import { lowestPaidPrice } from '../../seo/pricingClaims';

interface Figure {
  key: string;
  value: number;
  /** Rendered after the number: "+" for a rounded-down live count. */
  suffix?: string;
  prefix?: string;
  label: string;
}

const whole = (n: number) => Math.round(n).toLocaleString('en-US');

/**
 * Four figures under the hero, the way a broker's site states its years and its countries.
 *
 * Two are fixed facts the product can always stand behind — the broker count, read from the same
 * registry the connect screen uses, and the price of starting. Two are live counts from
 * /api/public-stats, and they only appear once the server says they are big enough to be worth
 * saying (see server/publicStats.ts). Until then — or for a visitor with no JavaScript, or a
 * prerendered snapshot — their places are taken by two more fixed facts, so the strip is never a
 * row of zeros and never claims a number nobody counted.
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

  const live: Figure[] = [];
  if (stats?.trades) live.push({ key: 'trades', value: stats.trades, suffix: '+', label: 'trades journaled' });
  if (stats?.traders) live.push({ key: 'traders', value: stats.traders, suffix: '+', label: 'traders keeping a journal' });

  // Facts, not counts: the price is read from the plans like every other price on the site, and
  // the zero is the read-only promise put as a number.
  const fixed: Figure[] = [
    { key: 'sync-price', value: lowestPaidPrice(), prefix: '$', label: 'a month for one-tap broker sync' },
    { key: 'read-only', value: 0, label: 'trades we can place for you — every connection is read-only' },
  ];

  const figures: Figure[] = [
    { key: 'brokers', value: SUPPORTED_BROKER_COUNT, label: 'brokers you can import from' },
    ...live,
    ...fixed.slice(0, 2 - live.length),
    { key: 'price', value: 0, prefix: '$', label: 'to start a journal — no card needed' },
  ];

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
