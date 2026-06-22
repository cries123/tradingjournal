export async function compressImage(file: File, maxWidth = 1280, quality = 0.82): Promise<File> {
  if (!file.type.startsWith('image/')) return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  if (scale >= 1 && file.size < 800_000) {
    bitmap.close();
    return file;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return file;
  }

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  );

  if (!blob) return file;

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'screenshot';
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
}
