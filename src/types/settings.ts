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
};
