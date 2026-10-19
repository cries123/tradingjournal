import { describe, expect, it } from 'vitest';
import { pendingDayNoteWrite, shouldSaveDayNote } from './dayNoteSave';

const note = (text: string, discipline: number | null = null) => ({ note: text, discipline });

describe('shouldSaveDayNote', () => {
  it('never writes over a note it could not read', () => {
    // The bug this exists for: a failed load showed an empty box, and leaving it saved the empty
    // box over the real note — which the service turns into a delete.
    expect(shouldSaveDayNote(null, note(''))).toBe(false);
    expect(shouldSaveDayNote(null, note('typed before the load came back'))).toBe(false);
  });

  it('does not re-save a note nobody changed', () => {
    expect(shouldSaveDayNote(note('Stopped at three.', 4), note('Stopped at three.', 4))).toBe(false);
  });

  it('treats whitespace alone as no change, the way the save trims', () => {
    expect(shouldSaveDayNote(note('Stopped at three.'), note('Stopped at three.  \n'))).toBe(false);
  });

  it('saves an edit to the text', () => {
    expect(shouldSaveDayNote(note('Stopped at three.'), note('Stopped at three. Good day.'))).toBe(true);
  });

  it('saves a change to the discipline rating alone', () => {
    expect(shouldSaveDayNote(note('x', 2), note('x', 3))).toBe(true);
    expect(shouldSaveDayNote(note('x', 2), note('x', null))).toBe(true);
  });

  it('still lets a trader clear their own note on purpose', () => {
    expect(shouldSaveDayNote(note('Old note'), note(''))).toBe(true);
  });
});

describe('pendingDayNoteWrite — what leaving a day saves', () => {
  const base = { uid: 'u1', date: '2026-09-17', key: 'u1|2026-09-17', draft: 'Stopped at three.', discipline: 4 };

  it('saves an unsaved edit when the trader leaves the day', () => {
    expect(
      pendingDayNoteWrite({ ...base, loaded: { key: base.key, values: note('Stopped at two.', 4) } }),
    ).toEqual({ uid: 'u1', date: '2026-09-17', note: 'Stopped at three.', discipline: 4 });
  });

  it('saves nothing when the edit was already saved', () => {
    expect(pendingDayNoteWrite({ ...base, loaded: { key: base.key, values: note('Stopped at three.', 4) } })).toBeNull();
  });

  it('saves nothing for a day whose note never loaded', () => {
    expect(pendingDayNoteWrite({ ...base, loaded: null, draft: '' })).toBeNull();
  });

  it('never files the previous day’s box under the next day’s date', () => {
    // Stepped from the 16th to the 17th: the loaded copy is still the 16th's until the 17th loads.
    const stale = { key: 'u1|2026-09-16', values: note('Sixteenth', 2) };
    expect(pendingDayNoteWrite({ ...base, draft: 'Sixteenth, edited', loaded: stale })).toBeNull();
  });
});
