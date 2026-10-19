import type { CSSProperties } from 'react';
import type { Finding } from '../../utils/assistantOpening';

/**
 * The colour a starting point's figure is printed in.
 *
 * Loss red for what is costing money, profit green for what is working, and amber for the rest —
 * the colour the rail's rule dots and the Overview's rule marks already use, so "your own limits"
 * reads as the same thing wherever it appears. Theme tokens, so a trader's accent is never fought.
 */
export const FIGURE_TONE: Record<Finding['tone'], string> = {
  bad: 'text-loss-bright',
  good: 'text-profit-bright',
  neutral: 'text-amber-400',
};

/**
 * How tall the Assistant screen is, so its message box sits at the foot of the window.
 *
 * Every other screen scrolls; this one is a chat, and a composer that floats halfway up a short
 * conversation — or scrolls away under a long one — is the thing every chat app is built to avoid.
 * The shell gives a screen no height to fill (JournalApp's <main> is a scrolling block), so the
 * height is the window's minus the shell around the screen, and the shell's bottom padding is
 * taken back with a negative margin so the page does not scroll by that much:
 *
 * - phone: the top bar (53.5px as measured: the logo and its padding), the bottom bar (60px and a
 *   1px border), <main>'s p-2 (8px top, 8px bottom) and the container's pb-6 (24px) — 123px with
 *   the top padding, and the 32px below taken back by the margin. The bars grow by the safe areas,
 *   so those are in the sum too; the top bar's padding is max(6px, inset), so only the inset past
 *   6px adds.
 * - beside the sidebar (md and up): <main>'s md:p-5 (20px each side) and the container's md:pb-10
 *   (40px).
 *
 * Set as a variable from an inline style because the sum has env() and max() in it, which an
 * arbitrary Tailwind value would mangle; the classes in AssistantContent read the variables.
 */
export const SCREEN_HEIGHTS = {
  '--ask-phone-h':
    'calc(100dvh - 123px - env(safe-area-inset-bottom, 0px) - max(0px, env(safe-area-inset-top, 0px) - 0.375rem))',
  '--ask-desk-h': 'calc(100dvh - 2.25rem)',
} as CSSProperties;
