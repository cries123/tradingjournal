import { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { subscribeToMyTickets } from '../services/supportTickets';

/**
 * How many of this user's tickets have a reply they haven't opened.
 *
 * A support reply that nobody sees is the same as no reply. Email is the usual answer to that, and
 * this app has no mail provider — so the badge in the sidebar is what closes the loop: the next
 * time they open the journal, the answer is visibly waiting.
 *
 * One listener, on a query already filtered to their own uid, and only while signed in.
 */
export function useSupportUnread(): number {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  // The uid is stored WITH the count rather than reset when it changes. Two reasons: signing out
  // no longer needs a setState inside the effect (which cascades a render), and a count fetched
  // for one account can never be rendered against another — it simply doesn't match.
  const [seen, setSeen] = useState<{ uid: string; count: number } | null>(null);

  useEffect(() => {
    if (!uid) return;

    const unsub = subscribeToMyTickets(
      uid,
      (tickets) => setSeen({ uid, count: tickets.filter((t) => t.unreadForUser).length }),
      // A rules failure or an offline start must not break the sidebar; no badge is the right
      // answer when we can't know.
      () => setSeen({ uid, count: 0 }),
    );
    return unsub;
  }, [uid]);

  return uid && seen?.uid === uid ? seen.count : 0;
}
