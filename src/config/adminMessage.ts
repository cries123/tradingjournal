/**
 * Caps on a note sent from the admin panel. A message is a note, not a newsletter.
 *
 * Shared by the composer (which stops typing at the cap) and the function that sends (which
 * refuses past it), so the two never disagree about what fits.
 */
export const ADMIN_MESSAGE_LIMITS = { subject: 150, body: 5000 } as const;
