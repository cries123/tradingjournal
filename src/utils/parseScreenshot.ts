import type { ParsedTradeInput } from '../types';
import { compressImage } from './compressImage';

const API_KEY_STORAGE = 'trading-journal-openai-key';

export function loadApiKey(): string {
  return localStorage.getItem(API_KEY_STORAGE) ?? '';
}

export function saveApiKey(key: string): void {
  if (key) {
    localStorage.setItem(API_KEY_STORAGE, key);
  } else {
    localStorage.removeItem(API_KEY_STORAGE);
  }
}

export interface ParseScreenshotResult {
  trades: ParsedTradeInput[];
}

async function readResponseJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(
      response.status === 502 || response.status === 504
        ? 'Server unavailable — reload the page and try again'
        : `Empty server response (${response.status}). Screenshot may be too large.`,
    );
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Server error (${response.status}): ${text.slice(0, 200)}`);
  }
}

export async function parseScreenshot(
  file: File,
  apiKey?: string,
): Promise<ParseScreenshotResult> {
  const compressed = await compressImage(file);
  const base64 = await fileToBase64(compressed);

  const response = await fetch('/api/parse-screenshot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: base64,
      mimeType: compressed.type || 'image/jpeg',
      apiKey: apiKey || undefined,
    }),
  });

  const data = await readResponseJson(response);
  if (!response.ok) {
    throw new Error(String(data.error || 'Failed to parse screenshot'));
  }

  return data as unknown as ParseScreenshotResult;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
