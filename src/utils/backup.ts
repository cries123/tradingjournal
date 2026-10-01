import type { Trade } from '../types';
import type { UserSettings } from '../types/settings';
import type { DayNote } from '../services/dayNotes';
import { downloadJson } from './downloadJson';

const BACKUP_APP_ID = 'trend-chasers';

/*
 * 2 adds dayNotes.
 *
 * The file called itself a full backup and left out the written journal. Day notes live in their
 * own Firestore subcollection, so they were never in the trades array — and they are the one thing
 * in this app a broker cannot send again. A trader who moved devices on the strength of this file
 * lost every note and every discipline rating and had no way to know until they looked.
 *
 * A version 1 file still restores: dayNotes absent means an empty list, not a corrupt file. A
 * version 2 file opened by an older deployed build is refused with "created by a newer version",
 * which is the check immediately below and the reason this number exists.
 */
const BACKUP_VERSION = 2;

export interface TrendChasersBackup {
  app: typeof BACKUP_APP_ID;
  version: number;
  exportedAt: string;
  settings: UserSettings;
  trades: Trade[];
  dayNotes: DayNote[];
}

export interface ParsedBackup {
  trades: Trade[];
  settings: Partial<UserSettings>;
  dayNotes: DayNote[];
  exportedAt: string | null;
}

export function buildBackup(
  trades: Trade[],
  settings: UserSettings,
  dayNotes: DayNote[],
): TrendChasersBackup {
  return {
    app: BACKUP_APP_ID,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings,
    trades,
    dayNotes,
  };
}

export function downloadBackup(
  trades: Trade[],
  settings: UserSettings,
  dayNotes: DayNote[],
): void {
  const backup = buildBackup(trades, settings, dayNotes);
  downloadJson('trend-chasers-backup', backup.exportedAt, backup);
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

function isValidDayNote(value: unknown): value is DayNote {
  if (typeof value !== 'object' || value === null) return false;
  const n = value as Record<string, unknown>;
  return (
    typeof n.date === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(n.date)
    && typeof n.note === 'string'
    && (n.discipline === undefined || typeof n.discipline === 'number')
  );
  // updatedAt is not required: restoring stamps a fresh one, and a note worth keeping is worth
  // keeping without it.
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

  /*
   * Absent is fine, present and wrong is not.
   *
   * Every version 1 backup in anybody's downloads folder has no dayNotes key at all, and those
   * files must keep restoring. A key that is there but malformed is a different thing: it means the
   * file has been edited or truncated, and the trades it carries should not be trusted either.
   */
  let dayNotes: DayNote[] = [];
  if (backup.dayNotes !== undefined) {
    if (!Array.isArray(backup.dayNotes)) {
      throw new Error('Backup day notes are malformed. File may be corrupted.');
    }
    const badNotes = backup.dayNotes.filter((n) => !isValidDayNote(n)).length;
    if (badNotes > 0) {
      throw new Error(`Backup contains ${badNotes} malformed day note(s). File may be corrupted.`);
    }
    dayNotes = backup.dayNotes as DayNote[];
  }

  return {
    trades,
    settings,
    dayNotes,
    exportedAt: typeof backup.exportedAt === 'string' ? backup.exportedAt : null,
  };
}
