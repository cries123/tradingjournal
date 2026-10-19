import type { SidebarAppView } from '../Sidebar';

/** The screens the profile menu opens. While one is up, the profile row is the "you are here". */
export const ACCOUNT_VIEWS: readonly SidebarAppView[] = [
  'settings',
  'account',
  'subscription',
  'order-history',
  'support',
  'brokers',
  'report-bug',
];

/**
 * Everything a phone reaches through More, so the bottom bar can say where you are.
 *
 * The bar has four destinations and a button. Every other screen is one More leads to, and landing
 * on Settings with nothing lit in the bar is how somebody loses their way back.
 */
export const MORE_VIEWS: readonly SidebarAppView[] = [
  'more',
  'trades',
  'connect-broker',
  'simulator',
  'track-record',
  'coach',
  'report',
  ...ACCOUNT_VIEWS,
];
