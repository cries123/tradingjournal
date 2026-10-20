import { useEntitlement } from '../context/useEntitlement';
import { useIsAdmin } from './useIsAdmin';

/**
 * Whether market replay shows for this person, and how.
 *
 * Until MARKET_REPLAY_LIVE it is the site admin's alone, so Jay can use it on his own journal before
 * it is on the plan card, and nobody else sees a button for it. Once live, a plan with it opens it
 * and a plan without it sees the lock, like every other paid feature. The server applies the same
 * rule; this only decides what to draw.
 */
export type ReplayAccess = 'hidden' | 'locked' | 'open';

export function useReplayAccess(): ReplayAccess {
  const { has, marketReplayLive } = useEntitlement();
  const isAdmin = useIsAdmin('replay-admin-check');
  if (isAdmin) return 'open';
  if (!marketReplayLive) return 'hidden';
  return has('marketReplay') ? 'open' : 'locked';
}
