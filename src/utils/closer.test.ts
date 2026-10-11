import { describe, expect, it, vi } from 'vitest';
import { createCloser, EXIT_MS } from './closer';

function harness(reduceMotion: boolean) {
  let pending: (() => void) | null = null;
  const finish = vi.fn();
  const markClosing = vi.fn();
  const close = createCloser({
    reduceMotion,
    isClosing: () => pending !== null,
    markClosing,
    schedule: (fn) => {
      pending = fn;
    },
    finish,
  });
  const fire = () => {
    const fn = pending;
    pending = null;
    fn?.();
  };
  return { close, finish, markClosing, fire };
}

describe('createCloser', () => {
  it('plays the dialog out first, then closes it', () => {
    const h = harness(false);
    h.close();
    // Marked closing straight away — that is what swaps in .animate-scale-out — but not yet gone.
    expect(h.markClosing).toHaveBeenCalledTimes(1);
    expect(h.finish).not.toHaveBeenCalled();
    h.fire();
    expect(h.finish).toHaveBeenCalledTimes(1);
  });

  it('closes exactly once however many times it is asked during the exit', () => {
    // Escape pressed during the fade, or Cancel double-clicked: onClose running twice would pop two
    // views off the stack or clear a selection that a second dialog had just set.
    const h = harness(false);
    h.close();
    h.close();
    h.close();
    h.fire();
    expect(h.markClosing).toHaveBeenCalledTimes(1);
    expect(h.finish).toHaveBeenCalledTimes(1);
  });

  it('closes at once under reduced motion, with nothing to wait for', () => {
    const h = harness(true);
    h.close();
    expect(h.finish).toHaveBeenCalledTimes(1);
    expect(h.markClosing).not.toHaveBeenCalled();
  });

  it('waits no longer than the exit animation runs', () => {
    // The CSS animation is 0.18s. If the wait were shorter the dialog would vanish mid-fade; longer,
    // and it would sit on screen faded out, still covering the page it was closing onto.
    expect(EXIT_MS).toBe(180);
  });
});
