import { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { isCurrentUserAdmin } from '../services/admin';
import { reportErrorSilently } from '../services/errorReporting';

/**
 * Whether the signed-in person is the site admin, for showing the Admin link.
 *
 * Shared by the sidebar and the phone's More screen so the two can never disagree about it. False
 * until the check answers, and false when it fails: not being shown the link is the correct outcome
 * of not knowing.
 */
export function useIsAdmin(scope: string): boolean {
  const { user, firebaseEnabled } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user?.uid || !firebaseEnabled) {
      // Clearing state before the fetch below — the external-system sync the rule's own guidance
      // describes as a legitimate effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    void isCurrentUserAdmin(user.uid)
      .then((ok) => {
        if (!cancelled) setIsAdmin(ok);
      })
      // Offline or on a refused read this rejected into the global handler with no scope, which is
      // the anonymous unhandled rejection this repo keeps finding.
      .catch((error: unknown) => {
        reportErrorSilently(error, 'promise', scope);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.uid, firebaseEnabled, scope]);

  return isAdmin;
}
