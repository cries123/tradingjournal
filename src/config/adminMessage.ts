/**
 * Caps on a note sent from the admin panel. A message is a note, not a newsletter.
 *
 * Shared by the composer (which stops typing at the cap) and the function that sends (which
 * refuses past it), so the two never disagree about what fits.
 */
export const ADMIN_MESSAGE_LIMITS = { subject: 150, body: 5000 } as const;

/**
 * A message sent to their Support inbox opens a ticket, so it keeps to what a ticket the trader
 * opened themselves can hold (firestore.rules validTicketCreate, and the message rule's 4,000).
 * Mirrored in server/adminSupportMessage.ts, which refuses past them.
 */
export const SUPPORT_THREAD_LIMITS = { subjectMin: 3, subject: 120, body: 4000 } as const;

/**
 * Caps on an email to everybody (the admin Email tab, server/broadcast.ts).
 *
 * The body allows more than a note because an announcement can carry a few sections, but stays well
 * short of what Gmail clips (about 102 KB of HTML, after which it hides the rest behind "View entire
 * message" and the unsubscribe link with it). The preheader is cut where inboxes cut it anyway; a
 * button label past 40 characters wraps to two lines on a phone.
 */
export const BROADCAST_LIMITS = { subject: 150, heading: 150, body: 10000, preheader: 140, ctaLabel: 40 } as const;
