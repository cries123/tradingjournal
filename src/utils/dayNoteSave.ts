/**
 * Whether a day note should be written. The rule that keeps anybody from losing one.
 *
 * The day drawer wrote on every blur, and after a failed load it had set the box to empty and
 * enabled it — so a trader on a bad connection who opened a day and tapped away saved an empty note
 * over the real one, which `saveDayNote` turns into a delete. Two rules close that:
 *
 *   1. Nothing is written for a note that was never read. A failed or unfinished load is not an
 *      empty note; it is an unknown one, and the only safe write to an unknown note is none.
 *   2. Nothing is written when nothing changed. A blur, a close or a page change with the text as it
 *      was loaded re-saving that text would also overwrite an edit made on another device in the
 *      meantime with the stale copy on this one.
 *
 * Clearing a note on purpose is still a save — the trader changed it — and saveDayNote deletes the
 * document then, as it always has.
 */
export interface DayNoteValues {
  note: string;
  discipline: number | null;
}

export function shouldSaveDayNote(loaded: DayNoteValues | null, next: DayNoteValues): boolean {
  if (loaded === null) return false;
  // saveDayNote trims before writing, so whitespace alone is not a change.
  return next.note.trim() !== loaded.note.trim() || next.discipline !== loaded.discipline;
}

/**
 * Everything the day page knows about its note at one moment — what it would save if the trader
 * left right now. `loaded.key` is the day (and account) the loaded copy belongs to; `key` is the
 * day on screen.
 */
export interface DayNoteSnapshot {
  key: string;
  uid: string | null;
  date: string;
  loaded: { key: string; values: DayNoteValues } | null;
  draft: string;
  discipline: number | null;
}

export interface DayNoteWrite {
  uid: string | null;
  date: string;
  note: string;
  discipline: number | null;
}

/**
 * The write to make when the trader leaves a day — to another day, another screen, or closes the
 * app — or null for none.
 *
 * Only a note loaded FOR THIS DAY counts as loaded: the page reuses its state when stepping to the
 * next day, and for the moment between the step and the next load the loaded copy is yesterday's.
 * Saving the box then would file one day's note under another's date.
 */
export function pendingDayNoteWrite(s: DayNoteSnapshot): DayNoteWrite | null {
  if (!s.loaded || s.loaded.key !== s.key) return null;
  if (!shouldSaveDayNote(s.loaded.values, { note: s.draft, discipline: s.discipline })) return null;
  return { uid: s.uid, date: s.date, note: s.draft, discipline: s.discipline };
}
