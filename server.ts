import express from 'express';
import { execFile, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel, Type, type Content } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };
import { matchMediaCatalog, parseQueryLocally } from './src/utils/memorySearch.ts';
import {
  buildAssistantPromptContext,
  findMatchingSeats,
  runLocalAssistantFallback,
} from './src/utils/assistantAgent.ts';
import {
  needsWebTranscode,
  parseFfmpegProgressPercent,
  resolveSafeUploadRelativePath,
} from './src/utils/videoPlayback.ts';
import type {
  AssistantChatTurn,
  ClassroomSeat,
  GuestbookNote,
  MediaItem,
  ParsedSearchIntent,
  RouteView,
  SiteConfig,
  UserRole,
  YearEvent,
} from './src/types/memory.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

let cachedGeminiClient: { key: string; client: GoogleGenAI } | null = null;
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  if (cachedGeminiClient && cachedGeminiClient.key === apiKey) {
    return cachedGeminiClient.client;
  }
  const client = new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: 30000,
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
  cachedGeminiClient = { key: apiKey, client };
  return client;
}

async function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  ms: number,
  timeoutMessage: string
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error(timeoutMessage));
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const UPLOADS_ROOT = path.resolve(__dirname, 'uploads');
const UPLOADS_TMP_ROOT = path.join(UPLOADS_ROOT, '.tmp');
fs.mkdirSync(UPLOADS_ROOT, { recursive: true });
fs.mkdirSync(UPLOADS_TMP_ROOT, { recursive: true });

const CHUNK_TMP_MAX_AGE_MS = 2 * 60 * 60 * 1000;
function cleanupStaleChunkFiles(): void {
  try {
    const entries = fs.readdirSync(UPLOADS_TMP_ROOT, { withFileTypes: true });
    const cutoff = Date.now() - CHUNK_TMP_MAX_AGE_MS;
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.part')) continue;
      const fullPath = path.join(UPLOADS_TMP_ROOT, entry.name);
      const stat = fs.statSync(fullPath);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(fullPath);
      }
    }
  } catch {
    // Ignore non-fatal temp cleanup errors
  }
}

function parseSafeUploadMeta(req: express.Request) {
  const rawYear = String(req.headers['x-year-code'] || '12C3');
  const yearCode = ['10A3', '11B3', '12C3', 'avatars', 'covers'].includes(rawYear)
    ? rawYear
    : '12C3';

  const rawMediaType = String(req.headers['x-media-type'] || 'image');
  const mediaType = ['image', 'video', 'thumbnail'].includes(rawMediaType)
    ? rawMediaType
    : 'image';

  const rawHeaderName = String(req.headers['x-file-name'] || `memory-${Date.now()}`);
  let rawName = rawHeaderName;
  try {
    rawName = decodeURIComponent(rawHeaderName);
  } catch {
    rawName = rawHeaderName;
  }
  const safeBase = rawName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80) || `file-${Date.now()}`;
  return { yearCode, mediaType, safeBase };
}

const execFileAsync = promisify(execFile);

interface VideoTranscodeJob {
  status: 'processing' | 'ready' | 'error';
  progressPct: number;
  playUrl: string;
  error?: string;
}

const transcodeJobs = new Map<string, VideoTranscodeJob>();

async function probeVideoMeta(absPath: string): Promise<{
  codecName?: string;
  pixFmt?: string;
  durationSec: number;
}> {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=codec_name,pix_fmt:format=duration',
        '-of',
        'json',
        absPath,
      ],
      { timeout: 10000 }
    );
    const parsed = JSON.parse(stdout) as {
      streams?: Array<{ codec_name?: string; pix_fmt?: string }>;
      format?: { duration?: string };
    };
    const stream = parsed.streams?.[0];
    const durationSec = Number(parsed.format?.duration || 0);
    return {
      codecName: stream?.codec_name,
      pixFmt: stream?.pix_fmt,
      durationSec: Number.isFinite(durationSec) ? durationSec : 0,
    };
  } catch {
    return { durationSec: 0 };
  }
}

async function ensureWebPlayableVideo(
  absSourcePath: string,
  publicSourceUrl: string
): Promise<VideoTranscodeJob> {
  const webAbsPath = `${absSourcePath}.web.mp4`;
  const webPublicUrl = `${publicSourceUrl}.web.mp4`;

  if (fs.existsSync(webAbsPath) && fs.statSync(webAbsPath).size > 0) {
    const readyJob: VideoTranscodeJob = {
      status: 'ready',
      progressPct: 100,
      playUrl: webPublicUrl,
    };
    transcodeJobs.set(absSourcePath, readyJob);
    return readyJob;
  }

  const existing = transcodeJobs.get(absSourcePath);
  if (existing && (existing.status === 'processing' || existing.status === 'ready')) {
    return existing;
  }

  const ext = path.extname(absSourcePath).toLowerCase();
  const probe = await probeVideoMeta(absSourcePath);
  const action = needsWebTranscode({
    ext,
    codecName: probe.codecName,
    pixFmt: probe.pixFmt,
  });

  if (action === 'ready') {
    const readyJob: VideoTranscodeJob = {
      status: 'ready',
      progressPct: 100,
      playUrl: publicSourceUrl,
    };
    transcodeJobs.set(absSourcePath, readyJob);
    return readyJob;
  }

  const job: VideoTranscodeJob = {
    status: 'processing',
    progressPct: action === 'remux' ? 40 : 5,
    playUrl: webPublicUrl,
  };
  transcodeJobs.set(absSourcePath, job);

  const tmpOutPath = `${webAbsPath}.tmp.mp4`;
  const args =
    action === 'remux'
      ? ['-y', '-i', absSourcePath, '-c', 'copy', '-movflags', '+faststart', '-f', 'mp4', tmpOutPath]
      : [
          '-y',
          '-i',
          absSourcePath,
          '-vf',
          "scale='min(1280,iw)':-2,format=yuv420p",
          '-c:v',
          'libx264',
          '-preset',
          'superfast',
          '-crf',
          '23',
          '-c:a',
          'aac',
          '-b:a',
          '128k',
          '-movflags',
          '+faststart',
          '-progress',
          'pipe:1',
          '-nostats',
          '-f',
          'mp4',
          tmpOutPath,
        ];

  const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderrTail = '';

  child.stdout.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8');
    const pct = parseFfmpegProgressPercent(text, probe.durationSec);
    if (pct !== null && job.status === 'processing') {
      job.progressPct = Math.max(job.progressPct, pct);
    }
  });

  child.stderr.on('data', (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString('utf8')).slice(-800);
  });

  child.on('error', (err) => {
    job.status = 'error';
    job.error = err.message || 'Không thể chạy ffmpeg để tối ưu video.';
    fs.rmSync(tmpOutPath, { force: true });
  });

  child.on('close', (code) => {
    if (code === 0 && fs.existsSync(tmpOutPath) && fs.statSync(tmpOutPath).size > 0) {
      try {
        fs.renameSync(tmpOutPath, webAbsPath);
        job.status = 'ready';
        job.progressPct = 100;
        return;
      } catch (renameErr) {
        job.status = 'error';
        job.error = renameErr instanceof Error ? renameErr.message : 'Lỗi lưu tệp MP4 đã tối ưu.';
      }
    } else {
      job.status = 'error';
      job.error = 'Định dạng video nguồn không hỗ trợ chuyển đổi tự động trên máy chủ.';
      console.error('ffmpeg transcode failed:', stderrTail);
    }
    fs.rmSync(tmpOutPath, { force: true });
  });

  return job;
}

let cachedStorageAvailable: { value: boolean; checkedAt: number } | null = null;
async function checkFirebaseStorageBucket(): Promise<boolean> {
  const now = Date.now();
  if (cachedStorageAvailable && now - cachedStorageAvailable.checkedAt < 5 * 60 * 1000) {
    return cachedStorageAvailable.value;
  }
  const bucket = firebaseConfig.storageBucket;
  if (!bucket) {
    cachedStorageAvailable = { value: false, checkedAt: now };
    return false;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`https://firebasestorage.googleapis.com/v0/b/${bucket}/o`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timer);
    const available = res.status !== 404;
    cachedStorageAvailable = { value: available, checkedAt: now };
    return available;
  } catch {
    cachedStorageAvailable = { value: false, checkedAt: now };
    return false;
  }
}

async function verifyFirebaseIdToken(idToken: string): Promise<{ uid: string; emailVerified: boolean } | null> {
  if (!idToken) return null;
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseConfig.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      users?: Array<{ localId?: string; emailVerified?: boolean }>;
    };
    const user = data.users?.[0];
    if (!user?.localId) return null;
    return { uid: user.localId, emailVerified: Boolean(user.emailVerified) };
  } catch {
    return null;
  }
}

async function startServer() {
  const app = express();

  app.use(
    '/uploads',
    express.static(UPLOADS_ROOT, {
      maxAge: '7d',
      acceptRanges: true,
    })
  );

  app.post(
    '/api/media/upload/chunk',
    express.raw({ type: '*/*', limit: '8mb' }),
    async (req, res) => {
      try {
        const authHeader = req.headers.authorization || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
        const verified = await verifyFirebaseIdToken(token);
        if (!verified) {
          return res.status(401).json({ error: 'Vui lòng đăng nhập tài khoản C3 trước khi tải tệp lên.' });
        }

        const body = req.body;
        if (!Buffer.isBuffer(body) || body.length === 0) {
          return res.status(400).json({ error: 'Mảnh tệp tải lên rỗng hoặc không hợp lệ.' });
        }

        const rawUploadId = String(req.headers['x-upload-id'] || '')
          .replace(/[^a-zA-Z0-9_-]/g, '')
          .slice(0, 64);
        if (rawUploadId.length < 8) {
          return res.status(400).json({ error: 'Mã phiên tải lên không hợp lệ.' });
        }

        const chunkIndex = Number(req.headers['x-chunk-index']);
        const totalChunks = Number(req.headers['x-total-chunks']);
        const chunkSize = Number(req.headers['x-chunk-size'] || 4 * 1024 * 1024);

        if (
          !Number.isInteger(chunkIndex) ||
          !Number.isInteger(totalChunks) ||
          chunkIndex < 0 ||
          totalChunks < 1 ||
          totalChunks > 512 ||
          chunkIndex >= totalChunks ||
          !Number.isInteger(chunkSize) ||
          chunkSize < 1024 ||
          chunkSize > 8 * 1024 * 1024
        ) {
          return res.status(400).json({ error: 'Thông số phân mảnh tải lên không hợp lệ.' });
        }

        const safeUid = verified.uid.replace(/[^a-zA-Z0-9_-]/g, '');
        const partPath = path.join(UPLOADS_TMP_ROOT, `${safeUid}-${rawUploadId}.part`);

        if (chunkIndex === 0) {
          cleanupStaleChunkFiles();
        } else if (!fs.existsSync(partPath)) {
          return res.status(400).json({ error: 'Phiên tải lên phân mảnh đã hết hạn. Vui lòng thử lại.' });
        }

        const offset = chunkIndex * chunkSize;
        const fh = await fs.promises.open(partPath, chunkIndex === 0 ? 'w+' : 'r+');
        try {
          await fh.write(body, 0, body.length, offset);
        } finally {
          await fh.close();
        }

        if (chunkIndex < totalChunks - 1) {
          return res.json({ ok: true, chunkIndex, totalChunks, receivedBytes: body.length });
        }

        const { yearCode, mediaType, safeBase } = parseSafeUploadMeta(req);
        const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${safeBase}`;
        const targetDir = path.join(UPLOADS_ROOT, yearCode, mediaType);
        fs.mkdirSync(targetDir, { recursive: true });
        const targetFile = path.join(targetDir, uniqueName);
        await fs.promises.rename(partPath, targetFile);
        const stat = await fs.promises.stat(targetFile);

        const publicUrl = `/uploads/${yearCode}/${mediaType}/${uniqueName}`;
        if (mediaType === 'video') {
          void ensureWebPlayableVideo(targetFile, publicUrl);
        }
        return res.json({
          url: publicUrl,
          storagePath: `local://${yearCode}/${mediaType}/${uniqueName}`,
          size: stat.size,
        });
      } catch (err) {
        const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: string }).code : '';
        if (code === 'ENOSPC') {
          return res.status(507).json({
            error: 'Dung lượng lưu trữ tạm trên máy chủ đã đầy. Hãy xóa bớt tệp cũ hoặc kích hoạt Firebase Storage.',
          });
        }
        console.error('/api/media/upload/chunk error:', err);
        return res.status(500).json({ error: 'Không thể ghép và lưu tệp trên máy chủ.' });
      }
    }
  );

  app.post(
    '/api/media/upload',
    express.raw({ type: '*/*', limit: '25mb' }),
    async (req, res) => {
      try {
        const authHeader = req.headers.authorization || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
        const verified = await verifyFirebaseIdToken(token);
        if (!verified) {
          return res.status(401).json({ error: 'Vui lòng đăng nhập tài khoản C3 trước khi tải tệp lên.' });
        }

        const body = req.body;
        if (!Buffer.isBuffer(body) || body.length === 0) {
          return res.status(400).json({ error: 'Tệp tải lên rỗng hoặc không hợp lệ.' });
        }

        const { yearCode, mediaType, safeBase } = parseSafeUploadMeta(req);
        const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${safeBase}`;

        const targetDir = path.join(UPLOADS_ROOT, yearCode, mediaType);
        fs.mkdirSync(targetDir, { recursive: true });
        const targetFile = path.join(targetDir, uniqueName);
        await fs.promises.writeFile(targetFile, body);

        const publicUrl = `/uploads/${yearCode}/${mediaType}/${uniqueName}`;
        if (mediaType === 'video') {
          void ensureWebPlayableVideo(targetFile, publicUrl);
        }
        return res.json({
          url: publicUrl,
          storagePath: `local://${yearCode}/${mediaType}/${uniqueName}`,
          size: body.length,
        });
      } catch (err) {
        const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: string }).code : '';
        if (code === 'ENOSPC') {
          return res.status(507).json({
            error: 'Dung lượng lưu trữ tạm trên máy chủ đã đầy. Hãy xóa bớt tệp cũ hoặc kích hoạt Firebase Storage.',
          });
        }
        console.error('/api/media/upload error:', err);
        return res.status(500).json({ error: 'Không thể lưu tệp trên máy chủ.' });
      }
    }
  );

  app.use(
    '/api/media/upload',
    (err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (err && typeof err === 'object' && 'type' in err && (err as { type?: string }).type === 'entity.too.large') {
        return res.status(413).json({ error: 'Mảnh tệp vượt quá kích thước cho phép trên mỗi lần gửi.' });
      }
      if (err) {
        return res.status(400).json({ error: 'Dữ liệu tệp tải lên không hợp lệ.' });
      }
      next();
    }
  );

  app.get('/api/media/playable', async (req, res) => {
    try {
      const rawUrl = String(req.query.url || '');
      const relPath = resolveSafeUploadRelativePath(rawUrl);
      if (!relPath) {
        return res.status(400).json({ error: 'Đường dẫn video không hợp lệ.' });
      }
      const absPath = path.resolve(UPLOADS_ROOT, relPath);
      if (!absPath.startsWith(UPLOADS_ROOT + path.sep) || !fs.existsSync(absPath)) {
        return res.status(404).json({ error: 'Không tìm thấy tệp video trên máy chủ.' });
      }
      const publicUrl = `/uploads/${relPath.split(path.sep).join('/')}`;
      const job = await ensureWebPlayableVideo(absPath, publicUrl);
      return res.json(job);
    } catch (err) {
      console.error('/api/media/playable error:', err);
      return res.status(500).json({ error: 'Không thể kiểm tra khả năng phát video.' });
    }
  });

  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', async (_req, res) => {
    const storageBucketAvailable = await checkFirebaseStorageBucket();
    res.json({
      ok: true,
      storageBucketAvailable,
      geminiConfigured: Boolean(
        process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
      ),
    });
  });

  app.post('/api/ai/search', async (req, res) => {
    try {
      const { query, catalog } = req.body as {
        query?: string;
        catalog?: MediaItem[];
      };

      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return res.status(400).json({ error: 'Vui lòng nhập nội dung cần tìm kiếm.' });
      }

      const safeCatalog = Array.isArray(catalog) ? catalog : [];
      const fallbackIntent = parseQueryLocally(query);
      const ai = getGeminiClient();

      let finalIntent: ParsedSearchIntent = fallbackIntent;

      if (ai) {
        try {
          const catalogSummary = safeCatalog
            .filter((item) => item.status === 'approved')
            .slice(0, 25)
            .map((item) => ({
              id: item.id,
              y: item.yearCode,
              e: item.eventSlug,
              t: item.mediaType,
              title: item.title,
            }));

          const aiResponse = await withTimeout(
            (abortSignal) =>
              ai.models.generateContent({
                model: 'gemini-3.1-flash-lite',
                contents: `Câu hỏi của thành viên lớp C3: "${query}"\n\nKho thật (${catalogSummary.length} mục tiêu biểu, KHÔNG bịa ID):\n${JSON.stringify(catalogSummary)}`,
                config: {
                  abortSignal,
                  thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
                  systemInstruction:
                    'Bạn là trợ lý tìm kiếm kỷ niệm của tập thể 12C3 THPT Bình Sơn. ' +
                    'Phân tích câu hỏi tiếng Việt thành bộ lọc cấu trúc JSON: ' +
                    'yearCode ("10A3", "11B3", "12C3" hoặc "ALL"), ' +
                    'eventSlug ("20-10", "19-11", "20-11", "08-03", "hoi-trai", "ky-yeu", "ky-niem-khac" hoặc "ALL"), ' +
                    'mediaType ("image", "video" hoặc "ALL"), ' +
                    'keywords (0-5 từ khóa ngắn gọn để tìm kiếm trong kho thật), ' +
                    'matchedIds (mảng ID chính xác từ danh sách được cung cấp nếu khớp trực tiếp, tuyệt đối không bịa ID), ' +
                    'reply (1-2 câu tiếng Việt ấm áp, trung thực mô tả đang tìm gì; không nhận diện khuôn mặt người).',
                  responseMimeType: 'application/json',
                  responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                      yearCode: { type: Type.STRING },
                      eventSlug: { type: Type.STRING },
                      mediaType: { type: Type.STRING },
                      keywords: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                      matchedIds: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                      reply: { type: Type.STRING },
                    },
                    required: ['yearCode', 'eventSlug', 'mediaType', 'keywords', 'matchedIds', 'reply'],
                  },
                },
              }),
            15000,
            'Gemini search timeout'
          );

          const rawText = (aiResponse.text ?? '{}')
            .trim()
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/i, '');
          const parsed = JSON.parse(rawText || '{}') as {
            yearCode?: string;
            eventSlug?: string;
            mediaType?: string;
            keywords?: string[];
            matchedIds?: string[];
            reply?: string;
          };

          const validYear =
            parsed.yearCode === '10A3' ||
            parsed.yearCode === '11B3' ||
            parsed.yearCode === '12C3'
              ? parsed.yearCode
              : null;

          const validEvent =
            parsed.eventSlug === '20-10' ||
            parsed.eventSlug === '19-11' ||
            parsed.eventSlug === '20-11' ||
            parsed.eventSlug === '08-03' ||
            parsed.eventSlug === 'hoi-trai' ||
            parsed.eventSlug === 'ky-yeu' ||
            parsed.eventSlug === 'ky-niem-khac'
              ? parsed.eventSlug
              : null;

          const validType =
            parsed.mediaType === 'image' || parsed.mediaType === 'video'
              ? parsed.mediaType
              : null;

          finalIntent = {
            yearCode: validYear ?? fallbackIntent.yearCode,
            eventSlug: validEvent ?? fallbackIntent.eventSlug,
            mediaType: validType ?? fallbackIntent.mediaType,
            keywords:
              Array.isArray(parsed.keywords) && parsed.keywords.length > 0
                ? parsed.keywords
                : fallbackIntent.keywords,
            reply: parsed.reply || '',
            usedGemini: true,
          };

          // Ground results strictly against the real catalog items
          const deterministicMatches = matchMediaCatalog(safeCatalog, finalIntent, query);
          const aiIdSet = new Set(
            Array.isArray(parsed.matchedIds) ? parsed.matchedIds : []
          );
          const idVerifiedMatches = safeCatalog.filter(
            (item) =>
              item.status === 'approved' &&
              aiIdSet.has(item.id) &&
              (!finalIntent.yearCode || item.yearCode === finalIntent.yearCode) &&
              (!finalIntent.eventSlug || item.eventSlug === finalIntent.eventSlug) &&
              (!finalIntent.mediaType || item.mediaType === finalIntent.mediaType)
          );

          const mergedMap = new Map<string, MediaItem>();
          for (const item of [...deterministicMatches, ...idVerifiedMatches]) {
            mergedMap.set(item.id, item);
          }
          const finalMatches = Array.from(mergedMap.values());

          const honestReply =
            finalMatches.length > 0
              ? finalIntent.reply ||
                `Mình đã tìm thấy ${finalMatches.length} kỷ niệm khớp với yêu cầu trong kho lưu trữ C3.`
              : `Hiện chưa có ảnh hoặc video nào khớp với "${query.trim()}" trong kho lưu trữ C3. Bạn thử chọn năm học hoặc sự kiện khác nhé.`;

          return res.json({
            intent: finalIntent,
            matches: finalMatches,
            reply: honestReply,
          });
        } catch (aiError) {
          console.warn(
            'Gemini search fallback triggered:',
            aiError instanceof Error ? aiError.message : String(aiError)
          );
        }
      }

      const matches = matchMediaCatalog(safeCatalog, fallbackIntent, query);
      const reply =
        matches.length > 0
          ? `Tìm thấy ${matches.length} tư liệu phù hợp trong kho lưu trữ C3.`
          : `Hiện chưa tìm thấy ảnh hay video nào khớp với "${query.trim()}" trong kho lưu trữ.`;

      return res.json({
        intent: fallbackIntent,
        matches,
        reply,
      });
    } catch (error) {
      console.error('/api/ai/search error:', error);
      return res.status(500).json({ error: 'Không thể xử lý yêu cầu tìm kiếm lúc này.' });
    }
  });

  app.post('/api/ai/chat', async (req, res) => {
    try {
      const {
        message,
        history,
        catalog,
        events,
        seats,
        guestbook,
        siteConfig,
        userName,
        userRole,
        currentRoute,
      } = req.body as {
        message?: string;
        history?: AssistantChatTurn[];
        catalog?: MediaItem[];
        events?: YearEvent[];
        seats?: ClassroomSeat[];
        guestbook?: GuestbookNote[];
        siteConfig?: Partial<SiteConfig>;
        userName?: string;
        userRole?: UserRole;
        currentRoute?: RouteView;
      };

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ error: 'Vui lòng nhập lời nhắn cho Trợ lý Ký ức.' });
      }

      const safeCatalog = Array.isArray(catalog) ? catalog : [];
      const safeEvents = Array.isArray(events) ? events : [];
      const safeSeats = Array.isArray(seats) ? seats : [];
      const safeGuestbook = Array.isArray(guestbook) ? guestbook : [];

      const runtimeCtx = {
        siteConfig,
        userName,
        userRole,
        currentRoute,
        catalog: safeCatalog,
        events: safeEvents,
        seats: safeSeats,
        guestbook: safeGuestbook,
      };

      const ai = getGeminiClient();
      if (!ai) {
        const localRes = runLocalAssistantFallback(
          message,
          runtimeCtx,
          'Chưa cấu hình GEMINI_API_KEY trên máy chủ. Đang chạy chế độ trò chuyện & tìm kiếm trực tiếp.'
        );
        return res.json(localRes);
      }

      const promptContext = buildAssistantPromptContext(runtimeCtx);
      const systemInstruction =
        'Bạn là "Trợ lý Ký ức C3" — một người bạn thân thiết cùng lớp 12C3 trường THPT Bình Sơn (10A3 -> 11B3 -> 12C3). ' +
        'Nhiệm vụ của bạn là: (1) trò chuyện ấm áp, gần gũi như bạn học cùng bàn; và (2) tìm kiếm ảnh, video, thông tin sự kiện, số liệu kho lưu trữ hoặc vị trí ngồi trong Phòng học 50 chỗ theo yêu cầu.\n' +
        'Quy tắc trung thực tuyệt đối:\n' +
        '1. CHỈ dùng dữ liệu thật có trong ngữ cảnh JSON được cung cấp. Tuyệt đối KHÔNG tự bịa tên ảnh, video, ID, hay tên thành viên chưa được gán.\n' +
        '2. Trả về JSON đúng schema:\n' +
        '   - intent: "chat" (trò chuyện thông thường), "search_media" (tìm ảnh/video), "lookup_seat" (tìm ghế/bạn trong phòng học), hoặc "archive_info" (hỏi thông tin, thống kê, sự kiện của lớp).\n' +
        '   - reply: câu trả lời tiếng Việt tự nhiên, ấm áp (2-4 câu).\n' +
        '   - yearCode: "10A3", "11B3", "12C3" hoặc "ALL".\n' +
        '   - eventSlug: "20-10", "19-11", "20-11", "08-03", "hoi-trai", "ky-yeu", "ky-niem-khac" hoặc "ALL".\n' +
        '   - mediaType: "image", "video" hoặc "ALL".\n' +
        '   - keywords: mảng 0-5 từ khóa tìm kiếm ngắn gọn.\n' +
        '   - matchedIds: mảng ID ảnh/video chính xác từ mediaSample nếu khớp (nếu không chắc để rỗng).\n' +
        '   - seatQuery: tên thành viên hoặc số ghế (ví dụ "7" hoặc "Minh Anh") nếu hỏi về chỗ ngồi, ngược lại để "".\n\n' +
        `Dữ liệu thật của website C3:\n${promptContext}`;

      const safeHistory: Content[] = Array.isArray(history)
        ? history
            .slice(-6)
            .filter((h) => h && typeof h.text === 'string' && h.text.trim().length > 0)
            .map((h) => ({
              role: h.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: h.text.trim().slice(0, 600) }],
            }))
        : [];

      const contents: Content[] = [
        ...safeHistory,
        { role: 'user', parts: [{ text: message.trim() }] },
      ];

      try {
        const aiResponse = await withTimeout(
          (abortSignal) =>
            ai.models.generateContent({
              model: 'gemini-3.1-flash-lite',
              contents,
              config: {
                abortSignal,
                thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
                systemInstruction,
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    intent: { type: Type.STRING },
                    reply: { type: Type.STRING },
                    yearCode: { type: Type.STRING },
                    eventSlug: { type: Type.STRING },
                    mediaType: { type: Type.STRING },
                    keywords: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    matchedIds: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    seatQuery: { type: Type.STRING },
                  },
                  required: [
                    'intent',
                    'reply',
                    'yearCode',
                    'eventSlug',
                    'mediaType',
                    'keywords',
                    'matchedIds',
                    'seatQuery',
                  ],
                },
              },
            }),
          20000,
          'Gemini chat timeout'
        );

        const parsed = JSON.parse((aiResponse.text ?? '{}').trim()) as {
          intent?: string;
          reply?: string;
          yearCode?: string;
          eventSlug?: string;
          mediaType?: string;
          keywords?: string[];
          matchedIds?: string[];
          seatQuery?: string;
        };

        const validYear =
          parsed.yearCode === '10A3' ||
          parsed.yearCode === '11B3' ||
          parsed.yearCode === '12C3'
            ? parsed.yearCode
            : null;
        const validEvent =
          parsed.eventSlug === '20-10' ||
          parsed.eventSlug === '19-11' ||
          parsed.eventSlug === '20-11' ||
          parsed.eventSlug === '08-03' ||
          parsed.eventSlug === 'hoi-trai' ||
          parsed.eventSlug === 'ky-yeu' ||
          parsed.eventSlug === 'ky-niem-khac'
            ? parsed.eventSlug
            : null;
        const validType =
          parsed.mediaType === 'image' || parsed.mediaType === 'video' ? parsed.mediaType : null;
        const keywords = Array.isArray(parsed.keywords)
          ? parsed.keywords.map((k) => String(k)).filter(Boolean).slice(0, 5)
          : [];

        const shouldSearchMedia =
          parsed.intent === 'search_media' ||
          Boolean(validYear) ||
          Boolean(validEvent) ||
          Boolean(validType) ||
          keywords.length > 0 ||
          (Array.isArray(parsed.matchedIds) && parsed.matchedIds.length > 0);

        let matchedMedia: MediaItem[] = [];
        if (shouldSearchMedia) {
          const deterministicMatches = matchMediaCatalog(
            safeCatalog,
            {
              yearCode: validYear,
              eventSlug: validEvent,
              mediaType: validType,
              keywords,
              reply: '',
              usedGemini: true,
            },
            message
          );
          const aiIdSet = new Set(Array.isArray(parsed.matchedIds) ? parsed.matchedIds : []);
          const idVerifiedMatches = safeCatalog.filter(
            (item) =>
              item.status === 'approved' &&
              aiIdSet.has(item.id) &&
              (!validYear || item.yearCode === validYear) &&
              (!validEvent || item.eventSlug === validEvent) &&
              (!validType || item.mediaType === validType)
          );
          const mergedMap = new Map<string, MediaItem>();
          for (const item of [...deterministicMatches, ...idVerifiedMatches]) {
            mergedMap.set(item.id, item);
          }
          matchedMedia = Array.from(mergedMap.values()).slice(0, 10);
        }

        const seatQueryText = (parsed.seatQuery || '').trim();
        let matchedSeats: ClassroomSeat[] = [];
        if (parsed.intent === 'lookup_seat' || seatQueryText.length > 0) {
          matchedSeats = findMatchingSeats(safeSeats, seatQueryText || message);
        }

        let reply = (parsed.reply || '').trim();
        if (parsed.intent === 'search_media' && matchedMedia.length === 0) {
          reply =
            reply ||
            `Hiện chưa có ảnh hoặc video nào khớp với "${message.trim()}" trong kho lưu trữ C3. Bạn thử chọn năm học hoặc sự kiện khác nhé.`;
        } else if (!reply) {
          reply =
            matchedMedia.length > 0
              ? `Mình tìm thấy ${matchedMedia.length} kỷ niệm khớp với yêu cầu của bạn trong kho C3 nè!`
              : 'Mình đang lắng nghe bạn đây — bạn muốn trò chuyện hay tìm kiếm kỷ niệm gì của lớp C3 nào?';
        }

        return res.json({
          reply,
          matches: matchedMedia,
          seats: matchedSeats,
          actions: [],
          usedGemini: true,
        });
      } catch (aiError) {
        const errMsg = aiError instanceof Error ? aiError.message : String(aiError);
        console.warn('Gemini chat fallback triggered:', errMsg);

        let apiNotice =
          'Kết nối AI Gemini đang tạm gián đoạn; trợ lý đang trò chuyện & tìm kiếm trực tiếp trên kho lưu trữ C3.';
        if (errMsg.toLowerCase().includes('timeout') || errMsg.toLowerCase().includes('abort')) {
          apiNotice =
            'Gemini phản hồi chậm hơn dự kiến; trợ lý đã chuyển sang tìm kiếm trực tiếp trên kho lưu trữ C3.';
        } else if (errMsg.includes('403') || errMsg.includes('PERMISSION_DENIED')) {
          apiNotice =
            'Khóa Gemini API hiện tại chưa đủ quyền (403 PERMISSION_DENIED) trong Settings > Secrets. Trợ lý vẫn trò chuyện & tìm kiếm trực tiếp trên kho lưu trữ cho bạn.';
        } else if (errMsg.includes('400') || errMsg.includes('API_KEY_INVALID')) {
          apiNotice =
            'Khóa Gemini API chưa hợp lệ (400) trong Settings > Secrets. Trợ lý vẫn xử lý tìm kiếm trực tiếp cho bạn.';
        } else if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED')) {
          apiNotice =
            'Gemini API đang tạm giới hạn lượt gọi (429). Trợ lý vẫn trò chuyện & tìm kiếm trực tiếp trên kho lưu trữ C3 cho bạn.';
        }

        const localRes = runLocalAssistantFallback(message, runtimeCtx, apiNotice);
        return res.json(localRes);
      }
    } catch (error) {
      console.error('/api/ai/chat error:', error);
      return res.status(500).json({ error: 'Không thể xử lý trò chuyện lúc này.' });
    }
  });

  app.post('/api/ai/suggest-metadata', async (req, res) => {
    try {
      const { imageBase64, mimeType, yearCode, eventTitle, fileName } = req.body as {
        imageBase64?: string;
        mimeType?: string;
        yearCode?: string;
        eventTitle?: string;
        fileName?: string;
      };

      const ai = getGeminiClient();
      if (!ai) {
        return res.status(503).json({
          error: 'Chưa cấu hình GEMINI_API_KEY trên máy chủ để gợi ý chú thích bằng AI.',
        });
      }

      const parts: Array<
        { text: string } | { inlineData: { mimeType: string; data: string } }
      > = [];

      if (imageBase64 && mimeType) {
        parts.push({
          inlineData: {
            mimeType,
            data: imageBase64,
          },
        });
      }

      parts.push({
        text: `Hãy gợi ý tiêu đề, chú thích hoài niệm ngắn (1-2 câu) và 4 từ khóa tìm kiếm bằng tiếng Việt cho tư liệu thuộc năm học ${yearCode || 'C3'}, sự kiện "${eventTitle || 'Kỷ niệm lớp'}", tên tệp "${fileName || 'memory'}". Tuyệt đối KHÔNG nhận diện khuôn mặt hay đoán tên riêng cá nhân.`,
      });

      const response = await withTimeout(
        (abortSignal) =>
          ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: { parts },
            config: {
              abortSignal,
              thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
              systemInstruction:
                'Bạn là biên tập viên kỷ yếu của lớp C3 THPT Bình Sơn. Viết tiếng Việt tinh tế, giàu cảm xúc, trang nhã. Không bao giờ đoán danh tính hoặc tên người trong ảnh.',
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  caption: { type: Type.STRING },
                  tags: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
                required: ['title', 'caption', 'tags'],
              },
            },
          }),
        20000,
        'Gemini suggest timeout'
      );

      const rawText = (response.text ?? '{}')
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '');
      const suggested = JSON.parse(rawText || '{}') as {
        title?: string;
        caption?: string;
        tags?: string[];
      };
      return res.json({
        title: typeof suggested.title === 'string' ? suggested.title : '',
        caption: typeof suggested.caption === 'string' ? suggested.caption : '',
        tags: Array.isArray(suggested.tags) ? suggested.tags.map(String).slice(0, 6) : [],
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error('/api/ai/suggest-metadata error:', errMsg);
      if (errMsg.toLowerCase().includes('timeout') || errMsg.toLowerCase().includes('abort')) {
        return res.status(504).json({
          error: 'Gemini gợi ý mô tả phản hồi quá thời gian chờ. Vui lòng thử lại.',
        });
      }
      if (errMsg.includes('403') || errMsg.includes('PERMISSION_DENIED')) {
        return res.status(403).json({
          error: 'Khóa Gemini API chưa đủ quyền (403 PERMISSION_DENIED). Vui lòng kiểm tra Settings > Secrets.',
        });
      }
      if (errMsg.includes('400') || errMsg.includes('API_KEY_INVALID')) {
        return res.status(400).json({
          error: 'Khóa Gemini API chưa hợp lệ (400). Vui lòng kiểm tra Settings > Secrets.',
        });
      }
      if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED')) {
        return res.status(429).json({
          error: 'Gemini API đang tạm giới hạn lượt gọi (429). Vui lòng thử lại sau ít phút.',
        });
      }
      return res.status(500).json({ error: `Lỗi khi gọi Gemini gợi ý mô tả: ${errMsg}` });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, watch: null },
      appType: 'spa',
    });

    // Vite 8 still injects <script type="module" src="/@vite/client"> even with hmr: false,
    // and its default client unconditionally attempts a WebSocket connection on port 24678,
    // triggering unhandled rejections behind Cloud Run reverse proxies.
    // Serve a compliant zero-WebSocket client shim providing CSS style injection & hot stubs.
    const noWsViteClientSource = `
import "/node_modules/vite/dist/client/env.mjs";

const sheetsMap = new Map();
let lastInsertedStyle;

export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement("style");
    style.setAttribute("type", "text/css");
    style.setAttribute("data-vite-dev-id", id);
    style.textContent = content;
    if (!lastInsertedStyle) {
      document.head.appendChild(style);
      setTimeout(() => {
        lastInsertedStyle = undefined;
      }, 0);
    } else {
      lastInsertedStyle.insertAdjacentElement("afterend", style);
    }
    lastInsertedStyle = style;
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}

export function removeStyle(id) {
  document
    .querySelectorAll('link[rel="stylesheet"][data-vite-dev-id="' + CSS.escape(id) + '"]')
    .forEach((el) => el.remove());
  const style = sheetsMap.get(id);
  if (style && style.parentNode) {
    style.parentNode.removeChild(style);
    sheetsMap.delete(id);
  }
}

export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}

export function injectQuery(url, queryToInject) {
  if (!url || (url[0] !== "." && url[0] !== "/")) return url;
  const pathname = url.replace(/[?#].*$/, "");
  const { search, hash } = new URL(url, "http://vite.dev");
  return \`\${pathname}?\${queryToInject}\${search ? "&" + search.slice(1) : ""}\${hash || ""}\`;
}

export class ErrorOverlay extends HTMLElement {}
`.trim();

    app.get('/@vite/client', (_req, res) => {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.send(noWsViteClientSource);
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`C3 Digital Memory server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
