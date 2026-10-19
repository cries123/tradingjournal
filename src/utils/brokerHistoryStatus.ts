/**
 * SnapTrade's own word on whether an account's transaction history has finished its first load —
 * and every sentence the trader is shown about it.
 *
 * A new connection answers with nothing for a while. SnapTrade pulls the brokerage's history in
 * the background and returns an empty activity list until that is done, so a Sync pressed six
 * minutes after connecting looks exactly like a broker with no trades. One trader did that, and
 * again at fourteen minutes; three days later the same sync brought back 880 activities going back
 * a year. Nothing on screen told "the broker sent nothing" from "SnapTrade has not finished asking
 * yet", and the two empty syncs were written into the history as spent for nothing — which they
 * were not, either. People read "no activity" as "it does not work", and cancel.
 *
 * The signal is `sync_status.transactions.initial_sync_completed` on each account from
 * listUserAccounts. It is read here, in one place, by the status screen, the manual sync and the
 * morning import, so the three cannot disagree about what "still loading" means. A missing field
 * reads as loaded. Only an explicit `false` is the signal, so a brokerage or an SDK version that
 * does not report it behaves exactly as before — and the flag is not the only evidence: an empty
 * feed on a pull that asked for the whole history is read the same way by the copy below, whatever
 * the flag said.
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

/*
 * The copy. Jay's words: "broker is still sending snaptrade your trade history, please wait and
 * try again in 30 minutes" — in that order, because the trader needs what is happening before
 * what to do. SnapTrade is named because that is who the broker is sending it to, and the wait is
 * half an hour rather than "a few minutes": the connection that prompted this was still empty at
 * fourteen minutes, and a shorter promise invites the third empty press.
 */

/** What is happening and what to do, present tense, for the connect screen. */
export function historyLoadingLine(institution: string | null | undefined): string {
  return `${institution || 'Your broker'} is still sending SnapTrade your trade history, so there is nothing to import yet. Please wait and try again in about 30 minutes.`;
}

/**
 * What the Sync button answers while the history is loading. Says the cost out loud — none —
 * because the complaint this exists to prevent was about syncs being wasted as much as about
 * syncs being slow.
 */
export function historyLoadingMessage(institution: string | null | undefined): string {
  return `${historyLoadingLine(institution)} This did not use a sync.`;
}

/** The short form, for the account row on the connect screen. */
export function historyLoadingNote(institution: string | null | undefined): string {
  return `${institution || 'Your broker'} is still sending your trade history — try again in about 30 minutes.`;
}

/** The same fact in a history row, where the sync is in the past. */
export function historyWasLoadingRow(institution: string | null | undefined): string {
  return `${institution || 'Your broker'} was still sending SnapTrade your trade history, so there was nothing to import yet.`;
}

/**
 * The other way an empty sync is normal.
 *
 * SnapTrade delivers transactions a day late on every plan it sells, so a sync pressed on the day
 * of the trades finds nothing new. Said so the trader does not read "no new trades" as "it missed
 * today".
 */
export const NEXT_DAY_NOTE = 'Trades usually arrive the day after they happen.';

/** An empty pull over a narrow window, on an account that has imported before. */
export function noNewTradesLine(institution: string | null | undefined): string {
  return `No new trades from ${institution || 'your broker'} since your last sync. ${NEXT_DAY_NOTE}`;
}
