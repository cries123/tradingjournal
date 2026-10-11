import { createContext, useContext } from 'react';

/**
 * Whether a screen is being drawn inside the signed-in app shell, beside the sidebar.
 *
 * A few screens are shared with the public site — reporting a bug, requesting a broker, support
 * tickets, the broker list. On the marketing site a centred column is right: there is nothing beside
 * it. Inside the app it is the opposite: the shell is already 1680px wide, and a 672px column in the
 * middle of it is the "bunch of wasted space" every page except the Overview had. PageFrame reads
 * this to decide which it is.
 *
 * Its own .ts file because a .tsx exporting a non-component trips react-refresh/only-export-components.
 */
export const InAppContext = createContext(false);

export function useInApp(): boolean {
  return useContext(InAppContext);
}
