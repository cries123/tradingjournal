import type { Config, Context } from '@netlify/functions';
import { openModelStream, prepareAssistantStream } from '../../server/aiAssistantHandler';
import { refundDaily } from '../../server/usage';

/**
 * Streaming variant of the assistant.
 *
 * A .mts function, not a .ts one, because only Netlify's modern runtime can return a streaming
 * Response — the classic handler signature has to buffer the whole body before replying, which is
 * exactly what this endpoint exists to avoid.
 *
 * It re-uses the normal path's preflight, so auth, length limits and the daily cap are enforced
 * identically. A streaming endpoint that skipped them would be an unmetered door to the same model.
 */
export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const headers = Object.fromEntries(req.headers.entries());
  const pre = await prepareAssistantStream(headers, body);

  if (!pre.ok || !pre.messages) {
    const rejection = pre.rejection ?? { statusCode: 500, error: 'Something went wrong.' };
    return Response.json(
      { error: rejection.error, ...(rejection.upgradeTo ? { upgradeTo: rejection.upgradeTo } : {}) },
      { status: rejection.statusCode },
    );
  }

  const upstream = await openModelStream(pre.messages);
  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '');
    console.error('[ai-assistant-stream] upstream failed:', upstream.status, detail.slice(0, 300));
    // Nothing was generated, so the message the preflight counted was never delivered. The client
    // retries on the non-streaming endpoint, which counts its own — without this refund a single
    // upstream hiccup silently costs the user two of their daily messages.
    if (pre.uid) await refundDaily('ai', pre.uid);
    // 502 tells the client to retry on the non-streaming endpoint, which has the model fallback
    // and the empty-answer retry that a stream can't do halfway through.
    return Response.json(
      { error: 'The assistant is unavailable right now. Try again shortly.' },
      { status: 502 },
    );
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';
  let produced = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();

      // The remaining-question count rides ahead of the text so the UI can update its counter
      // without waiting for the answer to finish.
      controller.enqueue(
        encoder.encode(
          `event: meta\ndata: ${JSON.stringify({ remaining: pre.remaining, limit: pre.limit, tier: pre.tier })}\n\n`,
        ),
      );

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          // SSE frames are newline-delimited; a chunk can split one, so only whole lines are taken
          // and the remainder stays buffered.
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const data = trimmed.slice(5).trim();
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data) as {
                choices?: { delta?: { content?: string } }[];
              };
              const token = parsed.choices?.[0]?.delta?.content;
              if (token) {
                produced = true;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`));
              }
            } catch {
              // A frame we can't parse is not worth killing the answer over.
            }
          }
        }

        if (!produced) {
          // The reasoning-budget failure, arriving as a clean but empty stream. Say so rather than
          // ending on silence the UI would render as a blank reply.
          controller.enqueue(
            encoder.encode(`event: error\ndata: ${JSON.stringify({ error: 'empty' })}\n\n`),
          );
        }
        controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'));
      } catch (err) {
        console.error('[ai-assistant-stream] stream broke:', err);
        controller.enqueue(
          encoder.encode(`event: error\ndata: ${JSON.stringify({ error: 'interrupted' })}\n\n`),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
};

export const config: Config = { path: '/api/ai-assistant-stream' };
