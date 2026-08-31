/**
 * What to call the signed-in person in the UI.
 *
 * Pure and separate because the fallback chain has more traps than it looks like it has. A Firebase
 * user can carry `displayName: ''` rather than null, an email account created before usernames
 * shipped has no username at all, and `username` is loaded asynchronously — so for the first few
 * hundred milliseconds after sign-in every field here can legitimately be empty. Rendering an empty
 * string in the nav reads as a broken header, so every branch is tested rather than assumed.
 */
export interface NamedAccount {
  displayName?: string | null;
  email?: string | null;
}

export function accountDisplayName(
  username: string | null | undefined,
  user: NamedAccount | null | undefined,
): string {
  const claimed = username?.trim();
  if (claimed) return claimed;

  const profile = user?.displayName?.trim();
  if (profile) return profile;

  // Local part only — showing a full email address in a public page header hands it to anyone
  // reading over the user's shoulder, and it rarely fits the space anyway.
  const emailLocal = user?.email?.split('@')[0]?.trim();
  if (emailLocal) return emailLocal;

  return 'Your account';
}

/** The single letter shown in the avatar circle when there isn't room for the whole name. */
export function accountInitial(
  username: string | null | undefined,
  user: NamedAccount | null | undefined,
): string {
  const name = accountDisplayName(username, user);
  // Array spread, not [0]: a name starting with an emoji or a non-BMP character would otherwise
  // be sliced mid-surrogate and render as a replacement box.
  return ([...name][0] ?? '?').toUpperCase();
}
