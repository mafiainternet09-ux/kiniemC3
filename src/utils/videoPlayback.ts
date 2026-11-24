export type TranscodeAction = 'ready' | 'remux' | 'transcode';

export interface VideoProbeSummary {
  ext: string;
  codecName?: string;
  pixFmt?: string;
}

export function needsWebTranscode(probe: VideoProbeSummary): TranscodeAction {
  const ext = probe.ext.toLowerCase();
  const codec = (probe.codecName || '').toLowerCase();
  const pixFmt = (probe.pixFmt || '').toLowerCase();

  const isBrowserH264 = codec === 'h264' && (pixFmt === '' || pixFmt === 'yuv420p' || pixFmt === 'yuvj420p');
  if (ext === '.mp4' && isBrowserH264) {
    return 'ready';
  }
  if (isBrowserH264 && (ext === '.mov' || ext === '.m4v')) {
    return 'remux';
  }
  return 'transcode';
}

export function resolveSafeUploadRelativePath(rawUrl: string): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed.startsWith('/uploads/')) return null;

  const withoutQuery = trimmed.split(/[?#]/)[0];
  let decoded = withoutQuery;
  try {
    decoded = decodeURIComponent(withoutQuery);
  } catch {
    return null;
  }

  if (decoded.includes('\0') || decoded.includes('\\') || decoded.includes('..')) {
    return null;
  }

  const rel = decoded.slice('/uploads/'.length);
  if (!rel || rel.startsWith('.tmp/') || rel === '.tmp' || rel.endsWith('.tmp.mp4')) {
    return null;
  }
  return rel;
}

export function parseFfmpegProgressPercent(
  progressText: string,
  durationSec: number
): number | null {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return null;
  const usMatches = [...progressText.matchAll(/out_time_us=(\d+)/g)];
  const msMatches = [...progressText.matchAll(/out_time_ms=(\d+)/g)];
  const lastMatch =
    usMatches.length > 0
      ? usMatches[usMatches.length - 1]
      : msMatches.length > 0
      ? msMatches[msMatches.length - 1]
      : null;

  if (!lastMatch) return null;
  const microSeconds = Number(lastMatch[1]);
  if (!Number.isFinite(microSeconds) || microSeconds < 0) return null;

  const currentSec = microSeconds / 1_000_000;
  return Math.min(99, Math.max(1, Math.round((currentSec / durationSec) * 100)));
}

export function extractYoutubeVideoIdOrNull(rawUrl: string): string | null {
  const raw = (rawUrl || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    if (host.includes('youtu.be')) {
      const id = parsed.pathname.split('/').filter(Boolean)[0];
      return id && /^[a-zA-Z0-9_-]{5,32}$/.test(id) ? id : null;
    }
    if (host.includes('youtube.com')) {
      const v = parsed.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{5,32}$/.test(v)) return v;
      const parts = parsed.pathname.split('/').filter(Boolean);
      const embedIdx = parts.findIndex((p) => p === 'embed' || p === 'shorts');
      if (embedIdx >= 0 && parts[embedIdx + 1] && /^[a-zA-Z0-9_-]{5,32}$/.test(parts[embedIdx + 1])) {
        return parts[embedIdx + 1];
      }
    }
  } catch {
    return null;
  }
  return null;
}
