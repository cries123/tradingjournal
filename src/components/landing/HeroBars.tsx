import type { CSSProperties } from 'react';

/*
 * Heights as a share of the hero, left to right. Not a staircase — a month has losing days — but
 * tallest towards the right, so the skyline reads as an account that ended up ahead.
 */
const BARS = [0.32, 0.5, 0.41, 0.62, 0.48, 0.74, 0.58, 0.86, 0.7, 0.94, 0.8];

/**
 * The hero's backdrop: eleven dark bars rising behind the headline.
 *
 * It is the product's subject as a silhouette — daily P&L, the thing the calendar shows — drawn
 * with nothing but shape, so the headline over it stays the loudest thing on the screen. The rise
 * is the page's one scripted moment; see .hero-bars in index.css for the motion and its
 * reduced-motion switch.
 */
export function HeroBars() {
  return (
    <div className="hero-bars" aria-hidden>
      {BARS.map((h, i) => (
        <span
          key={i}
          // The two outermost bars are hidden on a phone, where eleven would be slivers.
          className={i === 0 || i === BARS.length - 1 ? 'hidden md:block' : ''}
          style={{ '--h': `${Math.round(h * 100)}%`, '--d': `${i * 70}ms` } as CSSProperties}
        />
      ))}
    </div>
  );
}
