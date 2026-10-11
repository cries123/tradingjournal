import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

/** Fast at first, settling at the end — a number arriving rather than a meter filling. */
export function easeOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - (1 - c) ** 3;
}

/** The value `progress` of the way from `from` to `to`, eased. */
export function tweenValue(from: number, to: number, progress: number): number {
  return from + (to - from) * easeOutCubic(progress);
}

/**
 * A number that animates from wherever it is showing to `target` whenever `target` changes.
 *
 * Starts AT the target, not at zero. The landing page is prerendered and then re-rendered by React,
 * and a figure that began at $0 would flash from the real number to nothing and back on every load.
 * Movement only happens on a change, and a change mid-flight continues from the number on screen
 * rather than jumping. Under reduced motion it goes straight there.
 *
 * `from` is for screens nothing prerenders — the app behind sign-in — where counting up from zero
 * the first time a figure appears is the arrival, not a flash.
 */
export function useCountUp(target: number, durationMs = 900, from?: number): number {
  const reduceMotion = usePrefersReducedMotion();
  const [value, setValue] = useState(() => (reduceMotion ? target : (from ?? target)));
  const shown = useRef(reduceMotion ? target : (from ?? target));

  useEffect(() => {
    const start = shown.current;
    let raf = 0;

    if (reduceMotion || start === target) {
      raf = requestAnimationFrame(() => {
        shown.current = target;
        setValue(target);
      });
      return () => cancelAnimationFrame(raf);
    }

    let startedAt: number | null = null;
    const step = (now: number) => {
      if (startedAt === null) startedAt = now;
      const progress = (now - startedAt) / durationMs;
      const next = progress >= 1 ? target : tweenValue(start, target, progress);
      shown.current = next;
      setValue(next);
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, reduceMotion]);

  return value;
}
