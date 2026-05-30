import { getAuthToken } from './auth';

const AUTH_URL = import.meta.env.VITE_AUTH_URL || 'https://auth.skrebeyko.ru';

interface SignResponse {
  uploadUrl: string;
  publicUrl: string;
}

const sanitizeFileName = (raw: string, contentType: string): string => {
  const rawExt = (contentType.split('/')[1] || 'jpg').toLowerCase();
  const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
  const base = raw
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
  return `${base || `image-${Date.now()}`}.${ext}`;
};

export const convertImageToJpegFile = (
  file: File,
  maxSize = 1200,
  quality = 0.82,
): Promise<File> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Не удалось прочитать файл изображения.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () =>
        reject(new Error('Формат изображения не поддерживается. Сохраните как JPG/PNG и попробуйте снова.'));
      img.onload = () => {
        const ratio = Math.min(1, maxSize / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * ratio));
        const height = Math.max(1, Math.round(img.height * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Не удалось обработать изображение.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Не удалось подготовить изображение для загрузки.'));
              return;
            }
            const name = sanitizeFileName(file.name || `image-${Date.now()}`, 'image/jpeg');
            resolve(new File([blob], name, { type: 'image/jpeg' }));
          },
          'image/jpeg',
          quality,
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });

export const signedUploadToStorage = async (file: File, folder: string): Promise<string> => {
  const token = getAuthToken();
  if (!token) throw new Error('Требуется авторизация.');

  const contentType = file.type || 'image/jpeg';
  const fileName = sanitizeFileName(file.name || 'image.jpg', contentType);

  const signRes = await fetch(`${AUTH_URL}/storage/sign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ folder, fileName, contentType }),
  });

  if (!signRes.ok) {
    const detail = await signRes.text().catch(() => '');
    throw new Error(`Не удалось получить ссылку для загрузки (${signRes.status}). ${detail}`.trim());
  }

  const sign = (await signRes.json()) as SignResponse;
  if (!sign.uploadUrl || !sign.publicUrl) {
    throw new Error('Сервер вернул некорректные ссылки для загрузки.');
  }

  const putRes = await fetch(sign.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  });

  if (!putRes.ok) {
    const detail = await putRes.text().catch(() => '');
    throw new Error(`Ошибка загрузки в хранилище (${putRes.status}). ${detail}`.trim());
  }

  return sign.publicUrl;
};

export const uploadNotebookImage = async (rawFile: File): Promise<string> => {
  const compressed = await convertImageToJpegFile(rawFile, 1200, 0.82);
  return signedUploadToStorage(compressed, 'meetings/notebooks');
};
