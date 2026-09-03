import { AdminRequestError } from './adminAuth';
import { getAdminAuth, getAdminFirestore } from './firebaseAdmin';
import { getSnaptrade, SNAPTRADE_CONFIGURED } from './snaptradeClient';
import { isMailConfigured, sendEmail, siteUrl } from './mailer';
import { adminMessageEmail } from './emailTemplates';
import { ADMIN_MESSAGE_LIMITS } from '../src/config/adminMessage';
import { describeHttpError } from './upstreamErrors';

/**
 * The account-level things an admin can do to one user, other than change what they pay for.
 *
 * Each is a small, reversible-where-possible operation with a plain sentence back. None of them
 * touch the journal itself: a suspended account's trades are still there for the day it comes
 * back, and a reset broker link takes nothing out of the calendar.
 */

async function refuseIfSiteAdmin(targetUid: string, verb: string): Promise<void> {
  const adminSnap = await getAdminFirestore().doc('config/admin').get();
  const siteAdminUid = (adminSnap.data() as { uid?: string } | undefined)?.uid;
  if (siteAdminUid && targetUid === siteAdminUid) {
    throw new AdminRequestError(`The site admin account cannot be ${verb}`, 400);
  }
}

/* ------------------------------------------------------------------ suspend */

/**
 * Blocks or restores sign-in.
 *
 * Firebase's `disabled` flag refuses new sign-ins and token refreshes; revoking the refresh tokens
 * as well means a session that is already open runs out within the hour instead of lasting until
 * the person happens to sign out. The flag is mirrored onto the user document so the panel's list
 * can show it without a round trip to Auth per row — that copy is informational, the Auth flag is
 * the one that holds.
 */
export async function setSignInSuspended(
  callerUid: string,
  targetUid: string,
  suspended: boolean,
  reason: string,
): Promise<{ message: string }> {
  if (callerUid === targetUid) {
    throw new AdminRequestError('You cannot suspend your own account from here', 400);
  }
  await refuseIfSiteAdmin(targetUid, 'suspended');

  const auth = getAdminAuth();
  await auth.updateUser(targetUid, { disabled: suspended });
  if (suspended) await auth.revokeRefreshTokens(targetUid);

  const now = new Date().toISOString();
  await getAdminFirestore()
    .doc(`users/${targetUid}`)
    .set(
      suspended
        ? { suspended: true, suspendedAt: now, suspendedReason: reason.trim().slice(0, 200) }
        : { suspended: false, suspendedAt: null, suspendedReason: null },
      { merge: true },
    );

  return {
    message: suspended
      ? 'Sign-in suspended. Any open session ends within the hour; their data is untouched.'
      : 'Sign-in restored.',
  };
}

/* ------------------------------------------------------------------ broker link */

function isNotFound(err: unknown): boolean {
  const { status, body } = describeHttpError(err);
  return status === 404 || /not found|does not exist|no such user/i.test(body);
}

/**
 * Removes everything SnapTrade knows about this person, so the next Connect starts clean.
 *
 * This is the answer to the ticket that says "sync doesn't work" when the stored secret and
 * SnapTrade's records have drifted apart, or a brokerage authorisation is stuck. Deleting the
 * SnapTrade user drops every connection under it, which also stops the per-connection charge for
 * links that were never going to work again. The journal is not touched; only the link is.
 */
export async function resetBrokerLink(targetUid: string): Promise<{ message: string; hadLink: boolean }> {
  const db = getAdminFirestore();
  const secretRef = db.doc(`users/${targetUid}/private/snaptrade`);
  const hadLink = Boolean((await secretRef.get()).data()?.userSecret);

  if (SNAPTRADE_CONFIGURED) {
    try {
      await getSnaptrade().authentication.deleteSnapTradeUser({ userId: targetUid });
    } catch (err) {
      // Never registered with them is the same outcome as removed. Anything else is a real refusal
      // and must not be reported as a clean reset.
      if (!isNotFound(err)) {
        const { status } = describeHttpError(err);
        throw new AdminRequestError(
          `SnapTrade would not remove the link${status ? ` (HTTP ${status})` : ''}. Nothing was changed.`,
          502,
        );
      }
    }
  }

  await secretRef.delete().catch(() => undefined);

  const now = new Date().toISOString();
  await db
    .doc(`brokerConnections/${targetUid}`)
    .set(
      { uid: targetUid, connected: false, accountCount: 0, institutions: [], lastCheckedAt: now, resetAt: now },
      { merge: true },
    )
    .catch(() => undefined);

  return {
    hadLink,
    message: hadLink
      ? 'Broker link reset. They can reconnect from Connect Broker; their trades are untouched.'
      : 'No broker link was stored. Anything SnapTrade held has been cleared anyway.',
  };
}

/* ------------------------------------------------------------------ email */

const REPLY_TO = 'support@trendchasers.net';

/**
 * Sends a note written in the panel to the address on the account.
 *
 * The address comes from Auth, not from the request, so the panel can only ever write to the
 * person whose row it is looking at. Failures come back as errors rather than a quiet "sent",
 * because the whole point of writing to somebody is knowing it reached them.
 */
export async function emailAccountHolder(
  targetUid: string,
  subject: string,
  message: string,
): Promise<{ message: string }> {
  const cleanSubject = subject.trim().replace(/\s+/g, ' ');
  const cleanMessage = message.trim();

  if (!cleanSubject) throw new AdminRequestError('A subject is required', 400);
  if (cleanSubject.length > ADMIN_MESSAGE_LIMITS.subject) {
    throw new AdminRequestError(`Keep the subject under ${ADMIN_MESSAGE_LIMITS.subject} characters`, 400);
  }
  if (!cleanMessage) throw new AdminRequestError('Write something to send', 400);
  if (cleanMessage.length > ADMIN_MESSAGE_LIMITS.body) {
    throw new AdminRequestError(`Keep the message under ${ADMIN_MESSAGE_LIMITS.body} characters`, 400);
  }
  if (!isMailConfigured()) {
    throw new AdminRequestError('Email is not set up on the server (RESEND_API_KEY is missing)', 503);
  }

  const account = await getAdminAuth().getUser(targetUid);
  const to = account.email?.trim();
  if (!to) throw new AdminRequestError('This account has no email address', 400);

  const mail = adminMessageEmail({ subject: cleanSubject, message: cleanMessage, siteUrl: siteUrl() });
  const outcome = await sendEmail({ to, ...mail, replyTo: REPLY_TO, tag: 'admin-message' });

  if (!outcome.sent) {
    const why =
      outcome.reason === 'invalid-recipient'
        ? 'the address on the account is not usable'
        : outcome.reason === 'not-configured'
          ? 'email is not set up on the server'
          : 'the email provider refused it';
    throw new AdminRequestError(`Not sent — ${why}.`, 502);
  }

  return { message: `Sent to ${to}` };
}
