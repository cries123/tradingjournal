import { previousAppPath } from '../utils/appHistory';
import { backLabelForPath } from '../utils/routeLabels';

export interface BackDestination {
  /** "Back to guides", "Back to home" — named, so the link says where it goes. */
  label: string;
  /** Real href, so the link is middle-clickable and shows a destination on hover. */
  href: string;
  goBack: () => void;
}

/**
 * The back link on a content page.
 *
 * `history.back()` rather than navigating to the previous path, so the browser's own forward
 * button keeps working and the entry is not duplicated. It is only used when there is an in-app
 * entry to return to: for someone who arrived from a search result, going back would leave the
 * site, so `onHome` is the honest fallback and the label says home.
 */
export function useBackDestination(onHome: () => void): BackDestination {
  const previous = previousAppPath();

  // Deliberately not memoized: it reads window.history at call time, so a cached closure would be
  // reasoning about an entry that has since moved.
  const goBack = () => {
    if (previousAppPath()) window.history.back();
    else onHome();
  };

  return { label: backLabelForPath(previous), href: previous ?? '/', goBack };
}
