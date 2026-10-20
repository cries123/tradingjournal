import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The mail client's own unsubscribe button (RFC 8058).
 *
 * News carries List-Unsubscribe and List-Unsubscribe-Post headers, and Gmail or Yahoo then POST to
 * the link with no person in the loop. The endpoint used to answer GET only, so that button would
 * have failed silently while the email claimed to support it.
 */

const writes: { path: string; data: Record<string, unknown> }[] = [];

vi.mock('../../server/firebaseAdmin', () => ({
  getAdminFirestore: () => ({
    doc: (path: string) => ({
      set: async (data: Record<string, unknown>) => {
        writes.push({ path, data });
      },
    }),
  }),
}));
vi.mock('../../server/errorReports', () => ({ logServerError: async () => undefined }));

const { handler } = await import('../../netlify/functions/email-unsubscribe');
const { unsubscribeToken } = await import('../../server/unsubscribeToken');

type Result = { statusCode: number; headers?: Record<string, string>; body?: string };
const hit = async (httpMethod: string, params: Record<string, string>) =>
  (await handler({ httpMethod, queryStringParameters: params } as never, {} as never)) as Result;

beforeEach(() => {
  writes.length = 0;
  vi.stubEnv('EMAIL_TOKEN_SECRET', 'a-test-secret-long-enough');
});
afterEach(() => vi.unstubAllEnvs());

describe('one-click unsubscribe', () => {
  it('turns news off on a POST and answers in plain text', async () => {
    const res = await hit('POST', { uid: 'u1', t: unsubscribeToken('u1', 'news')!, p: 'news' });
    expect(res.statusCode).toBe(200);
    expect(res.headers?.['Content-Type']).toContain('text/plain');
    expect(writes).toEqual([{ path: 'emailPrefs/u1', data: expect.objectContaining({ uid: 'u1', news: false }) }]);
  });

  it('still shows the page to a person who clicked the link', async () => {
    const res = await hit('GET', { uid: 'u1', t: unsubscribeToken('u1', 'news')!, p: 'news' });
    expect(res.headers?.['Content-Type']).toContain('text/html');
    expect(res.body).toContain('news and announcements');
  });

  it('refuses a forged token whichever way it arrives', async () => {
    const res = await hit('POST', { uid: 'u1', t: unsubscribeToken('u2', 'news')!, p: 'news' });
    expect(res.statusCode).toBe(400);
    expect(writes).toHaveLength(0);
  });

  it('answers nothing but GET and POST', async () => {
    expect((await hit('DELETE', {})).statusCode).toBe(405);
  });
});
