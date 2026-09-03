/**
 * Explains what a sync could not account for.
 *
 * Both gaps have the same cause — the position was opened before the history the brokerage handed
 * over — and neither can be resolved from activity data. What can be fixed is the silence: a
 * journal that quietly disagrees with a broker statement reads as a broken product, and the trader
 * has no way to tell an import gap from a bug. Naming the gap turns "these numbers are wrong" into
 * "these numbers are missing this, and here is why".
 */
export interface SyncGapCounts {
  unmatchedCloses?: number;
  assumedShorts?: number;
  inferredOrderDays?: number;
  ignored?: Record<string, number>;
  negativeFees?: number;
}

/** "3 dividends, 1 transfer, 1 split" — the rows the sync read past, named. */
export function describeIgnored(ignored: Record<string, number>): string {
  const NAMES: Record<string, [string, string]> = {
    DIVIDEND: ['dividend', 'dividends'],
    TRANSFER: ['transfer', 'transfers'],
    SPLIT: ['stock split', 'stock splits'],
    FEE: ['account fee', 'account fees'],
    INTEREST: ['interest payment', 'interest payments'],
    CONTRIBUTION: ['deposit', 'deposits'],
    WITHDRAWAL: ['withdrawal', 'withdrawals'],
    REI: ['dividend reinvestment', 'dividend reinvestments'],
  };
  return Object.entries(ignored)
    .filter(([, n]) => n > 0)
    .map(([type, n]) => {
      const [one, many] = NAMES[type] ?? [type.toLowerCase(), type.toLowerCase()];
      return `${n} ${n === 1 ? one : many}`;
    })
    .join(', ');
}

export function describeSyncGaps(
  unmatchedClosesOrCounts: number | SyncGapCounts = 0,
  assumedShortsArg = 0,
): string[] {
  const counts: SyncGapCounts =
    typeof unmatchedClosesOrCounts === 'number'
      ? { unmatchedCloses: unmatchedClosesOrCounts, assumedShorts: assumedShortsArg }
      : unmatchedClosesOrCounts;
  const unmatchedCloses = counts.unmatchedCloses ?? 0;
  const assumedShorts = counts.assumedShorts ?? 0;
  const notes: string[] = [];

  if (unmatchedCloses > 0) {
    notes.push(
      `${unmatchedCloses} closing ${unmatchedCloses === 1 ? 'fill was' : 'fills were'} left out, `
      + 'because the trade that opened the position is older than the history your broker shares. '
      + 'Add those trades by hand if you want them counted.',
    );
  }

  if (assumedShorts > 0) {
    notes.push(
      `${assumedShorts} ${assumedShorts === 1 ? 'position was' : 'positions were'} recorded as `
      + 'short sales, because the sale had no matching purchase in the history. That is correct if '
      + 'you were shorting. If you were selling shares you already owned, the entry price on those '
      + 'trades is wrong and worth correcting.',
    );
  }

  if ((counts.inferredOrderDays ?? 0) > 0) {
    const n = counts.inferredOrderDays as number;
    notes.push(
      `Your broker reports no time of day, so on ${n} ${n === 1 ? 'day' : 'days'} with both buys `
      + 'and sells of the same symbol the pairing follows the order the fills arrived in. Totals '
      + 'are unaffected; individual entries and exits on those days may be paired differently '
      + 'from how you remember them.',
    );
  }

  const ignored = counts.ignored ? describeIgnored(counts.ignored) : '';
  if (ignored) {
    notes.push(
      `Read past and not counted as trades: ${ignored}.`
      + (counts.ignored?.SPLIT
        ? ' A stock split changes share counts, so trades in that symbol across the split date may be mismatched.'
        : '')
      + (counts.ignored?.TRANSFER
        ? ' Shares that arrived by transfer have no purchase here, so selling them will read as a short.'
        : ''),
    );
  }

  if ((counts.negativeFees ?? 0) > 0) {
    const n = counts.negativeFees as number;
    notes.push(
      `${n} ${n === 1 ? 'fill' : 'fills'} reported the fee as a negative number. It was counted as a `
      + 'cost. If your statement shows it as a rebate, those trades are understated by that amount.',
    );
  }

  return notes;
}
