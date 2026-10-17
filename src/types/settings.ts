import type { Strategy, TradingRules } from './strategy';
import { DEFAULT_TRADING_RULES } from './strategy';

export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'CAD';
/** Lime is the brand's own and the default since the October 2026 rebrand; the rest stay as choices. */
export type ThemeAccent = 'lime' | 'emerald' | 'cyan' | 'violet';

export interface JournalAccount {
  id: string;
  name: string;
}

export interface UserSettings {
  currency: CurrencyCode;
  defaultSymbol: string;
  themeAccent: ThemeAccent;
  setupTags: string[];
  accounts: JournalAccount[];
  activeAccountId: string;
  /**
   * Showing every journal added together rather than the active one. Silver and up, and only
   * with more than one journal — see viewingAllJournals in SettingsContext.
   *
   * A view, not a journal: activeAccountId stays a real journal while this is on, because new
   * trades, CSV imports and "clear this journal" all need one to file into or act on. Picking a
   * journal in the picker turns it off.
   */
  viewAllJournals: boolean;
  /**
   * Journals the published track record covers. Null means every journal holding
   * broker-imported trades.
   *
   * Remembered rather than re-chosen each time so that republishing after a sync cannot
   * silently widen a record the trader had deliberately narrowed.
   */
  trackRecordJournals: string[] | null;
  strategies: Strategy[];
  tradingRules: TradingRules;
  /** Monthly net P&L target — 0 disables the goal tracker. */
  monthlyGoalPnl: number;
  /** Trading capital, used to express P&L as a percentage return so it can be compared against
   *  a benchmark like SPY. 0 means "not set" — the comparison is hidden rather than guessed at,
   *  since dollars and an index's percentage move aren't comparable without it. */
  accountSize: number;
  remindersEnabled: boolean;
  /** Local HH:MM for end-of-day journal reminder */
  reminderTime: string;
  /**
   * Let the journal import from the broker on its own each market morning. Diamond only.
   *
   * On by default, because it is the feature people upgrade for and a capability nobody switches
   * on is a capability nobody bought. Off is still worth offering: somebody reconciling a month by
   * hand needs the journal to stop changing under them.
   */
  autoSyncEnabled: boolean;
  /**
   * The coach invited to read this journal and write on it, as a lowercased email. Diamond only.
   *
   * One coach, not a list. A second seat is a different product — a team plan — and pretending
   * otherwise with an array would put the access rules in a shape nothing else here is ready for.
   */
  coachEmail?: string;
  /** Told when a risk rule is broken: in the app as it happens, and again the next morning. */
  ruleAlertsEnabled: boolean;
  /** Download URLs of custom share-card background images the user has uploaded (Firebase
   *  Storage), most-recent last. Capped at MAX_SHARE_CARD_BACKGROUNDS — see
   *  services/shareCardBackgrounds.ts — so re-uploading is never required to pick one again. */
  shareCardBackgrounds: string[];
  /** Which background the share card currently uses: a URL from shareCardBackgrounds above, or
   *  null for the default Milky Way starfield. */
  shareCardBackgroundId: string | null;
  /**
   * Which brand these settings have been brought up to — see utils/brandMigration.ts. Absent on
   * everything saved before October 2026, which is how the one-time move to lime knows whom to move.
   */
  brandVersion?: number;
}

/** Bumped when a rebrand should reset every member's accent; the migration runs for anyone below it. */
export const BRAND_VERSION = 1;

export const DEFAULT_SETTINGS: UserSettings = {
  currency: 'USD',
  defaultSymbol: 'SPY',
  themeAccent: 'lime',
  brandVersion: BRAND_VERSION,
  setupTags: ['BREAKOUT', 'FOMO', 'RSI CROSSED', 'REVERSAL'],
  accounts: [{ id: 'default', name: 'Primary journal' }],
  activeAccountId: 'default',
  viewAllJournals: false,
  strategies: [],
  tradingRules: DEFAULT_TRADING_RULES,
  monthlyGoalPnl: 0,
  accountSize: 0,
  remindersEnabled: false,
  reminderTime: '16:00',
  autoSyncEnabled: true,
  ruleAlertsEnabled: true,
  shareCardBackgrounds: [],
  shareCardBackgroundId: null,
  trackRecordJournals: null,
};
