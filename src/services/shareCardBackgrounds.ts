import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { getFirebaseStorage } from '../lib/firebase';

/** Keep the saved-backgrounds list from growing forever — oldest drops off once a user uploads
 *  past this many. Matches what fits comfortably in the picker row without scrolling forever. */
export const MAX_SHARE_CARD_BACKGROUNDS = 8;

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

/** Downscales/re-encodes an uploaded image client-side before it ever reaches Storage — a phone
 *  photo can be 10+ MB and far larger than a share card needs; this keeps uploads fast and
 *  Storage usage sane without the user having to think about it. */
async function resizeForShareCard(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process this image');
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', JPEG_QUALITY));
    if (!blob) throw new Error('Could not process this image');
    return blob;
  } finally {
    bitmap.close();
  }
}

/** Resizes, uploads to Firebase Storage under this user's own folder, and returns a public
 *  download URL. Callers are responsible for saving that URL onto the user's settings
 *  (shareCardBackgrounds) so it shows up as a saved option next time — this function only
 *  handles the file itself. */
export async function uploadShareCardBackground(uid: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file.');
  }

  const blob = await resizeForShareCard(file);
  const path = `shareCardBackgrounds/${uid}/${Date.now()}.jpg`;
  const storageRef = ref(getFirebaseStorage(), path);
  await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
  return getDownloadURL(storageRef);
}

/** Best-effort delete — if the object's already gone or Storage rules reject it, this quietly
 *  no-ops rather than blocking the user from removing the URL from their saved list. */
export async function deleteShareCardBackground(url: string): Promise<void> {
  try {
    await deleteObject(ref(getFirebaseStorage(), url));
  } catch {
    /* already gone, or not ours to delete — the settings-side removal is what actually matters */
  }
}
