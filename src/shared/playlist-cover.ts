import { t } from './i18n';

export function coverCrop(width: number, height: number) {
  const size = Math.min(width, height);
  return { x: (width - size) / 2, y: (height - size) / 2, size };
}
export async function preparePlaylistCover(file: File): Promise<string> {
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    file.size > 8 * 1024 * 1024
  ) {
    throw new Error(t('Выберите JPG, PNG или WebP размером до 8 МБ.'));
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(t('Не удалось прочитать обложку'));
  }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width > 8192 || bitmap.height > 8192)
      throw new Error(t('Не удалось прочитать изображение или превышен размер 8192×8192.'));
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = Math.min(512, bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error(t('Не удалось прочитать обложку'));
    context.imageSmoothingQuality = 'high';
    const crop = coverCrop(bitmap.width, bitmap.height);
    context.drawImage(
      bitmap,
      crop.x,
      crop.y,
      crop.size,
      crop.size,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    return canvas.toDataURL('image/webp', 0.88);
  } finally {
    bitmap.close();
  }
}
