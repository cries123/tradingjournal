import type { Strategy, TradingRules } from './strategy';
import { DEFAULT_TRADING_RULES } from './strategy';

export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'CAD';
export type ThemeAccent = 'emerald' | 'cyan' | 'violet';

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
  coachShareEnabled: boolean;
  coachShareToken?: string;
  /** Last-used date range (YYYY-MM-DD) for the trade-history share link, remembered so the
   *  share panel and "Update link" both reuse it without asking again. */
  coachShareRangeStart?: string;
  coachShareRangeEnd?: string;
  /** Opt-in — off by default. Even when on, only broker-synced trades ever count toward a
   *  leaderboard ranking; manual entries are excluded regardless of this setting. */
  leaderboardOptIn: boolean;
  /** Show a random placeholder name instead of the real username. Only meaningful when
   *  leaderboardOptIn is true. */
  leaderboardAnonymous: boolean;
  /** Download URLs of custom share-card background images the user has uploaded (Firebase
   *  Storage), most-recent last. Capped at MAX_SHARE_CARD_BACKGROUNDS — see
   *  services/shareCardBackgrounds.ts — so re-uploading is never required to pick one again. */
  shareCardBackgrounds: string[];
  /** Which background the share card currently uses: a URL from shareCardBackgrounds above, or
   *  null for the default Milky Way starfield. */
  shareCardBackgroundId: string | null;
}

export const DEFAULT_SETTINGS: UserSettings = {
  currency: 'USD',
  defaultSymbol: 'SPY',
  themeAccent: 'emerald',
  setupTags: ['BREAKOUT', 'FOMO', 'RSI CROSSED', 'REVERSAL'],
  accounts: [{ id: 'default', name: 'Primary journal' }],
  activeAccountId: 'default',
  strategies: [],
  tradingRules: DEFAULT_TRADING_RULES,
  monthlyGoalPnl: 0,
  accountSize: 0,
  remindersEnabled: false,
  reminderTime: '16:00',
  coachShareEnabled: false,
  leaderboardOptIn: false,
  leaderboardAnonymous: false,
  shareCardBackgrounds: [],
  shareCardBackgroundId: null,
};
