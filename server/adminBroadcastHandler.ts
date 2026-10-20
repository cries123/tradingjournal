import type { IncomingHttpHeaders } from 'http';
import { AdminRequestError, assertCallerIsAdmin, getBearerToken } from './adminAuth';
import { adminEmailFor, logAdminActionServer } from './adminAudit';
import {
  BROADCAST_AUDIENCES,
  broadcastReadiness,
  createBroadcast,
  listBroadcasts,
  parseDraft,
  previewFor,
  readinessProblem,
  selectRecipients,
  sendNextChunks,
  sendTestEmail,
} from './broadcast';

/**
 * The admin Email tab: write one email, see who it reaches, test it, send it to everybody.
 *
 * Every action is admin-only. Sending is `create` (the recipient list, snapshotted into chunks)
 * followed by `send` again and again from the open tab until the broadcast is done, because each
 * call only has Netlify's ten seconds. See server/broadcast.ts.
 */
export type AdminBroadcastAction = 'status' | 'count' | 'preview' | 'test' | 'create' | 'send';

export type AdminBroadcastRequestBody = Record<string, unknown> & { action?: AdminBroadcastAction };

export async function handleAdminBroadcastRequest(
  headers: IncomingHttpHeaders,
  body: AdminBroadcastRequestBody,
  deadline: number,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const token = getBearerToken(headers);
  if (!token) return { statusCode: 401, body: { error: 'Missing authorization' } };

  try {
    const adminUid = await assertCallerIsAdmin(token);
    const admin = { uid: adminUid, email: await adminEmailFor(adminUid) };

    switch (body.action ?? 'status') {
      case 'status':
        return {
          statusCode: 200,
          body: {
            ok: true,
            readiness: broadcastReadiness(),
            problems: { news: readinessProblem('news'), notice: readinessProblem('notice') },
            broadcasts: await listBroadcasts(),
          },
        };

      case 'count': {
        const kind = body.kind === 'notice' ? 'notice' : 'news';
        const audience = BROADCAST_AUDIENCES.find((a) => a === body.audience);
        if (!audience) return { statusCode: 400, body: { error: 'Choose who it goes to.' } };
        const { counts } = await selectRecipients(audience, kind);
        return { statusCode: 200, body: { ok: true, counts } };
      }

      case 'preview':
        return { statusCode: 200, body: { ok: true, ...previewFor(parseDraft(body, { confirmNotice: false }), admin) } };

      case 'test': {
        const draft = parseDraft(body, { confirmNotice: false });
        const message = await sendTestEmail(draft, admin);
        await logAdminActionServer({
          adminUid,
          adminEmail: admin.email,
          action: 'email.broadcast-test',
          targetType: 'broadcast',
          targetId: 'test',
          targetLabel: `“${draft.subject}”`,
          detail: `Test of a ${draft.kind === 'news' ? 'news email' : 'account notice'} sent to ${admin.email}.`,
        });
        return { statusCode: 200, body: { ok: true, message } };
      }

      case 'create': {
        const draft = parseDraft(body, { confirmNotice: true });
        const broadcast = await createBroadcast(draft, admin);
        // Logged when the list is fixed and sending begins: this is the moment the admin chose, and
        // the record is there whether or not the tab stays open for the rest of the send.
        await logAdminActionServer({
          adminUid,
          adminEmail: admin.email,
          action: 'email.broadcast-sent',
          targetType: 'broadcast',
          targetId: broadcast.id,
          targetLabel: `${broadcast.total.toLocaleString('en-US')} people: “${broadcast.subject}”`,
          detail: `${draft.kind === 'news' ? 'News' : 'Account notice'} to ${draft.audience === 'all' ? 'every account' : `the ${draft.audience} audience`}.`,
        });
        return { statusCode: 200, body: { ok: true, broadcast } };
      }

      case 'send': {
        const id = typeof body.id === 'string' ? body.id : '';
        if (!/^[0-9]{14}-[0-9a-f]{8}$/.test(id)) return { statusCode: 400, body: { error: 'A broadcast id is required.' } };
        const result = await sendNextChunks(id, deadline);
        return { statusCode: 200, body: { ok: true, ...result } };
      }

      default:
        return { statusCode: 400, body: { error: 'Unknown action' } };
    }
  } catch (err) {
    if (err instanceof AdminRequestError) return { statusCode: err.statusCode, body: { error: err.message } };
    const message = err instanceof Error ? err.message : 'Request failed';
    return { statusCode: 500, body: { error: message } };
  }
}
