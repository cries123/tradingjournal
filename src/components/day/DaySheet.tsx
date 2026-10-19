import { X } from 'lucide-react';
import { useAnimatedClose } from '../../hooks/useAnimatedClose';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { DayContent, type DayContentProps } from './DayContent';

/**
 * The day on a phone: a sheet that rises over the calendar, as the approved design draws it.
 *
 * Every way out — the backdrop, the X, Escape — goes through useAnimatedClose, so the sheet plays
 * out rather than vanishing in a frame (the bug the old drawer had on Escape). Leaving the day also
 * saves an unsaved note: useDayNote writes the edit when the sheet unmounts.
 */
export function DaySheet(props: Omit<DayContentProps, 'layout' | 'onBack'> & { onClose: () => void }) {
  const { onClose, ...content } = props;
  const { closing, close } = useAnimatedClose(onClose);
  useEscapeToClose(close);

  return (
    <>
      <button
        type="button"
        aria-label="Close the day"
        onClick={close}
        className={`fixed inset-0 z-50 bg-black/55 ${closing ? 'animate-backdrop-out' : 'animate-backdrop-in'}`}
      />
      <div
        role="dialog"
        aria-label={`Trades for ${content.date}`}
        className={`fixed inset-x-0 bottom-0 top-[12vh] z-50 flex flex-col rounded-t-[24px] border-t border-[#2a2a2a] bg-[#101010] shadow-[0_-20px_50px_rgba(0,0,0,0.6)] ${
          closing ? 'animate-scale-out' : 'animate-fade-up'
        } ${closing ? 'pointer-events-none' : ''}`}
      >
        <div className="relative shrink-0 pt-2.5">
          <div className="mx-auto h-[5px] w-10 rounded-full bg-[#3a3a3a]" aria-hidden />
          <button type="button" onClick={close} aria-label="Close" className="absolute right-3 top-2 rounded-lg p-1.5 text-text-secondary focus-ring">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-[18px] pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <DayContent {...content} layout="sheet" onBack={close} />
        </div>
      </div>
    </>
  );
}
