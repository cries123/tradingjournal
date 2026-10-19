/**
 * The admin panel's sections.
 *
 * In a .ts rather than beside the tab bar because `react-refresh/only-export-components` rejects a
 * non-component export from a .tsx, and the list is wanted by the page as well as by the nav.
 */
export type AdminTab =
  | 'overview'
  | 'users'
  | 'support'
  | 'requests'
  | 'errors'
  | 'costs'
  | 'ops'
  | 'content';

export const ADMIN_TABS: { id: AdminTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Users' },
  { id: 'support', label: 'Support' },
  // Signed-out bug reports only, now that broker requests are gone. The id stays so nothing that
  // links to the tab has to change.
  { id: 'requests', label: 'Bug reports' },
  { id: 'errors', label: 'Errors' },
  { id: 'costs', label: 'Costs' },
  // What the server did with nobody watching: scheduled runs, every sync, every email, every
  // billing webhook. Before this tab those were found by a customer writing in.
  { id: 'ops', label: 'Ops' },
  { id: 'content', label: 'Content' },
];
