export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1000 * 1000; // Cloudinary Free image upload limit: 10 MB
export const MAX_VIDEO_UPLOAD_BYTES = 100 * 1000 * 1000; // Cloudinary Free video upload limit: 100 MB
export const MAX_MEDIA_UPLOAD_BYTES = MAX_VIDEO_UPLOAD_BYTES;

export function getMaxMediaUploadBytes(mediaType: 'image' | 'video'): number {
  return mediaType === 'video' ? MAX_VIDEO_UPLOAD_BYTES : MAX_IMAGE_UPLOAD_BYTES;
}

export interface ChunkPlanItem {
  chunkIndex: number;
  start: number;
  end: number;
  byteLength: number;
}

export function buildUploadChunkPlan(
  totalBytes: number,
  chunkSizeBytes = UPLOAD_CHUNK_BYTES
): ChunkPlanItem[] {
  if (!Number.isFinite(totalBytes) || totalBytes <= 0) return [];
  const safeChunkSize = Math.max(1024, Math.floor(chunkSizeBytes));
  const totalChunks = Math.ceil(totalBytes / safeChunkSize);
  const plan: ChunkPlanItem[] = [];
  for (let i = 0; i < totalChunks; i++) {
    const start = i * safeChunkSize;
    const end = Math.min(totalBytes, start + safeChunkSize);
    plan.push({
      chunkIndex: i,
      start,
      end,
      byteLength: end - start,
    });
  }
  return plan;
}

export function sanitizeUploadSessionId(raw: string | undefined | null): string {
  const clean = String(raw ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 64);
  if (clean.length >= 8) return clean;
  return `up${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function calculateChunkedProgressPercent(
  chunkIndex: number,
  loadedInChunk: number,
  totalChunks: number,
  totalBytes: number,
  chunkSizeBytes = UPLOAD_CHUNK_BYTES
): number {
  if (!Number.isFinite(totalBytes) || totalBytes <= 0 || totalChunks <= 0) return 0;
  const completedBefore = Math.max(0, chunkIndex) * chunkSizeBytes;
  const totalUploaded = Math.min(totalBytes, completedBefore + Math.max(0, loadedInChunk));
  return Math.min(99, Math.max(1, Math.round((totalUploaded / totalBytes) * 100)));
}
