export const LEGACY_ACCOUNT_ID = 'default';

export function resolveTradeAccountId(accountId: string | undefined, fallbackId = LEGACY_ACCOUNT_ID): string {
  return accountId ?? fallbackId;
}
