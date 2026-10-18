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
