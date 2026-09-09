import { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { fetchCoaching } from '../services/coachSeat';

/**
 * How many journals this account has been invited to coach.
 *
 * Drives whether the Coaching row appears in the nav at all. A permanent row that says "nobody has
 * invited you" for every user who is not a coach — which is nearly all of them — is a nav item
 * earning its space by advertising a feature rather than doing anything.
 *
 * Asked once per session, not listened to. An invitation arriving mid-session showing up on the
 * next reload is fine; a second Firestore listener on every page load, for a row most people never
 * see, is not.
 */
export function useCoachingCount(): number {
  const { user, firebaseEnabled } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user?.uid || !firebaseEnabled) {
      // Clearing state for a signed-out user, before the fetch below. Same external-system sync
      // the Sidebar's admin check makes, for the same reason.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCount(0);
      return;
    }
    let cancelled = false;
    void fetchCoaching()
      .then(({ journals }) => {
        if (!cancelled) setCount(journals.length);
      })
      .catch(() => {
        // Not a coach, or the endpoint is unreachable. Either way the row stays hidden.
      });
    return () => {
      cancelled = true;
    };
  }, [user?.uid, firebaseEnabled]);

  return count;
}
