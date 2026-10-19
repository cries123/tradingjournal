import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { fetchDayNote, saveDayNote } from '../services/dayNotes';
import { reportErrorSilently } from '../services/errorReporting';
import { pendingDayNoteWrite, shouldSaveDayNote, type DayNoteSnapshot, type DayNoteValues } from '../utils/dayNoteSave';

export type DayNoteStatus = 'loading' | 'ready' | 'error';
export type DayNoteSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * One day's note and discipline rating: loaded, edited, and saved without ever losing what was there.
 *
 * The rules are in utils/dayNoteSave.ts and tested there; this only wires them to React. Same
 * storage, same fields and the same saveDayNote as the day drawer always used — nothing about where
 * a note lives has changed, so every note written before this is read exactly as it was.
 *
 *   - A load that fails leaves the note UNKNOWN, not empty: the box stays disabled with a retry,
 *     and nothing is written for that day until a load succeeds.
 *   - A save happens on blur, on a rating change and on leaving the day — only when something
 *     changed from what was loaded.
 *   - Leaving a day mid-edit (to the next day, another screen, or closing the page) saves the edit.
 */
export function useDayNote(date: string) {
  const { user, firebaseEnabled } = useAuth();
  const uid = firebaseEnabled && user ? user.uid : null;
  const key = `${uid ?? 'local'}|${date}`;

  const [loaded, setLoaded] = useState<DayNoteSnapshot['loaded']>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState('');
  const [discipline, setDisciplineState] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<DayNoteSaveStatus>('idle');

  const status: DayNoteStatus = loaded?.key === key ? 'ready' : failedKey === key ? 'error' : 'loading';

  useEffect(() => {
    let cancelled = false;
    fetchDayNote(uid, date)
      .then((note) => {
        if (cancelled) return;
        const values: DayNoteValues = { note: note?.note ?? '', discipline: note?.discipline ?? null };
        setLoaded({ key, values });
        setDraft(values.note);
        setDisciplineState(values.discipline);
        setFailedKey(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setFailedKey(key);
        reportErrorSilently(error, 'promise', 'day-note-load');
      });
    return () => {
      cancelled = true;
    };
  }, [uid, date, key, attempt]);

  /* The latest of everything, for the save on the way out. Synced in an effect rather than written
     during render; the cleanup below reads it before the next render's effects replace it. */
  const latest = useRef<DayNoteSnapshot>({ key, uid, date, loaded, draft, discipline });
  useEffect(() => {
    latest.current = { key, uid, date, loaded, draft, discipline };
  });

  // Leaving the day — stepping to another, another screen, or unmounting — saves an unsaved edit.
  useEffect(
    () => () => {
      const write = pendingDayNoteWrite(latest.current);
      if (!write) return;
      void saveDayNote(write.uid, write.date, write.note, write.discipline ?? undefined).catch((error: unknown) => {
        reportErrorSilently(error, 'promise', 'day-note-save-on-leave');
      });
    },
    [key],
  );

  const persist = useCallback(
    async (next: DayNoteValues) => {
      if (loaded?.key !== key || !shouldSaveDayNote(loaded.values, next)) return;
      setSaveStatus('saving');
      try {
        await saveDayNote(uid, date, next.note, next.discipline ?? undefined);
        setLoaded({ key, values: { note: next.note.trim(), discipline: next.discipline } });
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus((s) => (s === 'saved' ? 'idle' : s)), 1500);
      } catch (error) {
        setSaveStatus('error');
        reportErrorSilently(error, 'promise', 'day-note-save');
      }
    },
    [loaded, key, uid, date],
  );

  return {
    status,
    saveStatus,
    /** The box's text. Empty while loading or after a failed load — never saved in that state. */
    draft: status === 'ready' ? draft : '',
    setDraft,
    discipline: status === 'ready' ? discipline : null,
    /** Sets the rating and saves it at once, as the drawer always did. */
    setDiscipline: (next: number | null) => {
      setDisciplineState(next);
      void persist({ note: draft, discipline: next });
    },
    /** Saves the text if it changed — wired to the box's blur. */
    save: () => void persist({ note: draft, discipline }),
    retry: () => setAttempt((a) => a + 1),
  };
}
