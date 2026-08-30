/**
 * The name Trend Chasers trades under, shown on the Terms and Refund pages.
 *
 * ▸▸ THIS MUST MATCH THE NAME ON YOUR PAYMENT PROCESSOR ACCOUNT ◂◂
 *
 * Processors check that the entity named in your Terms matches the one on your merchant account,
 * and a mismatch is one of the most common rejection reasons. So whatever is set here has to be a
 * name you can actually register with Creem — a trade name (DBA) or a company, not just a brand
 * you started using.
 */
export const LEGAL_ENTITY = 'Trend Chasers';

/** Where refund and billing questions go. Must be a monitored inbox — processors test it. */
export const SUPPORT_EMAIL = 'support@trendchasers.net';

/** Days a customer can request a full refund, no questions asked. */
export const REFUND_WINDOW_DAYS = 30;
