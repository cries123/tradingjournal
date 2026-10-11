import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Renders its children only once they are about to scroll into view.
 *
 * For the landing page's heavier demos — the Performance panels and the rule simulator bring the
 * analytics and the simulator with them. Behind React.lazy they are separate downloads; behind this
 * they are not even requested until the visitor is a screen away, so the first paint costs what it
 * did before they existed. The placeholder holds their height so nothing jumps when they arrive.
 */
export function LazyOnView({
  children,
  minHeight,
  rootMargin = '600px 0px',
}: {
  children: ReactNode;
  minHeight: string;
  rootMargin?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  const placeholder = <div className="rounded-2xl border border-border/40 bg-bg-secondary/20" style={{ minHeight }} />;

  // The height is held by the placeholder only — once the real section renders it takes its own
  // height, rather than sitting inside a box sized for a guess.
  return <div ref={ref}>{near ? <Suspense fallback={placeholder}>{children}</Suspense> : placeholder}</div>;
}
