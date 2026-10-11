import { useCountUp } from '../../hooks/useCountUp';

interface CountUpProps {
  value: number;
  format: (n: number) => string;
  /** Where the first count starts. Omitted, the figure appears at its value and only moves on a change. */
  from?: number;
  className?: string;
}

/**
 * A figure that counts to its value, and rolls from the old value to the new one when it changes.
 *
 * The final figure is laid out underneath, invisible, so the box is the width it will end at from
 * the first frame. Without it "$0.00" grows into "-$2,068.20" over the count and drags everything
 * beside it sideways with it.
 *
 * Screen readers get the final figure once, not forty intermediate ones.
 */
export function CountUp({ value, format, from, className = '' }: CountUpProps) {
  const shown = useCountUp(value, 900, from);
  const final = format(value);

  return (
    <span className={`inline-grid ${className}`}>
      <span aria-hidden className="invisible col-start-1 row-start-1">
        {final}
      </span>
      <span aria-hidden className="col-start-1 row-start-1">
        {format(shown)}
      </span>
      <span className="sr-only">{final}</span>
    </span>
  );
}
