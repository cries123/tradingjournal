import type { ReactNode } from 'react';
import { useInView } from '../../hooks/useInView';

interface FadeInProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

export function FadeIn({ children, className = '', delay = 0 }: FadeInProps) {
  const { ref, inView } = useInView();

  return (
    <div
      ref={ref}
      className={`motion-safe:transition-all motion-safe:duration-700 motion-safe:ease-out ${
        inView ? 'motion-safe:opacity-100 motion-safe:translate-y-0' : 'motion-safe:opacity-0 motion-safe:translate-y-5'
      } ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

interface PageTransitionProps {
  routeKey: string;
  children: ReactNode;
}

export function PageTransition({ routeKey, children }: PageTransitionProps) {
  return (
    <div key={routeKey} className="animate-page-in motion-safe:animate-page-in">
      {children}
    </div>
  );
}
