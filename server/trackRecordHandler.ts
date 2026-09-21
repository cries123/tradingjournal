import { getAdminFirestore } from './firebaseAdmin';
import {
  buildTrackRecord,
  canPublish,
  MIN_TRADES_TO_PUBLISH,
  type PublishedRecord,
} from '../src/utils/trackRecord';
import type { Trade } from '../src/types';

/**
 * Publishing a track record.
 *
 * COMPUTED HERE, NEVER SENT BY THE CLIENT, and that is the entire reason this function exists
 * rather than a Firestore write from the browser. A page that says "these figures came from a
 * broker" is worth nothing if the browser can post the figures — anyone could publish whatever
 * numbers they liked and the tick beside them would be a lie. So the server reads the trades
 * itself, applies the exclusion rule itself, and writes a document the client never touches.
 *
 * The published document is public-read. It therefore carries only what the trader chose to show:
 * no trade rows, no symbols, no account identifiers, and no uid.
 */

export class TrackRecordError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'TrackRecordError';
    this.statusCode = statusCode;
  }
}

export interface PublishOptions {
  /** Off, the page shows rates and ratios only — win rate, profit factor, win:loss. */
  showAmounts: boolean;
  /** On, the page verifies the trades without naming who they belong to. */
  anonymous: boolean;
  /**
   * Account ids the record covers. Undefined means every journal holding broker-imported
   * trades, which is the default.
   *
   * Narrowing is safe to take from the client: it can only ever restrict the caller to a subset
   * of their own trades, never reach anybody else’s. What it cannot do is hide that it
   * happened — the published document records how many journals were left out.
   */
  journals?: readonly string[] | null;
}

/**
 * Who owns a slug, kept OUT of the public document.
 *
 * Unpublishing has to check that the record belongs to the caller, which needs a uid stored
 * somewhere — but the obvious place, a `uid` field on the record itself, puts an account
 * identifier on a page whose whole claim is that it shows only what the trader chose. This
 * collection appears in no security rule, and Firestore denies unlisted collections by default,
 * so it is unreachable from a browser; the Admin SDK bypasses rules and is the only reader.
 */
const OWNERS = 'trackRecordOwners';

/** Every trade the account holds, across journals — a record spans the trader, not one journal. */
async function readAllTrades(uid: string): Promise<Trade[]> {
  const snap = await getAdminFirestore().collection(`users/${uid}/trades`).limit(20_000).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Trade, 'id'>) }));
}

export async function publishTrackRecord(
  uid: string,
  username: string | null,
  options: PublishOptions,
): Promise<{ slug: string; verifiedTrades: number }> {
  if (!username) {
    throw new TrackRecordError('Pick a username before publishing a record.', 400);
  }

  const record = buildTrackRecord(await readAllTrades(uid), options.journals);

  if (!canPublish(record)) {
    throw new TrackRecordError(
      `You need at least ${MIN_TRADES_TO_PUBLISH} trades imported from a broker. You have ${record.verifiedTrades}.`,
      400,
    );
  }

  const slug = username.toLowerCase();

  /*
   * Amounts are dropped from the DOCUMENT, not hidden by the page.
   *
   * A public document with the figures in it and a flag asking the renderer not to show them is
   * not privacy — anyone can read the document. If the trader said no amounts, the amounts never
   * leave this function.
   */
  const money = options.showAmounts
    ? {
        netPnl: record.netPnl,
        avgWin: record.avgWin,
        avgLoss: record.avgLoss,
        maxDrawdown: record.maxDrawdown,
        bestDay: record.bestDay,
        worstDay: record.worstDay,
      }
    : {};

  // Typed as the shape the public page reads, so a field renamed on one side stops the build
  // rather than rendering as undefined on somebody's published record.
  const published: PublishedRecord = {
    published: true,
    showAmounts: options.showAmounts,
    username: options.anonymous ? null : username,
    verifiedTrades: record.verifiedTrades,
    excludedTrades: record.excludedTrades,
    brokers: record.brokers,
    firstDate: record.firstDate,
    lastDate: record.lastDate,
    tradingDays: record.tradingDays,
    journalsEligible: record.journalsEligible,
    journalsIncluded: record.journalsIncluded,
    winRate: record.winRate,
    profitFactor: record.profitFactor,
    ...money,
    // What the page dates itself by. These figures are a snapshot, not a live feed, and saying
    // when they were taken is the difference between a record and an implied real-time claim.
    updatedAt: new Date().toISOString(),
  };

  const db = getAdminFirestore();
  const batch = db.batch();
  // Not merged: republishing with amounts turned off has to REMOVE the amounts that are already
  // in the document, and a merge would leave them there to be read.
  batch.set(db.doc(`trackRecords/${slug}`), published, { merge: false });
  batch.set(db.doc(`${OWNERS}/${slug}`), { uid, updatedAt: published.updatedAt });
  // One commit, so a published page can never exist without the ownership row that lets its owner
  // take it down again.
  await batch.commit();

  return { slug, verifiedTrades: record.verifiedTrades };
}

/**
 * Takes the page down.
 *
 * The document is deleted rather than flagged unpublished. A flag leaves every figure sitting in a
 * public-read collection for anyone who kept the URL, which is not what "unpublish" means to the
 * person pressing it.
 */
export async function unpublishTrackRecord(uid: string, username: string | null): Promise<void> {
  if (!username) return;

  const slug = username.toLowerCase();
  const db = getAdminFirestore();

  // Only ever their own. A username can be renamed and re-registered, so the slug alone does not
  // establish who a record belongs to — the ownership row does, and it is checked rather than
  // assumed.
  const owner = await db.doc(`${OWNERS}/${slug}`).get();
  if (!owner.exists || (owner.data() as { uid?: string } | undefined)?.uid !== uid) return;

  const batch = db.batch();
  batch.delete(db.doc(`trackRecords/${slug}`));
  batch.delete(db.doc(`${OWNERS}/${slug}`));
  await batch.commit();
}
