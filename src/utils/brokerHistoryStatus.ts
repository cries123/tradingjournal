/**
 * SnapTrade's own word on whether an account's transaction history has finished its first load.
 *
 * A new connection answers with nothing for its first few minutes. SnapTrade pulls the brokerage's
 * history in the background and returns an empty activity list until that is done, so a Sync
 * pressed six minutes after connecting looks exactly like a broker with no trades. One trader did
 * that, and again at fourteen minutes; three days later the same sync brought back 880 activities
 * going back a year. Nothing on screen told "the broker sent nothing" from "SnapTrade has not
 * finished asking yet", and the two empty syncs were written into the history as spent for nothing
 * — which they were not, either.
 *
 * The signal is `sync_status.transactions.initial_sync_completed` on each account from
 * listUserAccounts. It is read here, in one place, by the status screen, the manual sync and the
 * morning import, so the three cannot disagree about what "still loading" means.
 *
 * A missing field reads as loaded. Only an explicit `false` is the signal, so a brokerage or an
 * SDK version that does not report it behaves exactly as before.
 */

export interface HistoryStatus {
  /** False only while SnapTrade says the first load of transactions has not finished. */
  loaded: boolean;
  /** The oldest transaction SnapTrade holds, YYYY-MM-DD, when it said. */
  firstTransactionDate: string | null;
}

export function readHistoryStatus(syncStatus: unknown): HistoryStatus {
  const transactions = (syncStatus as { transactions?: unknown } | null | undefined)?.transactions;
  const t =
    transactions && typeof transactions === 'object'
      ? (transactions as { initial_sync_completed?: unknown; first_transaction_date?: unknown })
      : null;
  return {
    loaded: t?.initial_sync_completed !== false,
    firstTransactionDate: typeof t?.first_transaction_date === 'string' ? t.first_transaction_date : null,
  };
}

/** True while SnapTrade is still loading this account's history, so a pull would come back empty. */
export function historyStillLoading(syncStatus: unknown): boolean {
  return !readHistoryStatus(syncStatus).loaded;
}

/**
 * What the Sync button answers while the history is loading.
 *
 * Four short sentences, in the order the trader needs them: what is happening, how long it takes,
 * what to do, and what it cost — nothing. The last one is said out loud because the complaint this
 * exists to prevent was about syncs being wasted, not about syncs being slow.
 */
export function historyLoadingMessage(institution: string | null | undefined): string {
  return `${institution || 'Your broker'} is still sending us your history. This usually takes a few minutes after connecting. Try again shortly. This did not use a sync.`;
}

/** The short form, for the account row on the connect screen. */
export function historyLoadingNote(institution: string | null | undefined): string {
  return `Still loading your history from ${institution || 'your broker'} — usually a few minutes after connecting.`;
}
