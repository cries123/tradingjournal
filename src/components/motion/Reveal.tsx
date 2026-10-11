import type { CSSProperties, ReactNode } from 'react';
import { useReveal } from '../../hooks/useReveal';

/**
 * A block that rises into place the first time it scrolls into view — see .reveal in index.css.
 *
 * For blocks that are not already a card with a root of their own; a card that is (PanelShell)
 * takes useReveal directly, so the grid it sits in still stretches the card and not a wrapper.
 */
export function Reveal({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  /** Milliseconds, for staggering blocks that arrive together. */
  delay?: number;
}) {
  const { ref, revealProps } = useReveal();
  const style = delay ? ({ '--reveal-delay': `${delay}ms` } as CSSProperties) : undefined;

  return (
    <div ref={ref} {...revealProps} style={style} className={`reveal ${className}`}>
      {children}
    </div>
  );
}
