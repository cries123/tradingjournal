import { createHash } from 'crypto';
import { parseScreenshotWithAI, type ParsedTrade } from './parseScreenshot';

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const CACHE_TTL_MS = 60 * 60 * 1000;

interface RateBucket {
  count: number;
  resetAt: number;
}

interface CacheEntry {
  trades: ParsedTrade[];
  expiresAt: number;
}

const rateLimits = new Map<string, RateBucket>();
const parseCache = new Map<string, CacheEntry>();

export function createRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function getClientIp(headers: Record<string, string | undefined>): string {
  const forwarded = headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';
  return headers['x-nf-client-connection-ip'] || headers['client-ip'] || 'unknown';
}

function checkRateLimit(key: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const bucket = rateLimits.get(key);

  if (!bucket || now >= bucket.resetAt) {
    rateLimits.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { ok: true };
  }

  if (bucket.count >= RATE_LIMIT) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { ok: true };
}

function hashImage(imageBase64: string): string {
  return createHash('sha256').update(imageBase64).digest('hex');
}

function getCached(hash: string): ParsedTrade[] | null {
  const entry = parseCache.get(hash);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    parseCache.delete(hash);
    return null;
  }
  return entry.trades;
}

function setCache(hash: string, trades: ParsedTrade[]): void {
  parseCache.set(hash, { trades, expiresAt: Date.now() + CACHE_TTL_MS });
  if (parseCache.size > 200) {
    const oldest = parseCache.keys().next().value;
    if (oldest) parseCache.delete(oldest);
  }
}

function validateImagePayload(image: string, mimeType: string): string | null {
  if (!ALLOWED_MIME.has(mimeType)) {
    return 'Unsupported image type. Use JPEG, PNG, WebP, or GIF.';
  }

  const byteLength = Buffer.byteLength(image, 'base64');
  if (byteLength > MAX_IMAGE_BYTES) {
    return 'Image too large. Maximum size is 4 MB.';
  }

  if (image.length < 100) {
    return 'Invalid image data.';
  }

  return null;
}

function clampTrades(trades: ParsedTrade[]): ParsedTrade[] {
  return trades.map((t) => ({
    ...t,
    symbol: t.symbol.slice(0, 12),
    pnl: Math.max(-1_000_000, Math.min(1_000_000, t.pnl)),
    notes: t.notes?.slice(0, 500),
    contract: t.contract?.slice(0, 200),
  }));
}

export interface ParseRequestBody {
  image?: string;
  mimeType?: string;
  apiKey?: string;
  userId?: string;
}

export interface ParseApiResult {
  statusCode: number;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
}

export async function handleParseScreenshotRequest(
  body: ParseRequestBody,
  headers: Record<string, string | undefined> = {},
  requestId = createRequestId(),
): Promise<ParseApiResult> {
  const logPrefix = `[parse-screenshot:${requestId}]`;

  if (!body.image) {
    console.warn(`${logPrefix} missing image`);
    return {
      statusCode: 400,
      body: { error: 'Missing image data', requestId },
    };
  }

  const mimeType = body.mimeType || 'image/jpeg';
  const validationError = validateImagePayload(body.image, mimeType);
  if (validationError) {
    console.warn(`${logPrefix} validation failed: ${validationError}`);
    return {
      statusCode: 400,
      body: { error: validationError, requestId },
    };
  }

  const ip = getClientIp(headers);
  const rateKey = body.userId ? `user:${body.userId}` : `ip:${ip}`;
  const rateCheck = checkRateLimit(rateKey);
  if (!rateCheck.ok) {
    console.warn(`${logPrefix} rate limited key=${rateKey}`);
    return {
      statusCode: 429,
      body: {
        error: `Rate limit exceeded (${RATE_LIMIT} parses per hour). Try again later.`,
        requestId,
      },
      headers: { 'Retry-After': String(rateCheck.retryAfterSec) },
    };
  }

  const imageHash = hashImage(body.image);
  const cached = getCached(imageHash);
  if (cached) {
    console.info(`${logPrefix} cache hit hash=${imageHash.slice(0, 12)}`);
    return {
      statusCode: 200,
      body: { trades: cached, cached: true, requestId },
    };
  }

  const apiKey = body.apiKey || process.env.OPENAI_API_KEY || '';
  if (!apiKey) {
    console.warn(`${logPrefix} missing API key`);
    return {
      statusCode: 400,
      body: { error: 'OpenAI API key is required.', requestId },
    };
  }

  try {
    const trades = clampTrades(await parseScreenshotWithAI(body.image, mimeType, apiKey));
    setCache(imageHash, trades);
    console.info(`${logPrefix} parsed ${trades.length} trades key=${rateKey}`);
    return {
      statusCode: 200,
      body: { trades, cached: false, requestId },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`${logPrefix} parse failed:`, message);
    return {
      statusCode: 500,
      body: { error: 'Failed to parse screenshot. Please try again.', requestId },
    };
  }
}
