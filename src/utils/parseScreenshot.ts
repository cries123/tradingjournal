import type { ParsedTradeInput } from '../types';

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

export async function parseScreenshot(
  file: File,
  apiKey?: string,
): Promise<ParseScreenshotResult> {
  const base64 = await fileToBase64(file);

  const response = await fetch('/api/parse-screenshot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: base64,
      mimeType: file.type || 'image/png',
      apiKey: apiKey || undefined,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to parse screenshot');
  }

  return data as ParseScreenshotResult;
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
