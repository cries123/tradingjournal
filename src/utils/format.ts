import type { CurrencyCode } from '../types/settings';

const CURRENCY_LOCALE: Record<CurrencyCode, string> = {
  USD: 'en-US',
  EUR: 'de-DE',
  GBP: 'en-GB',
  CAD: 'en-CA',
};

export function formatCurrency(value: number, currency: CurrencyCode = 'USD'): string {
  const formatted = Math.abs(value).toLocaleString(CURRENCY_LOCALE[currency], {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return value < 0 ? `-${formatted}` : formatted;
}

export function formatCurrencyCompact(value: number, currency: CurrencyCode = 'USD'): string {
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : 'C$';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}${symbol}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${sign}${symbol}${Math.round(abs / 1000)}k`;
  if (abs >= 1000) return `${sign}${symbol}${(abs / 1000).toFixed(1)}k`;
  if (abs >= 100) return `${sign}${symbol}${Math.round(abs)}`;
  return formatCurrency(value, currency);
}

export function formatMonthYear(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Normalize trade session dates to YYYY-MM-DD for reliable comparisons. */
export function normalizeTradeDate(value: string | undefined | null): string | null {
  if (!value?.trim()) return null;
  const raw = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const [, m, d, y] = slash;
    const year = y.length === 2 ? 2000 + parseInt(y, 10) : parseInt(y, 10);
    return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return toDateKey(parsed);
  }

  return null;
}

export function maxDateKey(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

export function maxIsoTimestamp(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

export function monthInputValue(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

export function parseMonthInput(value: string): { year: number; month: number } | null {
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  if (month < 0 || month > 11) return null;
  return { year, month };
}
