import type { ParsedTradeInput } from '../types';
import { getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase';
import type { BrokerRegistryKey } from '../data/brokerRegistry';

export type SupportedBroker = BrokerRegistryKey;

export interface BrokerAccountSummary {
  id: string;
  name: string | null;
  institutionName: string;
  authorizationId: string;
  status?: unknown;
}

export interface BrokerStatus {
  registered: boolean;
  accounts: BrokerAccountSummary[];
}

/** An error that also reports where the caller's sync allowance stands, when the server said. */
export class BrokerApiError extends Error {
  syncsRemaining?: number;
  syncsPerDay?: number;
  /** Bonus syncs banked, already inside syncsRemaining. */
  syncCredits?: number;
  /** The underlying reason, sent only to the site admin. Undefined for everyone else. */
  detail?: string;
  /**
   * The HTTP status the server answered with.
   *
   * Carried so the caller can tell a refusal from a fault. Every status this endpoint returns is a
   * failed sync to the trader, but only some of them are anything to investigate: 402 means their
   * plan does not include it, 429 means they are out of syncs for today, 503 means SnapTrade is
   * down. Without the status there is no way to report the faults without also reporting all of
   * those, which would bury the real ones.
   */
  statusCode?: number;

  constructor(
    message: string,
    syncsRemaining?: number,
    syncsPerDay?: number,
    detail?: string,
    syncCredits?: number,
    statusCode?: number,
  ) {
    super(message);
    this.name = 'BrokerApiError';
    this.syncsRemaining = syncsRemaining;
    this.syncsPerDay = syncsPerDay;
    this.syncCredits = syncCredits;
    this.detail = detail;
    this.statusCode = statusCode;
  }
}

/**
 * Whether a failed broker call is worth a row in the error feed.
 *
 * Failed syncs were invisible: the connect screen's own handler only set React state, so a trader
 * whose sync failed saw a message and nobody else ever knew. The first one anybody noticed was
 * found by chance, in an account with two spent syncs and no trades.
 *
 * Reporting all of them would be worse than reporting none. A broker being down is one row per
 * user per attempt, and somebody out of syncs is not a bug at all — both would bury the failures
 * that are actually ours. So: server faults, and anything that was not an answer from the server
 * at all, which is the shape a bug in this client takes.
 */
/**
 * The server answered with something that was not JSON.
 *
 * Its own class rather than a BrokerApiError, because the two need opposite treatment: a
 * BrokerApiError is the server explaining itself and most of those are not bugs, while this is
 * the server failing to speak at all, which always is. Folding it into BrokerApiError would have
 * hidden it — isReportableBrokerFailure only reports those on a 5xx, and the body is usually
 * missing on a 200.
 */
export class BrokerReplyError extends Error {
  statusCode: number;
  /** How much body actually arrived. Zero is the signature of a connection dropped mid-read. */
  bodyLength: number;
  /** The first of it, for the error feed. Bounded: this goes into a report, not a log file. */
  bodySnippet: string;

  constructor(statusCode: number, body: string, options?: ErrorOptions) {
    super(
      body.length === 0
        ? `The server replied to a broker request with an empty body (HTTP ${statusCode}).`
        : `The server replied to a broker request with a body that was not JSON (HTTP ${statusCode}, ${body.length} bytes).`,
      options,
    );
    this.name = 'BrokerReplyError';
    this.statusCode = statusCode;
    this.bodyLength = body.length;
    this.bodySnippet = body.slice(0, 200);
  }
}

export function isReportableBrokerFailure(err: unknown): boolean {
  /*
   * Always reported, at any status.
   *
   * This is the class that went unexplained for weeks: an iPhone on a long sync would hand back
   * a short body, res.json() threw a bare SyntaxError, and the feed showed WebKit’s
   * "The string did not match the expected pattern" with no scope and no useful frame. Routing it
   * through BrokerApiError instead would have silenced it, since those are only reported on 5xx
   * and this usually arrives on a 200.
   */
  if (err instanceof BrokerReplyError) return true;

  if (err instanceof BrokerApiError) {
    const status = err.statusCode ?? 0;
    // 503 is SnapTrade being unavailable or unconfigured — expected, loud, and not ours.
    return status >= 500 && status !== 503;
  }
  // A dropped connection mid-sync is the train going into a tunnel, not a defect.
  const message = err instanceof Error ? err.message : String(err);
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) return false;
  return true;
}

async function brokerApiPost<T>(payload: Record<string, unknown>): Promise<T> {
  if (!isFirebaseConfigured()) {
    throw new Error('Sign in to connect a broker — broker sync stores your connection securely on your account.');
  }

  const user = getFirebaseAuth().currentUser;
  if (!user) {
    throw new Error('Sign in to connect a broker');
  }

  const token = await user.getIdToken();
  const res = await fetch('/api/broker-connect', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  /*
   * Read as text and parse by hand, rather than res.json().
   *
   * res.json() on a body that is not JSON throws a bare SyntaxError, and on iOS Safari that
   * reads "The string did not match the expected pattern" with json@[native code] on top — no
   * status, no body, nothing to act on. Two of those on one customer’s account were the only
   * trace of their sync failing, and they cancelled over it.
   *
   * A sync is the longest-running request this app makes, which is why it is the one that gets
   * a truncated or empty body when a phone is locked or the radio switches mid-flight. The text
   * is kept so the error can say which of those it was.
   *
   * Every other service here already guards with `.json().catch(() => ({}))`. That is not enough
   * for this one: an empty object would flow on as a successful reply with no trades, and the
   * caller would import nothing and say "you are up to date".
   */
  const body = await res.text();

  let data: T & {
    error?: string;
    detail?: string;
    syncsRemaining?: number;
    syncsPerDay?: number;
    syncCredits?: number;
  };

  try {
    data = JSON.parse(body) as typeof data;
  } catch (err) {
    throw new BrokerReplyError(res.status, body, { cause: err });
  }
  if (!res.ok) {
    // A failed sync still spends the allowance unless the server refunded it, and the badge used
    // to have no way of learning that — it only updated on success, so a run of failures drained
    // the meter invisibly and every error still said the user had syncs left. The counts ride
    // along on the failure so the caller can correct the display either way.
    throw new BrokerApiError(
      data.error ?? 'Request failed',
      data.syncsRemaining,
      data.syncsPerDay,
      data.detail,
      data.syncCredits,
      res.status,
    );
  }
  return data;
}

/** Whether the site owner has configured SnapTrade credentials at all. Safe to call unauthenticated. */
export async function checkBrokerConnectAvailable(): Promise<boolean> {
  try {
    const res = await fetch('/api/broker-status');
    if (!res.ok) return false;
    const data = (await res.json()) as { configured?: boolean };
    return Boolean(data.configured);
  } catch {
    return false;
  }
}

/** Starts a broker connection: returns the SnapTrade connection portal URL to open/redirect to. */
export async function startBrokerConnect(broker: SupportedBroker): Promise<{ redirectURI: string }> {
  return brokerApiPost({ action: 'connect', broker });
}

/** Lists the caller's connected broker accounts (empty + registered:false if none yet). */
export async function fetchBrokerStatus(): Promise<BrokerStatus> {
  return brokerApiPost({ action: 'status' });
}

/**
 * Pulls activity for one connected account and maps it into ready-to-save trades. With no
 * startDate/endDate, pulls the account's full known history (not just a recent window), paginating
 * through everything SnapTrade has on file.
 */
export async function syncBrokerAccount(
  accountId: string,
  startDate?: string,
  endDate?: string,
): Promise<{
  trades: ParsedTradeInput[];
  activityCount: number;
  totalActivityCount: number;
  truncated: boolean;
  /** Closing fills whose opening trade is older than the history the brokerage returned. */
  unmatchedCloses?: number;
  /** Positions opened by a sale with no prior purchase — a real short, or a pre-existing holding. */
  assumedShorts?: number;
  /** Symbol-days where buys and sells had no time of day, so their pairing follows feed order. */
  inferredOrderDays?: number;
  /** Rows skipped by activity type: dividends, transfers, splits, fees. */
  ignored?: Record<string, number>;
  /** Fills whose fee was reported as a negative number; treated as a cost. */
  negativeFees?: number;
  /** Syncs left today on this plan, counted server-side. Includes any banked bonus syncs. */
  syncsRemaining?: number;
  syncsPerDay?: number;
  /** The bonus part of syncsRemaining, if any. */
  syncCredits?: number;
}> {
  return brokerApiPost({ action: 'sync', accountId, startDate, endDate });
}

/** Disconnects a broker connection. */
export async function disconnectBroker(authorizationId: string): Promise<void> {
  await brokerApiPost({ action: 'disconnect', authorizationId });
}
