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

/**
 * Which slugs this account has a record published at — asked of the ownership rows, not of the
 * current username.
 *
 * The username was the only thing either half of this used to find a record, and a username can be
 * changed. Renaming therefore stranded the published page: it stayed online under the old handle,
 * showing figures the trader could no longer take down, because unpublish went looking at the slug
 * for the NEW name and found nothing there. Asking who owns what finds it whatever they are called
 * now, and finds more than one if a rename ever left two behind.
 */
async function slugsOwnedBy(uid: string): Promise<string[]> {
  const snap = await getAdminFirestore().collection(OWNERS).where('uid', '==', uid).get();
  return snap.docs.map((d) => d.id);
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
   * Never over the top of another account's record.
   *
   * Unpublishing has always checked ownership and publishing never did, which is the wrong way
   * round: this one overwrites. The registry hands out a handle to one account at a time, so the
   * ordinary path cannot collide — but it is one transaction away from being able to (a released
   * handle, a repaired registry, an admin rename), and the failure mode is one trader's figures
   * appearing under another trader's name on a page branded verified. 409 rather than a silent
   * overwrite, because there is nothing sensible to do automatically.
   */
  const occupant = await getAdminFirestore().doc(`${OWNERS}/${slug}`).get();
  if (occupant.exists && (occupant.data() as { uid?: string } | undefined)?.uid !== uid) {
    throw new TrackRecordError('A record is already published at that username.', 409);
  }

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
    // The username as they typed it. The slug below is its lowercased form, used only as an id.
    username,
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

  /*
   * A trader has one record, so republishing after a rename moves it rather than leaving two.
   *
   * Without this, renaming and republishing left the old page online forever: a public record under
   * a handle they no longer use, with no button anywhere that takes it down.
   */
  for (const stale of await slugsOwnedBy(uid)) {
    if (stale === slug) continue;
    batch.delete(db.doc(`trackRecords/${stale}`));
    batch.delete(db.doc(`${OWNERS}/${stale}`));
  }

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
 *
 * Found by ownership and not by the current username, which is what makes this work after a rename.
 * It used to derive the slug from whatever the trader is called today, so renaming left the page
 * published and unreachable: the button reported success and deleted nothing. Only ever their own
 * rows, because the query is on their uid.
 */
export async function unpublishTrackRecord(uid: string): Promise<void> {
  const slugs = await slugsOwnedBy(uid);
  if (slugs.length === 0) return;

  const db = getAdminFirestore();
  const batch = db.batch();
  for (const slug of slugs) {
    batch.delete(db.doc(`trackRecords/${slug}`));
    batch.delete(db.doc(`${OWNERS}/${slug}`));
  }
  await batch.commit();
}
