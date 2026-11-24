import React, { useEffect, useState } from 'react';
import {
  Check,
  Database,
  Download,
  Film,
  Image as ImageIcon,
  MessageSquare,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { useArchive } from '../context/ArchiveContext';
import { formatUserFacingError } from '../lib/firebase';
import {
  detectMediaType,
  extractVideoThumbnail,
  fileToBase64,
  formatFileSize,
  stripImageExifGps,
  uploadBlobToFirebaseStorage,
} from '../lib/mediaProcessing';
import { getMaxMediaUploadBytes } from '../utils/uploadChunking';
import type { MediaItem, MediaType, YearCode, YearEvent } from '../types/memory';
import { formatDateDDMMYYYY, formatDuration, sanitizeFirestoreId } from '../utils/memorySearch';
import { ArchivalMediaFrame } from './ArchivalMediaFrame';

type AdminTab = 'site' | 'events' | 'upload' | 'seats' | 'moderation' | 'users';

interface UploadQueueItem {
  localId: string;
  file: File;
  mediaType: MediaType;
  title: string;
  caption: string;
  tagsText: string;
  yearCode: YearCode;
  eventId: string;
  featuredOnHome: boolean;
  isYearbookSpread: boolean;
  progress: number;
  status: 'queued' | 'uploading' | 'done' | 'error';
  errorMsg?: string;
  aiSuggesting?: boolean;
}

export const AdminDashboardView: React.FC = () => {
  const {
    isAdmin,
    siteConfig,
    events,
    media,
    seats,
    guestbook,
    usersDirectory,
    submissions,
    removalRequests,
    hasCloudEvents,
    hasCloudSeats,
    seedInitialArchiveToFirestore,
    updateSiteConfig,
    saveEvent,
    deleteEvent,
    saveMediaItem,
    deleteMediaItem,
    saveSeat,
    deleteGuestbookNote,
    moderateSubmission,
    resolveRemovalRequest,
    updateUserRole,
    exportBackupJson,
    navigate,
  } = useArchive();

  const [tab, setTab] = useState<AdminTab>('upload');
  const [seedBusy, setSeedBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Site config state
  const [cfgName, setCfgName] = useState(siteConfig.siteName);
  const [cfgSchool, setCfgSchool] = useState(siteConfig.schoolName);
  const [cfgSlogan, setCfgSlogan] = useState(siteConfig.slogan);
  const [cfgHeroTitle, setCfgHeroTitle] = useState(siteConfig.heroTitle);
  const [cfgHeroSub, setCfgHeroSub] = useState(siteConfig.heroSubtitle);
  const [cfgStory, setCfgStory] = useState(siteConfig.introStory);
  const [cfgMusicId, setCfgMusicId] = useState(siteConfig.musicYoutubeId);
  const [cfgDemo, setCfgDemo] = useState(siteConfig.allowDemoPreview);

  // Event editor state
  const [editingEvent, setEditingEvent] = useState<YearEvent | null>(null);
  const [evYear, setEvYear] = useState<YearCode>('10A3');
  const [evSlug, setEvSlug] = useState('hoat-dong-moi');
  const [evTitle, setEvTitle] = useState('');
  const [evDateLabel, setEvDateLabel] = useState('');
  const [evSummary, setEvSummary] = useState('');
  const [evCoverUrl, setEvCoverUrl] = useState('');
  const [evSpecial, setEvSpecial] = useState(false);

  // Batch upload queue
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [defaultYear, setDefaultYear] = useState<YearCode>('12C3');
  const [defaultEventId, setDefaultEventId] = useState<string>('12c3-ky-yeu');
  const [mediaFilterYear, setMediaFilterYear] = useState<'ALL' | YearCode>('ALL');

  // Seat quick edit
  const [seatDraftName, setSeatDraftName] = useState<Record<string, string>>({});

  useEffect(() => {
    setCfgName(siteConfig.siteName);
    setCfgSchool(siteConfig.schoolName);
    setCfgSlogan(siteConfig.slogan);
    setCfgHeroTitle(siteConfig.heroTitle);
    setCfgHeroSub(siteConfig.heroSubtitle);
    setCfgStory(siteConfig.introStory);
    setCfgMusicId(siteConfig.musicYoutubeId);
    setCfgDemo(siteConfig.allowDemoPreview);
  }, [siteConfig]);

  if (!isAdmin) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-20 text-center">
        <div className="editorial-card-shadow rounded-2xl border border-[#E5DDD0] bg-white p-10">
          <ShieldAlert className="mx-auto h-10 w-10 text-[#C83E31]" />
          <h1 className="mt-4 font-serif text-3xl font-semibold text-[#1C1917]">
            Khu vực dành riêng cho Quản trị viên C3
          </h1>
          <p className="mt-3 text-sm text-[#57534E]">
            Vui lòng đăng nhập bằng tài khoản Quản trị viên được cấp quyền để quản lý kho ảnh, video, 50 vị trí thành viên và kiểm duyệt nội dung.
          </p>
          <button
            type="button"
            onClick={() => navigate({ page: 'home' })}
            className="mt-6 cursor-pointer rounded-md bg-[#1C1917] px-6 py-2.5 text-xs font-semibold text-[#FAF7F2] transition-colors hover:bg-[#C83E31]"
          >
            Về trang chủ
          </button>
        </div>
      </main>
    );
  }

  const handleSeedCloud = async () => {
    setSeedBusy(true);
    try {
      await seedInitialArchiveToFirestore();
      setNotice('Đã đồng bộ cấu hình, 18 sự kiện (bao gồm Kỷ niệm khác) và 50 vị trí phòng học lên Cloud Firestore.');
    } catch {
      setNotice('Không thể khởi tạo dữ liệu lên Firestore. Vui lòng xem thông báo lỗi phía trên.');
    } finally {
      setSeedBusy(false);
    }
  };

  const handleSaveSiteConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateSiteConfig({
        siteName: cfgName,
        schoolName: cfgSchool,
        slogan: cfgSlogan,
        heroTitle: cfgHeroTitle,
        heroSubtitle: cfgHeroSub,
        introStory: cfgStory,
        musicYoutubeId: cfgMusicId,
        allowDemoPreview: cfgDemo,
      });
      setNotice('Đã lưu cấu hình trang chủ và nhạc nền.');
    } catch {
      setNotice('Không thể lưu cấu hình trang chủ lên Firestore.');
    }
  };

  const startNewEvent = () => {
    setEditingEvent(null);
    setEvYear('12C3');
    setEvSlug(`su-kien-${Date.now().toString().slice(-4)}`);
    setEvTitle('');
    setEvDateLabel('');
    setEvSummary('');
    setEvCoverUrl('plate://event-20-11');
    setEvSpecial(false);
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (evTitle.trim().length < 2 || evSummary.trim().length < 2 || evDateLabel.trim().length < 1) {
      setNotice('Tên sự kiện và giới thiệu cần tối thiểu 2 ký tự.');
      return;
    }
    const cleanSlug = sanitizeFirestoreId(evSlug, 'su-kien').slice(0, 64);
    const id = editingEvent?.id || `${evYear.toLowerCase()}-${cleanSlug}`;
    const payload: YearEvent = {
      id,
      yearCode: evYear,
      slug: cleanSlug,
      title: evTitle.trim(),
      dateLabel: evDateLabel.trim(),
      summary: evSummary.trim(),
      coverImageUrl: evCoverUrl.trim() || 'plate://hero-courtyard',
      order: editingEvent?.order ?? events.length + 1,
      isSpecial: evSpecial,
    };
    try {
      await saveEvent(payload);
      setNotice(`Đã lưu sự kiện "${payload.title}".`);
      startNewEvent();
    } catch {
      setNotice('Không thể lưu sự kiện lên Firestore. Vui lòng kiểm tra các trường nhập.');
    }
  };

  const handleFilesSelected = (files: FileList | null) => {
    if (!files) return;
    const yearEvents = events.filter((e) => e.yearCode === defaultYear);
    const chosenEventId =
      yearEvents.some((e) => e.id === defaultEventId)
        ? defaultEventId
        : yearEvents[0]?.id || events[0]?.id || '';

    const items: UploadQueueItem[] = Array.from(files).map((file) => {
      const mediaType = detectMediaType(file);
      const baseTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ');
      const isTooLarge = file.size > getMaxMediaUploadBytes(mediaType);
      return {
        localId: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        mediaType,
        title: baseTitle || 'Kỷ niệm C3',
        caption: '',
        tagsText: `${defaultYear.toLowerCase()}`,
        yearCode: defaultYear,
        eventId: chosenEventId,
        featuredOnHome: false,
        isYearbookSpread: chosenEventId.endsWith('ky-yeu'),
        progress: 0,
        status: isTooLarge ? 'error' : 'queued',
        errorMsg: isTooLarge
          ? `Tệp nặng ${formatFileSize(file.size)}, vượt quá giới hạn ${mediaType === 'video' ? '100 MB' : '10 MB'}/tệp.`
          : undefined,
      };
    });

    setQueue((prev) => [...prev, ...items]);
  };

  const handleAiSuggestForQueue = async (item: UploadQueueItem) => {
    setQueue((prev) =>
      prev.map((q) => (q.localId === item.localId ? { ...q, aiSuggesting: true } : q))
    );
    try {
      const ev = events.find((e) => e.id === item.eventId);
      let imageBase64: string | undefined;
      let mimeType: string | undefined;
      if (item.mediaType === 'image') {
        const cleaned = await stripImageExifGps(item.file);
        imageBase64 = await fileToBase64(cleaned);
        mimeType = cleaned.type || 'image/jpeg';
      }
      const res = await fetch('/api/ai/suggest-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64,
          mimeType,
          yearCode: item.yearCode,
          eventTitle: ev?.title || item.eventId,
          fileName: item.file.name,
        }),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error || `Không thể gợi ý tự động (HTTP ${res.status}).`);
      }
      const suggested = (await res.json()) as {
        title?: string;
        caption?: string;
        tags?: string[];
      };
      setQueue((prev) =>
        prev.map((q) =>
          q.localId === item.localId
            ? {
                ...q,
                title: suggested.title || q.title,
                caption: suggested.caption || q.caption,
                tagsText: Array.isArray(suggested.tags) ? suggested.tags.join(', ') : q.tagsText,
                aiSuggesting: false,
              }
            : q
        )
      );
      setNotice('AI đã đề xuất mô tả & thẻ — Quản trị viên vui lòng kiểm tra lại trước khi tải lên.');
    } catch (err) {
      setQueue((prev) =>
        prev.map((q) => (q.localId === item.localId ? { ...q, aiSuggesting: false } : q))
      );
      setNotice(
        err instanceof Error
          ? err.message
          : 'Không thể gợi ý tự động lúc này (kiểm tra GEMINI_API_KEY trên máy chủ).'
      );
    }
  };

  const uploadSingleQueueItem = async (item: UploadQueueItem) => {
    const matchedEvent = events.find((e) => e.id === item.eventId);
    if (!matchedEvent) {
      setQueue((prev) =>
        prev.map((q) =>
          q.localId === item.localId
            ? { ...q, status: 'error', errorMsg: 'Chưa chọn sự kiện hợp lệ.' }
            : q
        )
      );
      return;
    }

    setQueue((prev) =>
      prev.map((q) =>
        q.localId === item.localId ? { ...q, status: 'uploading', progress: 5, errorMsg: undefined } : q
      )
    );

    try {
      const safeName = `${Date.now()}-${item.file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      let mainUrl = '';
      let mainPath = '';
      let thumbUrl = '';
      let thumbPath = '';
      let durationSec = 0;

      if (item.mediaType === 'video') {
        const extracted = await extractVideoThumbnail(item.file);
        durationSec = extracted.durationSec;
        const upVid = await uploadBlobToFirebaseStorage(
          item.file,
          `c3-memories/${item.yearCode}/video/${safeName}`,
          item.file.type || 'video/mp4',
          (pct) => {
            setQueue((prev) =>
              prev.map((q) => (q.localId === item.localId ? { ...q, progress: pct } : q))
            );
          }
        );
        mainUrl = upVid.url;
        mainPath = upVid.storagePath;

        if (extracted.blob) {
          try {
            const upThumb = await uploadBlobToFirebaseStorage(
              extracted.blob,
              `c3-memories/${item.yearCode}/thumbnail/${safeName}.jpg`,
              'image/jpeg',
              () => {}
            );
            thumbUrl = upThumb.url;
            thumbPath = upThumb.storagePath;
          } catch {
            // Thumbnail upload failure should not block the video itself
          }
        }
      } else {
        const cleanedBlob = await stripImageExifGps(item.file);
        const upImg = await uploadBlobToFirebaseStorage(
          cleanedBlob,
          `c3-memories/${item.yearCode}/image/${safeName}`,
          cleanedBlob.type || 'image/jpeg',
          (pct) => {
            setQueue((prev) =>
              prev.map((q) => (q.localId === item.localId ? { ...q, progress: pct } : q))
            );
          }
        );
        mainUrl = upImg.url;
        mainPath = upImg.storagePath;
      }

      const tags = item.tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 10);

      const docItem: MediaItem = {
        id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        yearCode: item.yearCode,
        eventId: matchedEvent.id,
        eventSlug: matchedEvent.slug,
        eventTitle: matchedEvent.title,
        mediaType: item.mediaType,
        title: item.title.trim() || item.file.name,
        caption: item.caption.trim(),
        url: mainUrl,
        storagePath: mainPath,
        thumbnailUrl: thumbUrl,
        thumbnailStoragePath: thumbPath,
        durationSec,
        tags,
        featuredOnHome: item.featuredOnHome,
        isYearbookSpread: item.isYearbookSpread,
        isDemo: false,
        status: 'approved',
        uploadedBy: 'admin',
        uploadedByName: 'Quản trị viên',
      };

      await saveMediaItem(docItem);

      setQueue((prev) =>
        prev.map((q) =>
          q.localId === item.localId ? { ...q, status: 'done', progress: 100 } : q
        )
      );
      setNotice(`Đã tải lên thành công "${docItem.title}".`);
    } catch (err) {
      const msg = formatUserFacingError(err, 'Không thể tải tệp lên lúc này.');
      setQueue((prev) =>
        prev.map((q) =>
          q.localId === item.localId
            ? { ...q, status: 'error', errorMsg: msg }
            : q
        )
      );
    }
  };

  const uploadAllQueued = async () => {
    const pending = queue.filter((q) => q.status === 'queued' || q.status === 'error');
    for (const item of pending) {
      await uploadSingleQueueItem(item);
    }
  };

  const filteredMedia = media.filter((m) =>
    mediaFilterYear === 'ALL' ? true : m.yearCode === mediaFilterYear
  );

  return (
    <main className="mx-auto max-w-[1320px] px-5 py-10 pb-28 sm:px-8">
      <div className="flex flex-col gap-4 border-b border-[#E5DDD0] pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold tracking-wider text-[#C83E31] uppercase">
            Bảng điều khiển Quản trị viên C3
          </p>
          <h1 className="mt-1 font-serif text-3xl font-semibold text-[#1C1917] sm:text-4xl">
            Quản lý Kho Kỷ Niệm &amp; Thành Viên
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {(!hasCloudEvents || !hasCloudSeats) && (
            <button
              type="button"
              disabled={seedBusy}
              onClick={() => void handleSeedCloud()}
              className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-[#C83E31] px-5 py-2 text-xs font-semibold text-[#FAF7F2] transition-colors hover:bg-[#A93226]"
            >
              <Database className="h-3.5 w-3.5" />
              <span>{seedBusy ? 'Đang khởi tạo...' : 'Khởi tạo dữ liệu gốc lên Firestore'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={exportBackupJson}
            className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-[#D6CEC2] bg-white px-5 py-2 text-xs font-semibold text-[#1C1917] transition-colors hover:border-[#1C1917] hover:bg-[#FAF7F2]"
          >
            <Download className="h-3.5 w-3.5 text-[#C83E31]" />
            <span>Xuất bản sao lưu JSON</span>
          </button>
        </div>
      </div>

      {notice && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-[#C83E31]/30 bg-[#FEF2F2] px-4 py-2.5 text-xs text-[#1C1917]">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="cursor-pointer p-1">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="mt-6 flex flex-wrap gap-2 border-b border-[#E5DDD0] pb-3">
        {(
          [
            ['upload', 'Tải lên & Kho Phương tiện'],
            ['events', `Sự kiện & Album (${events.length})`],
            ['seats', '50 Chỗ ngồi Lớp học'],
            ['moderation', `Yêu cầu gỡ & Lưu bút (${removalRequests.filter((r) => r.status === 'pending').length + submissions.filter((s) => s.status === 'pending').length})`],
            ['users', `Thành viên (${usersDirectory.length})`],
            ['site', 'Trang chủ & Nhạc nền'],
          ] as [AdminTab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`cursor-pointer rounded-md px-4 py-2 text-xs font-semibold transition-colors ${
              tab === key
                ? 'bg-[#1C1917] text-[#FAF7F2]'
                : 'border border-[#E5DDD0] bg-[#FAF7F2] text-[#57534E] hover:border-[#1C1917] hover:text-[#1C1917]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* TAB 1: MULTI-FILE UPLOAD & MEDIA LIBRARY */}
      {tab === 'upload' && (
        <section className="mt-8 space-y-10">
          <div className="editorial-card-shadow rounded-2xl border border-[#E5DDD0] bg-white p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-serif text-2xl font-semibold text-[#1C1917]">
                  Tải lên nhiều ảnh &amp; video cùng lúc
                </h2>
                <p className="mt-1 text-xs text-[#57534E]">
                  Ảnh được tự động xóa metadata vị trí GPS; video được trích xuất thumbnail và thời lượng (tự động chuyển sang kho máy chủ nếu Storage chưa kích hoạt).
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={defaultYear}
                  onChange={(e) => {
                    const y = e.target.value as YearCode;
                    setDefaultYear(y);
                    const firstEv = events.find((ev) => ev.yearCode === y);
                    if (firstEv) setDefaultEventId(firstEv.id);
                  }}
                  aria-label="Chọn năm học mặc định khi tải lên"
                  className="rounded-lg border border-[#D6CEC2] bg-[#FAF7F2] px-3 py-2 text-xs text-[#1C1917]"
                >
                  <option value="10A3">10A3</option>
                  <option value="11B3">11B3</option>
                  <option value="12C3">12C3</option>
                </select>
                <select
                  value={defaultEventId}
                  onChange={(e) => setDefaultEventId(e.target.value)}
                  aria-label="Chọn sự kiện mặc định khi tải lên"
                  className="rounded-lg border border-[#D6CEC2] bg-[#FAF7F2] px-3 py-2 text-xs text-[#1C1917]"
                >
                  {events
                    .filter((ev) => ev.yearCode === defaultYear)
                    .map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.title}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#D6CEC2] bg-[#FAF7F2] px-6 py-10 text-center transition-colors hover:border-[#C83E31] hover:bg-[#F5EFE6]">
              <Upload className="h-7 w-7 text-[#C83E31]" />
              <span className="mt-2 text-sm font-semibold text-[#1C1917]">
                Chọn nhiều tệp hình ảnh hoặc video từ máy tính / điện thoại
              </span>
              <span className="mt-1 text-xs text-[#57534E]">
                Hỗ trợ JPG, PNG, WebP (tối đa 10 MB) và MP4, MOV (tối đa 100 MB) · Tách biệt tự động giữa Ảnh và Video
              </span>
              <input
                type="file"
                multiple
                accept="image/*,video/*,.mp4,.mov,.webm,.m4v,.avi,.mkv,.3gp,.heic,.heif,.jpg,.jpeg,.png,.webp"
                onChange={(e) => {
                  handleFilesSelected(e.target.files);
                  e.target.value = '';
                }}
                className="sr-only"
              />
            </label>

            {queue.length > 0 && (
              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-[#1C1917]">
                    Hàng đợi tải lên ({queue.length} tệp)
                  </p>
                  <button
                    type="button"
                    onClick={() => void uploadAllQueued()}
                    className="cursor-pointer rounded-md bg-[#1C1917] px-5 py-2 text-xs font-semibold text-[#FAF7F2] transition-colors hover:bg-[#C83E31]"
                  >
                    Tải lên tất cả tệp chờ
                  </button>
                </div>

                {queue.map((item) => (
                  <div
                    key={item.localId}
                    className="space-y-3 rounded-xl border border-[#E5DDD0] bg-[#FAF7F2] p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1C1917]">
                        {item.mediaType === 'video' ? (
                          <Film className="h-3.5 w-3.5 text-[#1D4ED8]" />
                        ) : (
                          <ImageIcon className="h-3.5 w-3.5 text-[#C83E31]" />
                        )}
                        {item.file.name} ({formatFileSize(item.file.size)})
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={item.aiSuggesting || item.status === 'uploading' || item.status === 'done'}
                          onClick={() => void handleAiSuggestForQueue(item)}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[#D6CEC2] bg-white px-3 py-1 text-[11px] font-medium text-[#1C1917] hover:border-[#C83E31] disabled:opacity-50"
                        >
                          <Sparkles className="h-3 w-3 text-[#C83E31]" />
                          <span>
                            {item.aiSuggesting ? 'Đang gợi ý...' : 'AI gợi ý chú thích'}
                          </span>
                        </button>
                        {item.status === 'error' && (
                          <button
                            type="button"
                            onClick={() => void uploadSingleQueueItem(item)}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-[#C83E31] px-3 py-1 text-[11px] text-white"
                          >
                            <RefreshCw className="h-3 w-3" />
                            <span>Thử lại</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setQueue((prev) => prev.filter((q) => q.localId !== item.localId))
                          }
                          aria-label="Xóa khỏi hàng đợi"
                          className="cursor-pointer p-1 text-[#78716C] hover:text-[#1C1917]"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <input
                        type="text"
                        value={item.title}
                        onChange={(e) =>
                          setQueue((prev) =>
                            prev.map((q) =>
                              q.localId === item.localId ? { ...q, title: e.target.value } : q
                            )
                          )
                        }
                        placeholder="Tiêu đề"
                        className="rounded-lg border border-[#D6CEC2] bg-white px-3 py-1.5 text-xs text-[#1C1917]"
                      />
                      <select
                        value={item.yearCode}
                        onChange={(e) => {
                          const y = e.target.value as YearCode;
                          const firstEv = events.find((ev) => ev.yearCode === y);
                          setQueue((prev) =>
                            prev.map((q) =>
                              q.localId === item.localId
                                ? { ...q, yearCode: y, eventId: firstEv?.id || q.eventId }
                                : q
                            )
                          );
                        }}
                        className="rounded-lg border border-[#D6CEC2] bg-white px-3 py-1.5 text-xs text-[#1C1917]"
                      >
                        <option value="10A3">10A3</option>
                        <option value="11B3">11B3</option>
                        <option value="12C3">12C3</option>
                      </select>
                      <select
                        value={item.eventId}
                        onChange={(e) =>
                          setQueue((prev) =>
                            prev.map((q) =>
                              q.localId === item.localId ? { ...q, eventId: e.target.value } : q
                            )
                          )
                        }
                        className="rounded-lg border border-[#D6CEC2] bg-white px-3 py-1.5 text-xs text-[#1C1917]"
                      >
                        {events
                          .filter((ev) => ev.yearCode === item.yearCode)
                          .map((ev) => (
                            <option key={ev.id} value={ev.id}>
                              {ev.title}
                            </option>
                          ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <input
                        type="text"
                        value={item.caption}
                        onChange={(e) =>
                          setQueue((prev) =>
                            prev.map((q) =>
                              q.localId === item.localId ? { ...q, caption: e.target.value } : q
                            )
                          )
                        }
                        placeholder="Chú thích kỷ niệm (kiểm tra kỹ nếu dùng AI gợi ý)"
                        className="rounded-lg border border-[#D6CEC2] bg-white px-3 py-1.5 text-xs text-[#1C1917]"
                      />
                      <input
                        type="text"
                        value={item.tagsText}
                        onChange={(e) =>
                          setQueue((prev) =>
                            prev.map((q) =>
                              q.localId === item.localId ? { ...q, tagsText: e.target.value } : q
                            )
                          )
                        }
                        placeholder="Từ khóa cách nhau bởi dấu phẩy"
                        className="rounded-lg border border-[#D6CEC2] bg-white px-3 py-1.5 text-xs text-[#1C1917]"
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-4 text-[#1C1917]">
                        <label className="inline-flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={item.featuredOnHome}
                            onChange={(e) =>
                              setQueue((prev) =>
                                prev.map((q) =>
                                  q.localId === item.localId
                                    ? { ...q, featuredOnHome: e.target.checked }
                                    : q
                                )
                              )
                            }
                          />
                          <span>Nổi bật Trang chủ</span>
                        </label>
                        <label className="inline-flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={item.isYearbookSpread}
                            onChange={(e) =>
                              setQueue((prev) =>
                                prev.map((q) =>
                                  q.localId === item.localId
                                    ? { ...q, isYearbookSpread: e.target.checked }
                                    : q
                                )
                              )
                            }
                          />
                          <span>Phòng ảnh Kỷ yếu</span>
                        </label>
                      </div>

                      <span className="font-mono text-[11px] text-[#57534E] tabular-nums">
                        {item.status === 'done'
                          ? 'Hoàn tất 100%'
                          : item.status === 'uploading'
                          ? `Đang tải ${item.progress}%`
                          : item.status === 'error'
                          ? `Lỗi: ${item.errorMsg}`
                          : 'Chờ tải lên'}
                      </span>
                    </div>

                    {item.status === 'uploading' && (
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#E5DDD0]">
                        <div
                          className="h-full rounded-full bg-[#C83E31]"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Media Inventory List */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-serif text-2xl font-semibold text-[#1C1917]">
                Kho Ảnh &amp; Video hiện có ({filteredMedia.length})
              </h2>
              <div className="flex gap-2">
                {(['ALL', '10A3', '11B3', '12C3'] as const).map((yr) => (
                  <button
                    key={yr}
                    type="button"
                    onClick={() => setMediaFilterYear(yr)}
                    className={`cursor-pointer rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
                      mediaFilterYear === yr
                        ? 'bg-[#1C1917] text-[#FAF7F2]'
                        : 'border border-[#D6CEC2] bg-[#FAF7F2] text-[#57534E] hover:text-[#1C1917]'
                    }`}
                  >
                    {yr === 'ALL' ? 'Tất cả' : yr}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredMedia.map((m) => (
                <div
                  key={m.id}
                  className="editorial-card-shadow flex flex-col justify-between rounded-2xl border border-[#E5DDD0] bg-white p-3.5"
                >
                  <div>
                    <ArchivalMediaFrame
                      src={m.mediaType === 'video' ? m.thumbnailUrl : m.url}
                      alt={m.title}
                      isDemo={m.isDemo}
                      mediaType={m.mediaType}
                      label={m.title}
                      aspectClass="aspect-[16/10]"
                      className="rounded-xl"
                    />
                    <div className="mt-3 px-0.5">
                      <p className="text-[11px] font-medium text-[#C83E31]">
                        {m.yearCode} · {m.eventTitle} ·{' '}
                        {m.mediaType === 'video'
                          ? `Video (${formatDuration(m.durationSec)})`
                          : 'Hình ảnh'}
                      </p>
                      <h3 className="mt-1 font-serif text-lg font-semibold text-[#1C1917]">
                        {m.title}
                      </h3>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-[#EFE9DE] pt-2.5 text-xs">
                    {!m.isDemo ? (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            void saveMediaItem({ ...m, featuredOnHome: !m.featuredOnHome }).catch(() =>
                              setNotice('Không thể cập nhật trạng thái nổi bật trên Firestore.')
                            )
                          }
                          className="cursor-pointer font-medium text-[#1C1917] hover:text-[#C83E31]"
                        >
                          {m.featuredOnHome ? 'Bỏ nổi bật' : 'Đưa lên Trang chủ'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void deleteMediaItem(m.id).catch(() =>
                              setNotice('Không thể xóa mục này trên Firestore.')
                            )
                          }
                          aria-label={`Xóa ${m.title}`}
                          className="cursor-pointer text-[#C83E31]"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    ) : (
                      <span className="text-[11px] text-[#78716C]">
                        Mục DEMO (tự ẩn khi có tệp thật)
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* TAB 2: EVENTS */}
      {tab === 'events' && (
        <section className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12">
          <form
            onSubmit={(e) => void handleSaveEvent(e)}
            className="editorial-card-shadow space-y-4 rounded-2xl border border-[#E5DDD0] bg-white p-6 lg:col-span-5"
          >
            <h2 className="font-serif text-2xl font-semibold text-[#1C1917]">
              {editingEvent ? 'Chỉnh sửa sự kiện' : 'Tạo sự kiện / album mới'}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#1C1917]">Năm học</label>
                <select
                  value={evYear}
                  onChange={(e) => setEvYear(e.target.value as YearCode)}
                  className="mt-1 w-full rounded-lg border border-[#D6CEC2] bg-[#FAF7F2] px-3 py-2 text-xs text-[#1C1917]"
                >
                  <option value="10A3">10A3</option>
                  <option value="11B3">11B3</option>
                  <option value="12C3">12C3</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1C1917]">Mã định danh</label>
                <input
                  type="text"
                  required
                  value={evSlug}
                  onChange={(e) => setEvSlug(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D6CEC2] bg-[#FAF7F2] px-3 py-2 text-xs text-[#1C1917]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1C1917]">Tên sự kiện</label>
              <input
                type="text"
                required
                value={evTitle}
                onChange={(e) => setEvTitle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#D6CEC2] bg-[#FAF7F2] px-3 py-2 text-sm text-[#1C1917]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1C1917]">Thời gian tổ chức</label>
              <input
                type="text"
                required
                value={evDateLabel}
                onChange={(e) => setEvDateLabel(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#D6CEC2] bg-[#FAF7F2] px-3 py-2 text-sm text-[#1C1917]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1C1917]">Giới thiệu ngắn</label>
              <textarea
                rows={3}
                required
                value={evSummary}
                onChange={(e) => setEvSummary(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#D6CEC2] bg-[#FAF7F2] p-3 text-sm text-[#1C1917]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1C1917]">Ảnh bìa URL hoặc plate</label>
              <input
                type="text"
                value={evCoverUrl}
                onChange={(e) => setEvCoverUrl(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#D6CEC2] bg-[#FAF7F2] px-3 py-2 text-xs text-[#1C1917]"
              />
            </div>

            <label className="inline-flex items-center gap-2 text-xs text-[#1C1917]">
              <input
                type="checkbox"
                checked={evSpecial}
                onChange={(e) => setEvSpecial(e.target.checked)}
              />
              <span>Sự kiện điểm nhấn (Hội trại / Kỷ yếu)</span>
            </label>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                className="cursor-pointer rounded-md bg-[#1C1917] px-6 py-2 text-xs font-semibold text-[#FAF7F2] transition-colors hover:bg-[#C83E31]"
              >
                Lưu sự kiện
              </button>
              {editingEvent && (
                <button
                  type="button"
                  onClick={startNewEvent}
                  className="cursor-pointer rounded-md border border-[#D6CEC2] px-4 py-2 text-xs text-[#1C1917]"
                >
                  Tạo mới
                </button>
              )}
            </div>
          </form>

          <div className="space-y-3 lg:col-span-7">
            {events.map((ev) => (
              <div
                key={ev.id}
                className="editorial-card-shadow flex flex-col gap-3 rounded-2xl border border-[#E5DDD0] bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-xs font-semibold text-[#C83E31]">
                    {ev.yearCode} · {ev.dateLabel}
                  </p>
                  <h3 className="font-serif text-xl font-semibold text-[#1C1917]">
                    {ev.title}
                  </h3>
                  <p className="mt-1 text-xs text-[#57534E]">{ev.summary}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingEvent(ev);
                      setEvYear(ev.yearCode);
                      setEvSlug(ev.slug);
                      setEvTitle(ev.title);
                      setEvDateLabel(ev.dateLabel);
                      setEvSummary(ev.summary);
                      setEvCoverUrl(ev.coverImageUrl || '');
                      setEvSpecial(ev.isSpecial);
                    }}
                    className="cursor-pointer rounded-md border border-[#D6CEC2] px-3.5 py-1.5 text-xs font-medium text-[#1C1917] hover:border-[#1C1917]"
                  >
                    Sửa
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void deleteEvent(ev.id)
                        .then(() => setNotice(`Đã xóa sự kiện "${ev.title}".`))
                        .catch(() => setNotice('Không thể xóa sự kiện trên Firestore.'))
                    }
                    aria-label={`Xóa sự kiện ${ev.title}`}
                    className="cursor-pointer rounded-md border border-[#E5DDD0] p-2 text-[#C83E31] hover:bg-[#FEF2F2]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* TAB 3: 50 SEATS QUICK EDITOR */}
      {tab === 'seats' && (
        <section className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[#57534E]">
              Chỉnh sửa nhanh tên 50 thành viên theo số ghế, hoặc mở trực tiếp sơ đồ lớp để đổi chỗ ngồi.
            </p>
            <button
              type="button"
              onClick={() => navigate({ page: 'classroom' })}
              className="cursor-pointer rounded-md bg-[#1C1917] px-5 py-2 text-xs font-semibold text-[#FAF7F2] transition-colors hover:bg-[#C83E31]"
            >
              Mở sơ đồ lớp học
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {seats.map((seat) => {
              const val = seatDraftName[seat.seatId] ?? seat.memberName;
              return (
                <div key={seat.seatId} className="rounded-xl border border-[#E5DDD0] bg-white p-3">
                  <p className="font-mono text-[11px] font-semibold text-[#C83E31] tabular-nums">
                    Ghế #{String(seat.seatNumber).padStart(2, '0')}
                  </p>
                  <input
                    type="text"
                    value={val}
                    onChange={(e) =>
                      setSeatDraftName((prev) => ({ ...prev, [seat.seatId]: e.target.value }))
                    }
                    className="mt-1.5 w-full rounded-lg border border-[#D6CEC2] bg-[#FAF7F2] px-2.5 py-1.5 text-xs text-[#1C1917]"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      void saveSeat({
                        ...seat,
                        memberName: val.trim() || seat.memberName,
                        isAssigned: !val.startsWith('Vị trí '),
                      })
                        .then(() => setNotice(`Đã cập nhật ghế #${seat.seatNumber}.`))
                        .catch(() => setNotice(`Không thể lưu ghế #${seat.seatNumber} lên Firestore.`))
                    }
                    className="mt-2 w-full cursor-pointer rounded-md border border-[#E5DDD0] bg-[#FAF7F2] py-1.5 text-[11px] font-semibold text-[#1C1917] transition-colors hover:border-[#1C1917] hover:bg-[#1C1917] hover:text-[#FAF7F2]"
                  >
                    Lưu vị trí
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* TAB 4: REMOVAL REQUESTS & GUESTBOOK MANAGEMENT */}
      {tab === 'moderation' && (
        <section className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-2xl font-semibold text-[#1C1917]">
                Quản lý Lưu bút ({guestbook.filter((g) => !g.id.startsWith('demo-')).length})
              </h2>
              <span className="text-[11px] text-[#57534E]">
                Đóng góp ảnh/video đã bỏ kiểm duyệt — đăng trực tiếp
              </span>
            </div>

            {guestbook.filter((g) => !g.id.startsWith('demo-')).length === 0 ? (
              <p className="rounded-2xl border border-[#E5DDD0] bg-white p-6 text-xs text-[#78716C]">
                Chưa có dòng lưu bút thật nào trên Firestore (hiện trang chủ chỉ đang hiển thị các dòng lưu bút mẫu DEMO).
              </p>
            ) : (
              guestbook
                .filter((g) => !g.id.startsWith('demo-'))
                .map((note) => {
                  const sentDateLabel = formatDateDDMMYYYY(note.createdAt, note.id);
                  return (
                    <div
                      key={note.id}
                      className="flex items-start justify-between gap-4 rounded-2xl border border-[#E5DDD0] bg-white p-4"
                    >
                      <div>
                        <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#57534E]">
                          <MessageSquare className="h-3.5 w-3.5 text-[#C83E31]" />
                          <span>
                            {note.authorName} · Kỷ niệm {note.yearTag}
                            {sentDateLabel ? ` · Gửi ngày ${sentDateLabel}` : ''}
                          </span>
                        </p>
                        <p className="mt-1.5 font-serif text-base italic text-[#1C1917]">
                          “{note.message}”
                        </p>
                      </div>
                    <button
                      type="button"
                      onClick={() =>
                        void deleteGuestbookNote(note.id)
                          .then(() => setNotice(`Đã xóa lưu bút của ${note.authorName}.`))
                          .catch(() => setNotice('Không thể xóa lưu bút trên Firestore.'))
                      }
                      aria-label={`Xóa lưu bút của ${note.authorName}`}
                      className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-[#C83E31]/40 px-3 py-1.5 text-xs font-medium text-[#C83E31] hover:bg-[#FEF2F2]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Xóa</span>
                    </button>
                  </div>
                  );
                })
            )}

            {submissions.length > 0 && (
              <div className="space-y-3 pt-4">
                <h3 className="font-serif text-xl font-semibold text-[#1C1917]">
                  Đóng góp cũ còn tồn ({submissions.length})
                </h3>
                {submissions.map((sub) => (
                  <div key={sub.id} className="rounded-2xl border border-[#E5DDD0] bg-white p-4">
                    <p className="text-[11px] text-[#57534E]">
                      {sub.yearCode} · {sub.eventSlug} · Gửi bởi {sub.submittedByName} · Trạng thái: {sub.status}
                    </p>
                    <h4 className="mt-1 font-serif text-lg font-semibold text-[#1C1917]">
                      {sub.title}
                    </h4>
                    {sub.caption && <p className="mt-1 text-xs text-[#57534E]">{sub.caption}</p>}
                    {sub.status === 'pending' && (
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            void moderateSubmission(sub, 'approved')
                              .then(() => setNotice(`Đã duyệt "${sub.title}".`))
                              .catch(() => setNotice('Không thể duyệt mục đóng góp lúc này.'))
                          }
                          className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-[#047857] px-3.5 py-1.5 text-xs text-white"
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>Duyệt &amp; đăng</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void moderateSubmission(sub, 'rejected', 'Không phù hợp')
                              .then(() => setNotice(`Đã từ chối "${sub.title}".`))
                              .catch(() => setNotice('Không thể cập nhật trạng thái đóng góp.'))
                          }
                          className="cursor-pointer rounded-md border border-[#C83E31] px-3.5 py-1.5 text-xs text-[#C83E31]"
                        >
                          Từ chối
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <h2 className="font-serif text-2xl font-semibold text-[#1C1917]">
              Yêu cầu gỡ bỏ nội dung ({removalRequests.length})
            </h2>
            {removalRequests.length === 0 ? (
              <p className="rounded-2xl border border-[#E5DDD0] bg-white p-6 text-xs text-[#78716C]">
                Chưa có yêu cầu gỡ ảnh/video nào.
              </p>
            ) : (
              removalRequests.map((req) => (
                <div key={req.id} className="rounded-2xl border border-[#E5DDD0] bg-white p-4">
                  <p className="text-[11px] text-[#57534E]">
                    Người yêu cầu: {req.requestedByName} · Trạng thái: {req.status}
                  </p>
                  <h3 className="mt-1 font-serif text-lg font-semibold text-[#1C1917]">
                    {req.mediaTitle}
                  </h3>
                  <p className="mt-1 text-xs text-[#57534E]">Lý do: {req.reason}</p>
                  {req.status === 'pending' && (
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          void resolveRemovalRequest(req, 'resolved', 'Đã ẩn theo yêu cầu')
                            .then(() => setNotice(`Đã gỡ "${req.mediaTitle}".`))
                            .catch(() => setNotice('Không thể xử lý yêu cầu gỡ trên Firestore.'))
                        }
                        className="cursor-pointer rounded-md bg-[#C83E31] px-3.5 py-1.5 text-xs text-white"
                      >
                        Gỡ khỏi thư viện
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void resolveRemovalRequest(req, 'dismissed')
                            .then(() => setNotice(`Đã giữ lại "${req.mediaTitle}".`))
                            .catch(() => setNotice('Không thể cập nhật yêu cầu trên Firestore.'))
                        }
                        className="cursor-pointer rounded-md border border-[#D6CEC2] px-3.5 py-1.5 text-xs text-[#57534E]"
                      >
                        Giữ lại
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* TAB 5: USERS & RBAC */}
      {tab === 'users' && (
        <section className="mt-8 space-y-3">
          <div className="flex items-center gap-2 text-xs text-[#57534E]">
            <Users className="h-4 w-4 text-[#C83E31]" />
            <span>
              Chỉ những tài khoản được cấp quyền thành viên hoặc quản trị viên mới có thể xem kho lưu trữ riêng tư.
            </span>
          </div>
          {usersDirectory.map((u) => (
            <div
              key={u.uid}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#E5DDD0] bg-white p-4"
            >
              <div>
                <p className="text-sm font-semibold text-[#1C1917]">{u.displayName}</p>
                <p className="font-mono text-[11px] text-[#78716C]">UID: {u.uid}</p>
              </div>
              <div className="flex items-center gap-2">
                {(['pending', 'member', 'admin'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() =>
                      void updateUserRole(u.uid, r)
                        .then(() => setNotice(`Đã cập nhật quyền của ${u.displayName}.`))
                        .catch(() => setNotice('Không thể cập nhật quyền thành viên trên Firestore.'))
                    }
                    className={`cursor-pointer rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
                      u.role === r
                        ? 'bg-[#1C1917] text-[#FAF7F2]'
                        : 'border border-[#D6CEC2] bg-[#FAF7F2] text-[#57534E] hover:text-[#1C1917]'
                    }`}
                  >
                    {r === 'admin' ? 'Quản trị' : r === 'member' ? 'Thành viên' : 'Chờ duyệt'}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* TAB 6: SITE CONFIG & MUSIC */}
      {tab === 'site' && (
        <form
          onSubmit={(e) => void handleSaveSiteConfig(e)}
          className="editorial-card-shadow mt-8 max-w-2xl space-y-4 rounded-2xl border border-[#E5DDD0] bg-white p-6"
        >
          <h2 className="font-serif text-2xl font-semibold text-[#1C1917]">
            Chỉnh sửa nội dung Trang chủ &amp; Nhạc chủ đề
          </h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-[#1C1917]">Tên website</label>
              <input
                type="text"
                required
                value={cfgName}
                onChange={(e) => setCfgName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#D6CEC2] bg-[#FAF7F2] px-3 py-2 text-sm text-[#1C1917]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#1C1917]">Tên trường</label>
              <input
                type="text"
                required
                value={cfgSchool}
                onChange={(e) => setCfgSchool(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#D6CEC2] bg-[#FAF7F2] px-3 py-2 text-sm text-[#1C1917]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#1C1917]">Slogan tập thể</label>
            <input
              type="text"
              required
              value={cfgSlogan}
              onChange={(e) => setCfgSlogan(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#D6CEC2] bg-[#FAF7F2] px-3 py-2 text-sm text-[#1C1917]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#1C1917]">Tiêu đề Hero trang chủ</label>
            <input
              type="text"
              required
              value={cfgHeroTitle}
              onChange={(e) => setCfgHeroTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#D6CEC2] bg-[#FAF7F2] px-3 py-2 text-sm text-[#1C1917]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#1C1917]">Mô tả phụ Hero</label>
            <textarea
              rows={2}
              value={cfgHeroSub}
              onChange={(e) => setCfgHeroSub(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[#D6CEC2] bg-[#FAF7F2] p-3 text-sm text-[#1C1917]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#1C1917]">Lời giới thiệu 50 thành viên</label>
            <textarea
              rows={3}
              value={cfgStory}
              onChange={(e) => setCfgStory(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[#D6CEC2] bg-[#FAF7F2] p-3 text-sm text-[#1C1917]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#1C1917]">
              YouTube Video ID bài hát chủ đề (mặc định: Thanh Xuân – Da LAB: GgQFO8dL5XQ)
            </label>
            <input
              type="text"
              required
              value={cfgMusicId}
              onChange={(e) => setCfgMusicId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#D6CEC2] bg-[#FAF7F2] px-3 py-2 font-mono text-xs text-[#1C1917]"
            />
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-[#1C1917]">
            <input
              type="checkbox"
              checked={cfgDemo}
              onChange={(e) => setCfgDemo(e.target.checked)}
            />
            <span>Cho phép khách xem giao diện DEMO trước khi đăng nhập</span>
          </label>

          <div className="pt-2">
            <button
              type="submit"
              className="cursor-pointer rounded-md bg-[#1C1917] px-6 py-2.5 text-xs font-semibold text-[#FAF7F2] transition-colors hover:bg-[#C83E31]"
            >
              Lưu cấu hình trang chủ
            </button>
          </div>
        </form>
      )}
    </main>
  );
};
