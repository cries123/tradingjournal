import { useEffect, useState, type RefObject } from 'react';

interface StickyCtaProps {
  /** The element whose own call to action this stands in for — shown once it has scrolled away. */
  watch: RefObject<HTMLElement | null>;
  label: string;
  onClick: () => void;
}

/**
 * A pill that follows the reader down the page once the hero's button is gone.
 *
 * The page is long and the button that starts a journal was at the top of it; by the simulator a
 * reader who was convinced had to scroll back up. This appears when the hero leaves the viewport
 * and leaves when it returns, so there is never two of the same button on screen.
 */
export function StickyCta({ watch, label, onClick }: StickyCtaProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = watch.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting), {
      rootMargin: '-80px 0px 0px 0px',
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [watch]);

  return (
    <div className={`sticky-cta ${visible ? 'is-visible' : ''}`} aria-hidden={!visible}>
      <button
        type="button"
        onClick={onClick}
        tabIndex={visible ? 0 : -1}
        className="btn-primary text-sm px-6 py-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.6)]"
      >
        {label}
      </button>
    </div>
  );
}
