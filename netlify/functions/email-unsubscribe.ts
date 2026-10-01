import type { Handler } from '@netlify/functions';
import { getAdminFirestore } from '../../server/firebaseAdmin';
import { logServerError } from '../../server/errorReports';
import { verifyUnsubscribeToken } from '../../server/unsubscribeToken';
import { resolveList, UNSUBSCRIBE_LISTS } from '../../server/unsubscribeLists';

/**
 * The unsubscribe link at the bottom of the mail this app sends.
 *
 * Three lists reach here — the weekly recap, the rule alerts and the free-trial welcome note — and
 * which one is in the link, inside its signature. See server/unsubscribeLists.ts for why that matters and what it used to do instead.
 *
 * A GET that works in one click with no sign-in, because an unsubscribe that asks someone to log
 * in first is an unsubscribe that doesn't work — and a list nobody can leave is how a sending
 * domain ends up blacklisted. The signature in the link is what stands in for authentication: it
 * proves the link came from us, and it only ever turns a preference OFF.
 *
 * Returns a small HTML page rather than JSON, since a person clicked this from their inbox.
 */
function page(title: string, message: string, status: number) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f4f5f7;">
<div style="max-width:460px;margin:64px auto;background:#fff;border:1px solid #e3e5e9;border-radius:12px;padding:28px;">
  <p style="margin:0;font-size:13px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#0ea5e9;">Trend Chasers</p>
  <h1 style="margin:8px 0 10px 0;font-size:20px;color:#111827;">${title}</h1>
  <p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:#374151;">${message}</p>
  <a href="/app" style="display:inline-block;background:#0ea5e9;color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:10px 20px;border-radius:8px;">Open your journal</a>
</div></body></html>`,
  };
}

export const handler: Handler = async (event) => {
  const uid = event.queryStringParameters?.uid ?? '';
  const token = event.queryStringParameters?.t ?? '';

  /*
   * The list comes from the link and is not defaulted.
   *
   * It used to default to 'recap' and then be ignored entirely: whatever list the link belonged to,
   * the endpoint wrote recap: false. So unsubscribing from a rule alert stopped the weekly recap and
   * left the alerts running — the reader kept getting the mail they had just opted out of and
   * silently lost the one they had not mentioned.
   */
  const list = resolveList(event.queryStringParameters?.p);

  if (!uid || !token || !list || !verifyUnsubscribeToken(uid, token, list)) {
    /*
     * No list is known on this path — the link is the thing that failed — so this one cannot name a
     * Settings control, and no longer claims there is one for whatever the reader was holding. The
     * trial reminders deliberately have no toggle, so the old sentence was false for them.
     */
    return page(
      'That link didn’t work',
      'It may have expired or been copied incompletely. Reply to any email from us and we will turn it off by hand.',
      400,
    );
  }

  const definition = UNSUBSCRIBE_LISTS[list];
  // Where to send somebody whose write failed. Only true for the lists that have a control.
  const elsewhere = definition.inSettings
    ? `Turn ${definition.stopped} off in Settings and it will stick.`
    : `Reply to the email you clicked this from and we will turn ${definition.stopped} off by hand.`;

  try {
    const db = getAdminFirestore();
    const updatedAt = new Date().toISOString();

    if (definition.target === 'emailPrefs') {
      await db
        .doc(`emailPrefs/${uid}`)
        .set({ uid, [definition.field]: false, updatedAt }, { merge: true });
    } else {
      // The rule alerts are a SETTING — the same field the toggle in Settings writes and the one the
      // alert job actually reads. Writing to emailPrefs here would have reported success and changed
      // nothing that stops the mail.
      await db.doc(`users/${uid}/settings/preferences`).set({ [definition.field]: false }, { merge: true });
    }

    return page(
      'Unsubscribed',
      `You won’t get ${definition.stopped} any more. ${definition.stillArrives ? `${definition.stillArrives} ` : ''}Support replies about your own tickets will still reach you — those aren’t part of this list.`,
      200,
    );
  } catch (err) {
    console.error('[email-unsubscribe] failed:', err);
    await logServerError('email-unsubscribe', err);
    return page('We couldn’t save that', `Something went wrong on our end. ${elsewhere}`, 500);
  }
};
