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
  | 'content';

export const ADMIN_TABS: { id: AdminTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Users' },
  { id: 'support', label: 'Support' },
  { id: 'requests', label: 'Requests' },
  { id: 'errors', label: 'Errors' },
  { id: 'costs', label: 'Costs' },
  { id: 'content', label: 'Content' },
];
