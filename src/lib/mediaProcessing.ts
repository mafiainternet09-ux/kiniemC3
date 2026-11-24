import { auth } from './firebase';
import type { MediaType } from '../types/memory';
import { getMaxMediaUploadBytes } from '../utils/uploadChunking';

export function detectMediaType(file: File): MediaType {
  if (file.type.startsWith('video/')) return 'video';
  if (/\.(mp4|mov|webm|m4v|avi|mkv|3gp|ogv)$/i.test(file.name)) return 'video';
  return 'image';
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Strips EXIF/GPS metadata from an uploaded image by re-encoding it cleanly on an HTML5 canvas.
 * Falls back safely to the original file if decoding takes too long or fails (e.g. HEIC).
 */
export async function stripImageExifGps(file: File): Promise<Blob> {
  if (
    file.type === 'image/svg+xml' ||
    file.type === 'image/gif' ||
    /\.(heic|heif)$/i.test(file.name)
  ) {
    return file;
  }

  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    let settled = false;

    const finish = (result: Blob) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      URL.revokeObjectURL(objectUrl);
      resolve(result);
    };

    const timer = setTimeout(() => finish(file), 6000);

    img.onload = () => {
      try {
        const maxDim = 2400;
        let width = img.naturalWidth || 1200;
        let height = img.naturalHeight || 900;

        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish(file);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const targetType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        canvas.toBlob(
          (blob) => finish(blob || file),
          targetType,
          0.9
        );
      } catch {
        finish(file);
      }
    };

    img.onerror = () => finish(file);
    img.src = objectUrl;
  });
}

/**
 * Extracts a clean JPEG thumbnail frame and reads video duration in seconds.
 */
export async function extractVideoThumbnail(
  file: File
): Promise<{ blob: Blob | null; durationSec: number }> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    let settled = false;
    const finish = (blob: Blob | null, durationSec: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      URL.revokeObjectURL(objectUrl);
      resolve({ blob, durationSec });
    };

    const timer = setTimeout(() => {
      const dur = Number.isFinite(video.duration) ? Math.round(video.duration) : 0;
      finish(null, dur);
    }, 3500);

    video.onloadedmetadata = () => {
      const durationSec = Number.isFinite(video.duration) ? Math.round(video.duration) : 0;
      const seekTarget = durationSec > 2 ? 1.2 : Math.max(0, durationSec * 0.25);
      try {
        video.currentTime = seekTarget;
      } catch {
        finish(null, durationSec);
      }
    };

    video.onseeked = () => {
      try {
        const width = video.videoWidth || 640;
        const height = video.videoHeight || 360;
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(width, 960);
        canvas.height = Math.round((canvas.width / width) * height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish(null, Math.round(video.duration || 0));
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => finish(blob, Math.round(video.duration || 0)),
          'image/jpeg',
          0.85
        );
      } catch {
        finish(null, Math.round(video.duration || 0));
      }
    };

    video.onerror = () => finish(null, 0);
    video.src = objectUrl;
  });
}

export async function fileToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || '');
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

interface CloudinaryUploadSignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  publicId: string;
  resourceType: 'image' | 'video';
}

async function requestCloudinaryUploadSignature(
  yearCode: string,
  mediaCategory: 'image' | 'video' | 'thumbnail',
  fileName: string
): Promise<CloudinaryUploadSignature> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error('Vui lòng đăng nhập lại bằng tài khoản Google C3 để tải tệp lên.');
  }

  const response = await fetch('/api/media/sign-upload', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ yearCode, mediaCategory, fileName }),
  });

  let data: (CloudinaryUploadSignature & { error?: string }) | null = null;
  try {
    data = (await response.json()) as CloudinaryUploadSignature & { error?: string };
  } catch {
    // Handled below with a safe fallback message.
  }

  if (!response.ok || !data?.signature || !data?.publicId || !data?.cloudName || !data?.apiKey) {
    throw new Error(data?.error || ('Không thể xác thực tải lên (' + response.status + ').'));
  }
  return data;
}

function uploadDirectlyToCloudinary(
  signed: CloudinaryUploadSignature,
  blob: Blob,
  fileName: string,
  onProgress: (percent: number) => void
): Promise<{ url: string; storagePath: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();

    formData.append('file', blob, fileName);
    formData.append('api_key', signed.apiKey);
    formData.append('timestamp', String(signed.timestamp));
    formData.append('public_id', signed.publicId);
    formData.append('overwrite', 'false');
    formData.append('signature', signed.signature);

    xhr.open(
      'POST',
      'https://api.cloudinary.com/v1_1/' +
        encodeURIComponent(signed.cloudName) +
        '/' +
        signed.resourceType +
        '/upload',
      true
    );
    xhr.timeout = 10 * 60 * 1000;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(99, Math.max(1, Math.round((event.loaded / event.total) * 99))));
      }
    };

    xhr.onload = () => {
      let result: {
        secure_url?: string;
        public_id?: string;
        error?: { message?: string };
      } = {};
      try {
        result = JSON.parse(xhr.responseText) as typeof result;
      } catch {
        reject(new Error('Cloudinary trả về dữ liệu không hợp lệ.'));
        return;
      }

      if (xhr.status < 200 || xhr.status >= 300 || !result.secure_url || !result.public_id) {
        reject(
          new Error(
            result.error?.message ||
              ('Cloudinary không thể nhận tệp này (mã ' + xhr.status + '). Vui lòng thử lại.')
          )
        );
        return;
      }

      onProgress(100);
      resolve({
        url: result.secure_url,
        storagePath: 'cloudinary:' + signed.resourceType + ':' + result.public_id,
      });
    };

    xhr.onerror = () => reject(new Error('Mất kết nối khi tải tệp lên Cloudinary. Vui lòng thử lại.'));
    xhr.ontimeout = () => reject(new Error('Tải lên quá thời gian chờ. Vui lòng thử lại với mạng ổn định hơn.'));
    xhr.send(formData);
  });
}

/**
 * Uploads a media blob directly from the browser to Cloudinary.
 * A Vercel API function signs the request after verifying the Firebase user.
 * The Cloudinary API secret is never sent to the browser.
 */
export async function uploadBlobToCloudinary(
  blob: Blob,
  storagePath: string,
  _contentType: string,
  onProgress: (percent: number) => void
): Promise<{ url: string; storagePath: string }> {
  const parts = storagePath.split('/');
  const yearCode = parts[1] || '12C3';
  const rawCategory = parts[2] || 'image';
  const mediaCategory: 'image' | 'video' | 'thumbnail' =
    rawCategory === 'video' || rawCategory === 'thumbnail' ? rawCategory : 'image';
  const fileName = parts.slice(3).join('_') || ('upload-' + Date.now());

  const maxBytes = getMaxMediaUploadBytes(mediaCategory === 'video' ? 'video' : 'image');
  if (blob.size > maxBytes) {
    const maxLabel = mediaCategory === 'video' ? '100 MB' : '10 MB';
    throw new Error('Tệp vượt quá giới hạn ' + maxLabel + '/tệp của Cloudinary.');
  }

  onProgress(2);
  const signed = await requestCloudinaryUploadSignature(yearCode, mediaCategory, fileName);
  onProgress(5);
  return uploadDirectlyToCloudinary(signed, blob, fileName, onProgress);
}

// Backwards-compatible export while the existing upload UI uses this function name.
export const uploadBlobToFirebaseStorage = uploadBlobToCloudinary;
