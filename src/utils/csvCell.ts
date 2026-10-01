/**
 * One CSV field, escaped. The only copy.
 *
 * There were two, and they disagreed on the thing that matters. The tax report's tested for
 * `/[",\n]/`; the trade export's tested only for a comma and a quote, so a NEWLINE went through raw.
 *
 * Notes are typed into a textarea, and `notes` is the seventh of twenty-one columns in the trade
 * export — so a two-line note split the record and every field after it (prices, quantity, fees,
 * gross, grade, times, MAE, MFE, R multiple, checklist, asset class, journal) landed on a second line
 * that any parser reads as a new row whose date column is prose. That file goes to an accountant.
 *
 * This is the chunkError lesson again, which this repo has already paid for once: two copies of an
 * escaping rule drift, and the one nobody is looking at is the one that breaks.
 *
 * \r is included as well as \n. A note pasted from Windows or from a web page carries CRLF, and a
 * bare CR ends the record just as effectively in most parsers.
 */
export function csvCell(value: unknown): string {
  if (value === undefined || value === null) return '';
  const str = Array.isArray(value) ? value.join(';') : String(value);
  return /["\n\r,]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}
