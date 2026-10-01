import type { ReactNode } from 'react';

interface AdminUserRefProps {
  uid: string;
  children: ReactNode;
  /** Opens that person's detail modal. Omitted on surfaces that have no user list loaded. */
  onOpen?: (uid: string) => void;
  /** Whether this uid is in the loaded user list. Omitted means "assume it is". */
  canOpen?: (uid: string) => boolean;
  className?: string;
}

/**
 * A person's name, where the panel naming them is not the Users tab.
 *
 * Support tickets, error events and the costs breakdown all name someone and all left the reader to
 * copy the uid, switch tab, paste it into the search box and click the row. This is that trip in one
 * click — the detail modal renders at page level, so it opens over whichever tab asked for it.
 *
 * It renders plain text rather than a dead button when the uid cannot be resolved, which happens for
 * tickets and errors belonging to a deleted account. A control that does nothing when pressed is the
 * thing this panel had too much of already.
 */
export function AdminUserRef({ uid, children, onOpen, canOpen, className }: AdminUserRefProps) {
  if (!onOpen || (canOpen && !canOpen(uid))) return <>{children}</>;

  return (
    <button
      type="button"
      onClick={() => onOpen(uid)}
      className={`text-left underline decoration-dotted decoration-border underline-offset-2 hover:text-text-primary hover:decoration-text-secondary transition-colors focus-ring rounded ${className ?? ''}`}
    >
      {children}
    </button>
  );
}
