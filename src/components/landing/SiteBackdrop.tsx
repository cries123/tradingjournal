import { Starfield } from '../Starfield';

/**
 * The background every public page shares.
 *
 * Only the home page had the starfield; pricing, brokers, guides, help and the legal pages were flat
 * black with a faint grid, so clicking from the landing page to pricing felt like leaving the site.
 * This is one component so they cannot drift apart again.
 *
 * Three layers, all fixed and behind the content (every public page's <main> is relative z-10):
 * the starfield, the grid, and a slow aurora — two blurred emerald/cyan glows drifting over about
 * half a minute. Pure CSS apart from the starfield's canvas; all of it stops under reduced motion.
 */
export function SiteBackdrop() {
  return (
    <>
      {/* reactive={false}: public pages keep the fixed emerald/blue brand look whatever Theme accent a
          signed-in user picked in Settings — same reasoning as the logo. */}
      {/* subtle: on a pure-black site the full field reads as noise behind 56px headlines. */}
      <Starfield reactive={false} drift subtle />
      <div className="site-aurora" aria-hidden />
      <div className="landing-grid pointer-events-none fixed inset-0" aria-hidden />
    </>
  );
}

/**
 * A faint equity curve that draws itself behind the hero — the product's whole subject, sketched.
 *
 * Decorative only: aria-hidden, no data behind it, and drawn once rather than looping, so it adds a
 * moment of motion on arrival without competing with the live preview beside it.
 */
export function HeroTrendLine() {
  return (
    <svg
      className="hero-trend-line pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[55%] w-full"
      viewBox="0 0 1200 400"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="hero-trend-stroke" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0" />
          <stop offset="30%" stopColor="#34d399" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <path
        pathLength={1}
        d="M0 330 L70 310 L120 322 L180 280 L240 296 L300 250 L350 262 L410 228 L470 246 L520 200 L580 214 L640 176 L690 196 L750 150 L810 168 L870 128 L920 142 L980 104 L1040 118 L1100 80 L1160 92 L1200 60"
        fill="none"
        stroke="url(#hero-trend-stroke)"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
