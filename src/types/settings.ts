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
  psychologyTags: string[];
  marketContextTags: string[];
  accounts: JournalAccount[];
  activeAccountId: string;
}

export const DEFAULT_SETTINGS: UserSettings = {
  currency: 'USD',
  defaultSymbol: 'SPY',
  themeAccent: 'emerald',
  setupTags: ['BREAKOUT', 'FOMO', 'RSI CROSSED', 'REVERSAL'],
  psychologyTags: ['CALM', 'CONFIDENT', 'DISCIPLINED', 'FOMO', 'HESITANT', 'ANXIOUS', 'REVENGE'],
  marketContextTags: ['GAP UP', 'GAP DOWN', 'TREND DAY', 'CHOP', 'HIGH VIX', 'LOW VIX', 'FOMC', 'EARNINGS'],
  accounts: [{ id: 'default', name: 'Primary journal' }],
  activeAccountId: 'default',
};
