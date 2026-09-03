/**
 * Explains what a sync could not account for.
 *
 * Both gaps have the same cause — the position was opened before the history the brokerage handed
 * over — and neither can be resolved from activity data. What can be fixed is the silence: a
 * journal that quietly disagrees with a broker statement reads as a broken product, and the trader
 * has no way to tell an import gap from a bug. Naming the gap turns "these numbers are wrong" into
 * "these numbers are missing this, and here is why".
 */
export function describeSyncGaps(unmatchedCloses = 0, assumedShorts = 0): string[] {
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

  return notes;
}
