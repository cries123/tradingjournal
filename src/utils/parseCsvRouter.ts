import type { ParsedTradeInput } from '../types';
import { parseSchwabCsv } from './parseSchwabCsv';
import { parseRobinhoodCsv } from './parseRobinhoodCsv';
import { parseTosCsv } from './parseTosCsv';

export type CsvBrokerFormat = 'schwab' | 'tos' | 'robinhood' | 'unknown';

export interface CsvImportPreview extends ParsedTradeInput {
  id: string;
  selected: boolean;
}

export function detectCsvFormat(text: string): CsvBrokerFormat {
  const head = text.slice(0, 4000).toLowerCase();
  if (head.includes('account trade history')) return 'schwab';
  if (head.includes('activity date') && head.includes('trans code')) return 'robinhood';
  if (head.includes('thinkorswim') || (head.includes('exec time') && head.includes('pos effect'))) return 'tos';
  if (head.includes('exec time') && head.includes('symbol')) return 'schwab';
  return 'unknown';
}

export function parseBrokerCsv(text: string): ParsedTradeInput[] {
  const format = detectCsvFormat(text);

  switch (format) {
    case 'robinhood':
      return parseRobinhoodCsv(text);
    case 'tos':
      return parseTosCsv(text);
    case 'schwab':
    default:
      return parseSchwabCsv(text);
  }
}

export function previewBrokerCsv(text: string): CsvImportPreview[] {
  return parseBrokerCsv(text).map((trade) => ({
    ...trade,
    id: crypto.randomUUID(),
    selected: true,
  }));
}

export function brokerFormatLabel(format: CsvBrokerFormat): string {
  switch (format) {
    case 'schwab':
      return 'Schwab statement';
    case 'tos':
      return 'Thinkorswim activity';
    case 'robinhood':
      return 'Robinhood history';
    default:
      return 'CSV';
  }
}
