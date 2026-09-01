import type { Handler } from '@netlify/functions';
import { getAdminFirestore } from '../../server/firebaseAdmin';
import { logServerError } from '../../server/errorReports';
import { verifyUnsubscribeToken } from '../../server/unsubscribeToken';

/**
 * The unsubscribe link at the bottom of the recap email.
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
  const purpose = event.queryStringParameters?.p ?? 'recap';

  if (!uid || !token || !verifyUnsubscribeToken(uid, token, purpose)) {
    return page(
      'That link didn’t work',
      'It may have expired or been copied incompletely. You can turn the weekly recap off in Settings at any time.',
      400,
    );
  }

  try {
    await getAdminFirestore()
      .doc(`emailPrefs/${uid}`)
      .set({ uid, recap: false, updatedAt: new Date().toISOString() }, { merge: true });

    return page(
      'Unsubscribed',
      'You won’t get the weekly recap any more. Support replies about your own tickets will still reach you — those aren’t part of this list.',
      200,
    );
  } catch (err) {
    console.error('[email-unsubscribe] failed:', err);
    logServerError('email-unsubscribe', err);
    return page(
      'We couldn’t save that',
      'Something went wrong on our end. Turn the weekly recap off in Settings and it will stick.',
      500,
    );
  }
};
