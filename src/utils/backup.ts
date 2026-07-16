import type { Trade } from '../types';
import type { UserSettings } from '../types/settings';

const BACKUP_APP_ID = 'trend-chasers';
const BACKUP_VERSION = 1;

export interface TrendChasersBackup {
  app: typeof BACKUP_APP_ID;
  version: number;
  exportedAt: string;
  settings: UserSettings;
  trades: Trade[];
}

export interface ParsedBackup {
  trades: Trade[];
  settings: Partial<UserSettings>;
  exportedAt: string | null;
}

export function buildBackup(trades: Trade[], settings: UserSettings): TrendChasersBackup {
  return {
    app: BACKUP_APP_ID,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings,
    trades,
  };
}

export function downloadBackup(trades: Trade[], settings: UserSettings): void {
  const backup = buildBackup(trades, settings);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `trend-chasers-backup-${backup.exportedAt.slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function isValidTrade(value: unknown): value is Trade {
  if (typeof value !== 'object' || value === null) return false;
  const t = value as Record<string, unknown>;
  return (
    typeof t.id === 'string'
    && t.id.length > 0
    && typeof t.date === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(t.date)
    && typeof t.symbol === 'string'
    && typeof t.pnl === 'number'
    && Number.isFinite(t.pnl)
  );
}

/** Settings keys restored from a backup. Coach-share fields are intentionally
 *  excluded — the share token belongs to the original account. */
const RESTORABLE_SETTINGS_KEYS = [
  'currency',
  'defaultSymbol',
  'themeAccent',
  'setupTags',
  'accounts',
  'activeAccountId',
  'strategies',
  'tradingRules',
  'remindersEnabled',
  'reminderTime',
] as const;

export function parseBackup(text: string): ParsedBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON. Choose a Trend Chasers backup file.');
  }

  if (typeof raw !== 'object' || raw === null) {
    throw new Error('That file is not a Trend Chasers backup.');
  }

  const backup = raw as Record<string, unknown>;
  if (backup.app !== BACKUP_APP_ID) {
    throw new Error('That file is not a Trend Chasers backup.');
  }
  if (typeof backup.version !== 'number' || backup.version > BACKUP_VERSION) {
    throw new Error('This backup was created by a newer version of Trend Chasers. Update and try again.');
  }
  if (!Array.isArray(backup.trades)) {
    throw new Error('Backup is missing trade data.');
  }

  const invalid = backup.trades.filter((t) => !isValidTrade(t)).length;
  if (invalid > 0) {
    throw new Error(`Backup contains ${invalid} malformed trade record(s). File may be corrupted.`);
  }
  const trades = backup.trades as Trade[];

  const settings: Partial<UserSettings> = {};
  if (typeof backup.settings === 'object' && backup.settings !== null) {
    const source = backup.settings as Record<string, unknown>;
    for (const key of RESTORABLE_SETTINGS_KEYS) {
      if (key in source && source[key] !== undefined) {
        (settings as Record<string, unknown>)[key] = source[key];
      }
    }
  }

  return {
    trades,
    settings,
    exportedAt: typeof backup.exportedAt === 'string' ? backup.exportedAt : null,
  };
}
