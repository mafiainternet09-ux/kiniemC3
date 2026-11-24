import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { auth, storage } from './firebase';
import type { MediaType } from '../types/memory';
import {
  buildUploadChunkPlan,
  calculateChunkedProgressPercent,
  sanitizeUploadSessionId,
  UPLOAD_CHUNK_BYTES,
} from '../utils/uploadChunking';

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

function sendSingleXhrUpload(
  endpoint: string,
  payload: Blob,
  headers: Record<string, string>,
  onLoadProgress: (loadedBytes: number) => void
): Promise<{ status: number; responseText: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint, true);
    Object.entries(headers).forEach(([key, val]) => {
      xhr.setRequestHeader(key, val);
    });

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable) {
        onLoadProgress(evt.loaded);
      }
    };

    xhr.onload = () => {
      resolve({ status: xhr.status, responseText: xhr.responseText });
    };

    xhr.onerror = () => reject(new Error('Không thể kết nối máy chủ để tải tệp lên.'));
    xhr.send(payload);
  });
}

async function uploadBlobToAppServer(
  blob: Blob,
  yearCode: string,
  mediaCategory: 'image' | 'video' | 'thumbnail',
  fileName: string,
  contentType: string,
  onProgress: (percent: number) => void
): Promise<{ url: string; storagePath: string }> {
  const initialToken = await auth.currentUser?.getIdToken();
  if (!initialToken) {
    throw new Error('Vui lòng đăng nhập lại bằng tài khoản Google C3 để tải tệp lên.');
  }

  if (blob.size <= UPLOAD_CHUNK_BYTES) {
    const { status, responseText } = await sendSingleXhrUpload(
      '/api/media/upload',
      blob,
      {
        Authorization: `Bearer ${initialToken}`,
        'Content-Type': contentType || 'application/octet-stream',
        'X-Year-Code': yearCode,
        'X-Media-Type': mediaCategory,
        'X-File-Name': encodeURIComponent(fileName),
      },
      (loaded) => {
        if (blob.size > 0) {
          onProgress(Math.min(99, Math.round((loaded / blob.size) * 100)));
        }
      }
    );

    if (status >= 200 && status < 300) {
      try {
        const parsed = JSON.parse(responseText) as { url: string; storagePath: string };
        onProgress(100);
        return parsed;
      } catch {
        throw new Error('Phản hồi máy chủ không hợp lệ.');
      }
    }

    let msg = `Lỗi máy chủ (${status})`;
    try {
      const errJson = JSON.parse(responseText) as { error?: string };
      if (errJson.error) msg = errJson.error;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }

  const chunkPlan = buildUploadChunkPlan(blob.size, UPLOAD_CHUNK_BYTES);
  const uploadId = sanitizeUploadSessionId(
    `up_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  );
  let activeToken = initialToken;

  for (const part of chunkPlan) {
    // Refresh Firebase ID token periodically on very large uploads
    if (part.chunkIndex > 0 && part.chunkIndex % 40 === 0 && auth.currentUser) {
      activeToken = await auth.currentUser.getIdToken(true);
    }

    const sliceBlob = blob.slice(part.start, part.end);
    let lastErr: Error | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { status, responseText } = await sendSingleXhrUpload(
          '/api/media/upload/chunk',
          sliceBlob,
          {
            Authorization: `Bearer ${activeToken}`,
            'Content-Type': 'application/octet-stream',
            'X-Upload-Id': uploadId,
            'X-Chunk-Index': String(part.chunkIndex),
            'X-Total-Chunks': String(chunkPlan.length),
            'X-Chunk-Size': String(UPLOAD_CHUNK_BYTES),
            'X-Year-Code': yearCode,
            'X-Media-Type': mediaCategory,
            'X-File-Name': encodeURIComponent(fileName),
          },
          (loadedInChunk) => {
            onProgress(
              calculateChunkedProgressPercent(
                part.chunkIndex,
                loadedInChunk,
                chunkPlan.length,
                blob.size,
                UPLOAD_CHUNK_BYTES
              )
            );
          }
        );

        if (status === 401 && attempt === 0 && auth.currentUser) {
          activeToken = await auth.currentUser.getIdToken(true);
          continue;
        }

        if (status >= 200 && status < 300) {
          if (part.chunkIndex === chunkPlan.length - 1) {
            const parsed = JSON.parse(responseText) as { url: string; storagePath: string };
            onProgress(100);
            return parsed;
          }
          lastErr = null;
          break;
        }

        let errMsg = `Lỗi máy chủ (${status})`;
        try {
          const errJson = JSON.parse(responseText) as { error?: string };
          if (errJson.error) errMsg = errJson.error;
        } catch {
          // ignore
        }
        const err = new Error(errMsg);
        if (status >= 500 && status !== 507 && attempt < 2) {
          lastErr = err;
          await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
          continue;
        }
        throw err;
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error('Lỗi kết nối khi tải mảnh tệp.');
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
          continue;
        }
        throw lastErr;
      }
    }

    if (lastErr) throw lastErr;
  }

  throw new Error('Không thể hoàn tất phiên tải lên phân mảnh.');
}

let cachedFirebaseStorageAvailable: boolean | null = null;

async function isFirebaseStorageAvailable(): Promise<boolean> {
  if (cachedFirebaseStorageAvailable !== null) {
    return cachedFirebaseStorageAvailable;
  }
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    if (res.ok) {
      const data = (await res.json()) as { storageBucketAvailable?: boolean };
      if (typeof data.storageBucketAvailable === 'boolean') {
        cachedFirebaseStorageAvailable = data.storageBucketAvailable;
        return cachedFirebaseStorageAvailable;
      }
    }
  } catch {
    // ignore health probe error and fall back to runtime check
  }
  return true;
}

function tryUploadToFirebaseStorage(
  blob: Blob,
  storagePath: string,
  contentType: string,
  onProgress: (percent: number) => void
): Promise<{ url: string; storagePath: string }> {
  const storageRef = ref(storage, storagePath);
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, blob, { contentType });
    let lastBytes = 0;
    let finished = false;

    // Abort quickly if Firebase Storage stalls at 0 bytes (e.g. Storage bucket not enabled or CORS blocked)
    const stallTimer = setTimeout(() => {
      if (!finished && lastBytes === 0) {
        finished = true;
        try {
          task.cancel();
        } catch {
          // ignore
        }
        reject(new Error('storage/stall-timeout'));
      }
    }, 2500);

    task.on(
      'state_changed',
      (snapshot) => {
        if (snapshot.bytesTransferred > 0) {
          lastBytes = snapshot.bytesTransferred;
        }
        const pct = snapshot.totalBytes
          ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
          : 0;
        onProgress(pct);
      },
      (error) => {
        if (finished) return;
        finished = true;
        clearTimeout(stallTimer);
        reject(error);
      },
      async () => {
        if (finished) return;
        finished = true;
        clearTimeout(stallTimer);
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          resolve({ url, storagePath });
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

/**
 * Uploads media to Firebase Storage when its bucket is provisioned; otherwise uploads directly
 * through the authenticated Express /api/media/upload storage route without 404/CORS stalls.
 */
export async function uploadBlobToFirebaseStorage(
  blob: Blob,
  storagePath: string,
  contentType: string,
  onProgress: (percent: number) => void
): Promise<{ url: string; storagePath: string }> {
  const storageAvailable = await isFirebaseStorageAvailable();
  if (storageAvailable) {
    try {
      return await tryUploadToFirebaseStorage(blob, storagePath, contentType, onProgress);
    } catch {
      cachedFirebaseStorageAvailable = false;
    }
  }

  const parts = storagePath.split('/');
  const yearCode = parts[1] || '12C3';
  const mediaCategoryRaw = parts[2] || 'image';
  const mediaCategory: 'image' | 'video' | 'thumbnail' =
    mediaCategoryRaw === 'video' || mediaCategoryRaw === 'thumbnail' ? mediaCategoryRaw : 'image';
  const fileName = parts.slice(3).join('_') || `upload-${Date.now()}`;
  onProgress(5);
  return await uploadBlobToAppServer(blob, yearCode, mediaCategory, fileName, contentType, onProgress);
}
