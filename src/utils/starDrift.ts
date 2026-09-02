/**
 * The slow drift behind the landing page.
 *
 * Positions are normalised 0-1 and wrapped, so a star that leaves one edge reappears on the
 * opposite one and the field never empties out or needs reseeding. The speed is expressed in
 * pixels per second and converted against the live viewport, so the drift looks the same on a
 * phone as on a wide monitor rather than crawling on one and racing on the other.
 *
 * Deliberately slow: at this rate a star takes minutes to cross the screen. Background motion you
 * can catch yourself watching is motion competing with the page.
 */
export const DRIFT_PX_PER_SEC = 5;

/** Vertical drift, as a fraction of the horizontal. Upward, so the field rises gently. */
const VERTICAL_RATIO = -0.35;

/**
 * How much faster a near star drifts than a far one.
 *
 * Parallax off the radius the star was already given: bigger reads as closer, so it should move
 * more. Without it the whole field slides as one flat sheet, which looks like the page is moving
 * rather than the sky.
 */
export function depthFor(radius: number, min = 0.4, max = 1.7): number {
  const span = max - min;
  const normalised = span > 0 ? Math.min(Math.max((radius - min) / span, 0), 1) : 0.5;
  return 0.6 + normalised * 0.8;
}

/** Keeps a normalised coordinate inside 0-1, wrapping rather than clamping. */
export function wrap01(value: number): number {
  const wrapped = value % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

export interface DriftInput {
  x: number;
  y: number;
  depth: number;
}

/**
 * Where a star sits at time `t`, in normalised coordinates.
 *
 * `t` is the requestAnimationFrame timestamp in milliseconds.
 */
export function driftedPosition(
  star: DriftInput,
  t: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const seconds = t / 1000;
  const travelled = DRIFT_PX_PER_SEC * star.depth * seconds;

  // Guard against a zero-sized canvas, which happens for a frame on some mobile browsers during
  // an orientation change — dividing by it would put every star at NaN and blank the field.
  const dx = width > 0 ? travelled / width : 0;
  const dy = height > 0 ? (travelled * VERTICAL_RATIO) / height : 0;

  return { x: wrap01(star.x + dx), y: wrap01(star.y + dy) };
}

/**
 * A slow sway for the things that must not wrap.
 *
 * The nebula glows and the constellation lines are placed relative to the corners, so drifting
 * them would march them off the screen and leave the composition lopsided. They breathe instead:
 * a sine of a few pixels, on a period of minutes.
 */
export function sway(t: number, periodSeconds: number, amplitude: number, phase = 0): number {
  if (periodSeconds <= 0) return 0;
  return Math.sin((t / 1000) * ((Math.PI * 2) / periodSeconds) + phase) * amplitude;
}
