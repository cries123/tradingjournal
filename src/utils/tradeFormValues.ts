import { parseMoneyInput, roundMoney } from './parseMoneyInput';

/** The raw strings the Add/Edit Trade form holds, before any of them are believed. */
export interface TradeFormDraft {
  symbol: string;
  pnl: string;
  grossPnl: string;
  fees: string;
  mae: string;
  mfe: string;
  rMultiple: string;
  checklistScore: string;
  ivRank: string;
}

export interface TradeFormReading {
  /** Net P/L implied by gross and fees, or null when either is missing or unreadable. */
  derivedNet: number | null;
  /** What the Net P/L box should display — the computed figure when there is one. */
  netRaw: string;
  net: number | null;
  values: {
    gross?: number;
    fees?: number;
    mae?: number;
    mfe?: number;
    rMultiple?: number;
    checklistScore?: number;
    ivRank?: number;
  };
  errors: Partial<Record<keyof TradeFormDraft, string>>;
  /** Errors hiding behind the collapsed Advanced section, so submit can open it. */
  advancedErrorCount: number;
  canSave: boolean;
}

function optionalNumber(raw: string): { value?: number; error?: string } {
  const parsed = parseMoneyInput(raw);
  if (parsed.kind === 'empty') return {};
  if (parsed.kind === 'invalid') return { error: 'Not a number' };
  return { value: parsed.value };
}

function percent(raw: string, label: string): { value?: number; error?: string } {
  const read = optionalNumber(raw);
  if (read.error || read.value === undefined) return read;
  if (read.value < 0 || read.value > 100) return { error: `${label} is 0-100` };
  return read;
}

/**
 * Reads the whole form once, so the fields, the errors and what gets saved cannot disagree.
 *
 * The disagreement this replaces was real: submit did
 * `if (gross != null && fees != null) pnlValue = gross - fees`, so a person who typed a net figure
 * and then filled in gross and fees saved a number that was never shown to them. Deriving the net
 * here, and rendering that same value, means the box and the record are the same thing.
 */
export function readTradeForm(draft: TradeFormDraft): TradeFormReading {
  const gross = optionalNumber(draft.grossPnl);
  const fees = optionalNumber(draft.fees);
  const mae = optionalNumber(draft.mae);
  const mfe = optionalNumber(draft.mfe);
  const rMultiple = optionalNumber(draft.rMultiple);
  const checklistScore = percent(draft.checklistScore, 'Checklist');
  const ivRank = percent(draft.ivRank, 'IV rank');

  const derivedNet =
    gross.value !== undefined && fees.value !== undefined
      ? roundMoney(gross.value - fees.value)
      : null;

  const netRaw = derivedNet !== null ? derivedNet.toFixed(2) : draft.pnl;
  const netParsed = parseMoneyInput(netRaw);

  const errors: Partial<Record<keyof TradeFormDraft, string>> = {};
  if (!draft.symbol.trim()) errors.symbol = 'Enter a symbol.';
  if (netParsed.kind === 'empty') errors.pnl = 'Enter the profit or loss for this trade.';
  if (netParsed.kind === 'invalid') {
    errors.pnl = 'Not a number. Use a minus sign for a loss, e.g. -1274.22';
  }
  if (gross.error) errors.grossPnl = gross.error;
  if (fees.error) errors.fees = fees.error;
  if (mae.error) errors.mae = mae.error;
  if (mfe.error) errors.mfe = mfe.error;
  if (rMultiple.error) errors.rMultiple = rMultiple.error;
  if (checklistScore.error) errors.checklistScore = checklistScore.error;
  if (ivRank.error) errors.ivRank = ivRank.error;

  const advancedKeys: (keyof TradeFormDraft)[] = [
    'grossPnl', 'fees', 'mae', 'mfe', 'rMultiple', 'checklistScore', 'ivRank',
  ];

  return {
    derivedNet,
    netRaw,
    net: netParsed.kind === 'value' ? netParsed.value : null,
    values: {
      gross: gross.value,
      fees: fees.value,
      mae: mae.value,
      mfe: mfe.value,
      rMultiple: rMultiple.value,
      checklistScore: checklistScore.value,
      ivRank: ivRank.value,
    },
    errors,
    advancedErrorCount: advancedKeys.filter((k) => errors[k]).length,
    canSave: Object.keys(errors).length === 0,
  };
}
