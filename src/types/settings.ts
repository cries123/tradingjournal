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
  remindersEnabled: false,
  reminderTime: '16:00',
  coachShareEnabled: false,
  leaderboardOptIn: false,
  leaderboardAnonymous: false,
};
