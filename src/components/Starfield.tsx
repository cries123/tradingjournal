import { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  r: number;
  base: number;
  twinkle: boolean;
  phase: number;
  speed: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.trim().replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const bigint = parseInt(full, 16);
  if (Number.isNaN(bigint)) return [52, 211, 153];
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

// A couple of faint constellation lines, hand-placed near the top corners — echoes the same
// motif already used in the trade-recap share cards, so the two feel like one visual family.
const LINES: [number, number, number, number][] = [
  [0.08, 0.14, 0.16, 0.24],
  [0.16, 0.24, 0.25, 0.17],
  [0.82, 0.1, 0.9, 0.2],
  [0.9, 0.2, 0.97, 0.13],
];

interface StarfieldProps {
  /**
   * When true (the default), the nebula glow reads the live theme accent
   * (--color-profit-bright / --color-accent, set on document.documentElement by
   * SettingsContext) and re-reads it whenever those variables change — used throughout the
   * authenticated app, where the background should track whatever accent the user picked in
   * Settings.
   *
   * Pass false to always use the fixed brand emerald/blue pair and ignore the live theme —
   * used on brand-locked surfaces (the public landing page) that intentionally keep one look
   * regardless of what a signed-in user later picks, same reasoning as the logo staying fixed.
   */
  reactive?: boolean;
}

/**
 * Fixed, full-viewport decorative starfield behind the app shell — a soft nebula glow, faint
 * (some gently twinkling) stars, and a couple of constellation lines. This is the "Milky Way"
 * treatment approved from the background-options mockup, now wired into the real app.
 *
 * Purely decorative: fixed position, zero layout footprint (doesn't affect any surrounding
 * layout), pointer-events disabled, and freezes to a static frame under prefers-reduced-motion.
 */
export function Starfield({ reactive = true }: StarfieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);
  const colorsRef = useRef<[string, string]>(['#34d399', '#38bdf8']);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    const context = canvasEl?.getContext('2d');
    if (!canvasEl || !context) return;
    // Re-typed as non-nullable locals: TS's control-flow narrowing above doesn't carry into the
    // nested function declarations below (each is its own closure), so without this every ctx/
    // canvas access inside them would need a manual non-null assertion.
    const canvas: HTMLCanvasElement = canvasEl;
    const ctx: CanvasRenderingContext2D = context;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function refreshColors() {
      if (!reactive) return; // colorsRef already holds the fixed emerald/blue default — never overwritten.
      const styles = getComputedStyle(document.documentElement);
      const profit = styles.getPropertyValue('--color-profit-bright').trim() || '#34d399';
      const accent = styles.getPropertyValue('--color-accent').trim() || '#38bdf8';
      colorsRef.current = [profit, accent];
    }

    function seed(w: number, h: number) {
      const count = Math.round((w * h) / 4200);
      const stars: Star[] = [];
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random(),
          y: Math.random(),
          r: 0.4 + Math.random() * 1.3,
          base: 0.18 + Math.random() * 0.55,
          twinkle: Math.random() < 0.18,
          phase: Math.random() * Math.PI * 2,
          speed: 0.6 + Math.random() * 1.1,
        });
      }
      starsRef.current = stars;
    }

    function draw(t: number) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      const [pr, pg, pb] = hexToRgb(colorsRef.current[0]);
      const [ar, ag, ab] = hexToRgb(colorsRef.current[1]);

      const g1 = ctx.createRadialGradient(w * 0.12, h * 0.08, 0, w * 0.12, h * 0.08, Math.max(w, h) * 0.5);
      g1.addColorStop(0, `rgba(${pr},${pg},${pb},0.14)`);
      g1.addColorStop(1, `rgba(${pr},${pg},${pb},0)`);
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, w, h);

      const g2 = ctx.createRadialGradient(w * 0.92, h * 0.85, 0, w * 0.92, h * 0.85, Math.max(w, h) * 0.45);
      g2.addColorStop(0, `rgba(${ar},${ag},${ab},0.1)`);
      g2.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(148,197,255,0.12)';
      ctx.lineWidth = 1;
      LINES.forEach(([x1, y1, x2, y2]) => {
        ctx.beginPath();
        ctx.moveTo(x1 * w, y1 * h);
        ctx.lineTo(x2 * w, y2 * h);
        ctx.stroke();
      });

      starsRef.current.forEach((s) => {
        let a = s.base;
        if (s.twinkle && !reduceMotion) {
          a = s.base + Math.sin(t * 0.001 * s.speed + s.phase) * 0.35;
          if (a < 0.05) a = 0.05;
        }
        ctx.beginPath();
        ctx.fillStyle = `rgba(241,245,249,${a.toFixed(3)})`;
        ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed(w, h);
      draw(0);
    }

    refreshColors();
    resize();
    window.addEventListener('resize', resize);

    // Settings writes the accent colors as inline custom properties on <html> — watch for that so
    // switching theme accent (emerald/cyan/violet) updates the nebula glow without a reload.
    // Skipped entirely on brand-locked surfaces (reactive={false}) since there's nothing to watch.
    let observer: MutationObserver | null = null;
    if (reactive) {
      observer = new MutationObserver(() => {
        refreshColors();
        if (reduceMotion) draw(0);
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    }

    function loop(t: number) {
      draw(t);
      rafRef.current = requestAnimationFrame(loop);
    }
    if (!reduceMotion) {
      rafRef.current = requestAnimationFrame(loop);
    }

    return () => {
      window.removeEventListener('resize', resize);
      observer?.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [reactive]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="starfield-canvas"
    />
  );
}
