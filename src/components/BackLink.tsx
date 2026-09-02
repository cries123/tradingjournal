import { useBackDestination } from '../hooks/useBackDestination';

/**
 * The back link every content page shares.
 *
 * It used to be a hardcoded "Back to home" on each page, which is why clicking into a tutorial and
 * pressing back landed on the landing page instead of the list you were reading. One component
 * means there is one answer to "where does back go", and it is the screen you came from.
 */
export function BackLink({ onHome, className = '' }: { onHome: () => void; className?: string }) {
  const { label, href, goBack } = useBackDestination(onHome);

  return (
    <a
      href={href}
      onClick={(e) => {
        // Let a modified click open the destination in a new tab, the way a real link does.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        goBack();
      }}
      className={`inline-flex items-center gap-2 text-sm text-text-secondary hover:text-emerald-400 transition-colors ${className}`}
    >
      <span aria-hidden>←</span> {label}
    </a>
  );
}
