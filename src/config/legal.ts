/**
 * Who legally operates Trend Chasers.
 *
 * ▸▸ SET THIS BEFORE APPLYING TO A PAYMENT PROCESSOR ◂◂
 *
 * Payment processors check that the entity named in your Terms matches the one on your merchant
 * account, and a mismatch is one of the most common rejection reasons — a developer documented
 * being turned down by Paddle specifically because his site said one name and his account said
 * another. Put your registered name here exactly as it appears on the account you open.
 *
 * A sole proprietor with no registered trade name uses their own legal name, which is correct and
 * normal — processors expect it.
 */
export const LEGAL_ENTITY = 'Jaryn Healey';

/** Where refund and billing questions go. Must be a monitored inbox — processors test it. */
export const SUPPORT_EMAIL = 'support@trendchasers.net';

/** Days a customer can request a full refund, no questions asked. */
export const REFUND_WINDOW_DAYS = 30;
