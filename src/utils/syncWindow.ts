import type { Trade } from '../types';
import { isBrokerVerified } from './trackRecord';

/**
 * How far back a sync needs to ask the broker to look.
 *
 * Every manual sync pulled the account's entire history, because the client never passed a start
 * date: up to 25 serial pages of 1,000 activities, every time somebody pressed Sync for today's
 * fills. That is the longest-running request the product makes, and length is what breaks it —
 * a phone that locks or switches radios mid-flight hands back a truncated body, the reply fails to
 * parse, and the sync is lost. It also meant the common outcome was the whole history coming back,
 * de-duplicating to nothing, and the screen saying "you're up to date" for a sync that had just
 * cost the trader one of five.
 *
 * So: ask for what could plausibly be new, and only ask for everything when there is nothing to
 * compare against.
 */

/**
 * How far back of already-imported history to re-ask for.
 *
 * Not zero, and not a day. Schwab's feed arrives a day late, trades settle and get amended, and a
 * trader who synced on Friday and again on Monday needs the weekend covered. Fourteen days is wide
 * enough to absorb all of that and still turn a full-history pull into one page.
 *
 * The overlap costs nothing: dedupeIncomingTrades drops anything already held, by the broker's own
 * id and by an execution fingerprint, so re-asking for a fortnight imports nothing twice.
 */
export const OVERLAP_DAYS = 14;

/** YYYY-MM-DD, in local time — the same shape the broker API takes. */
function toKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Trades this brokerage account imported, identified by the id the importer stamps on them.
 *
 * The obvious field is the wrong one, and using it shipped a fix that did nothing. A trade’s
 * `accountId` is the JOURNAL it was filed into — addTrades defaults it to settings.activeAccountId
 * — while the id handed to a sync is SnapTrade’s account id. Comparing the two never matched, so
 * this returned undefined every time and every sync went on pulling the whole history.
 *
 * The importer writes `snaptrade_<accountId>_<stamp>_<i>` as the document id, which is the only
 * place the brokerage account survives onto the trade. Matching on it keeps the window per
 * connection: two brokers importing into one journal must not narrow each other, or a quiet
 * account inherits a busy one’s window and silently stops fetching its own history.
 */
function belongsToAccount(trade: Trade, snaptradeAccountId: string): boolean {
  return typeof trade.id === 'string' && trade.id.startsWith(`snaptrade_${snaptradeAccountId}_`);
}

/**
 * The start date for a sync of one account, or undefined to pull everything.
 *
 * Undefined is the right answer more often than it looks: a first sync, a newly connected account,
 * and an account whose imported trades were all cleared must each still fetch the whole history, or
 * the trader presses Sync on an empty journal and stays empty.
 *
 * Only broker-imported trades count toward "we already have this". A journal full of hand-entered
 * trades tells us nothing about what the brokerage has sent, and treating a typed trade as a
 * high-water mark would silently narrow the window and skip real fills.
 */
export function syncStartDate(
  existingTrades: Trade[],
  /** SnapTrade’s account id — the one passed to the sync, not the journal id. */
  accountId: string,
  today: Date,
  overlapDays = OVERLAP_DAYS,
): string | undefined {
  let latest: string | null = null;

  for (const trade of existingTrades) {
    if (!isBrokerVerified(trade)) continue;
    if (!belongsToAccount(trade, accountId)) continue;

    const date = trade.date;
    if (typeof date !== 'string' || date.length < 10) continue;
    if (latest === null || date > latest) latest = date;
  }

  if (latest === null) return undefined;

  /*
   * Walked back from the latest trade we hold, not from today.
   *
   * Counting back from today would quietly skip everything in between for somebody returning after
   * a month away — they would sync, see a fortnight, and conclude the import is broken. Anchoring
   * on the data means a long absence simply produces a wider window, which is correct.
   */
  const [y, m, d] = latest.split('-').map(Number);
  if (!y || !m || !d) return undefined;

  const from = new Date(y, m - 1, d);
  from.setDate(from.getDate() - overlapDays);

  // Never ask for the future: a trade dated ahead of today, which brokers do send around
  // settlement, would otherwise produce a start date later than the end of the range.
  return from > today ? toKey(today) : toKey(from);
}
