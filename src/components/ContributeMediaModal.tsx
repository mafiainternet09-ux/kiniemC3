import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  CheckCircle2,
  Film,
  Image as ImageIcon,
  RefreshCw,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { useArchive } from '../context/ArchiveContext';
import { formatUserFacingError } from '../lib/firebase';
import {
  detectMediaType,
  extractVideoThumbnail,
  formatFileSize,
  stripImageExifGps,
  uploadBlobToFirebaseStorage,
} from '../lib/mediaProcessing';
import type { MediaType, YearCode } from '../types/memory';
import { MAX_MEDIA_UPLOAD_BYTES } from '../utils/uploadChunking';

interface ContributeMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultYear?: YearCode;
  defaultEventSlug?: string;
}

interface QueuedContribution {
  localId: string;
  file: File;
  previewUrl: string | null;
  mediaType: MediaType;
  title: string;
  caption: string;
  yearCode: YearCode;
  eventId: string;
  progress: number;
  status: 'queued' | 'uploading' | 'done' | 'error';
  stageText?: string;
  errorMsg?: string;
}

export const ContributeMediaModal: React.FC<ContributeMediaModalProps> = ({
  isOpen,
  onClose,
  defaultYear = '12C3',
  defaultEventSlug = 'ky-niem-khac',
}) => {
  const { events, publishMemberMedia } = useArchive();

  const [selectedYear, setSelectedYear] = useState<YearCode>(defaultYear);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [sharedTagsText, setSharedTagsText] = useState('');
  const [queue, setQueue] = useState<QueuedContribution[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploadingAll, setIsUploadingAll] = useState(false);

  const previewUrlsRef = useRef<Set<string>>(new Set());

  const yearEvents = useMemo(
    () =>
      events
        .filter((ev) => ev.yearCode === selectedYear)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [events, selectedYear]
  );

  // Sync default year & event whenever modal opens
  useEffect(() => {
    if (!isOpen) return;
    setSelectedYear(defaultYear);
    const matchingYearEvents = events
      .filter((ev) => ev.yearCode === defaultYear)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const preferred =
      matchingYearEvents.find((ev) => ev.slug === defaultEventSlug) ||
      matchingYearEvents.find((ev) => ev.slug === 'ky-niem-khac') ||
      matchingYearEvents[0];
    if (preferred) {
      setSelectedEventId(preferred.id);
    }
  }, [isOpen, defaultYear, defaultEventSlug, events]);

  // Keep selectedEventId valid when user switches year
  useEffect(() => {
    if (yearEvents.length === 0) return;
    if (!yearEvents.some((ev) => ev.id === selectedEventId)) {
      const fallback =
        yearEvents.find((ev) => ev.slug === 'ky-niem-khac') || yearEvents[0];
      setSelectedEventId(fallback.id);
    }
  }, [yearEvents, selectedEventId]);

  // Cleanup all object URLs on unmount
  useEffect(() => {
    const urls = previewUrlsRef.current;
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
      urls.clear();
    };
  }, []);

  if (!isOpen) return null;

  const cleanFileNameToTitle = (name: string): string => {
    const withoutExt = name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim();
    return withoutExt.length >= 2 ? withoutExt.slice(0, 140) : 'Khoảnh khắc C3';
  };

  const addFilesToQueue = (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const targetEventId =
      selectedEventId ||
      yearEvents.find((ev) => ev.slug === 'ky-niem-khac')?.id ||
      yearEvents[0]?.id ||
      '';

    const nextItems: QueuedContribution[] = Array.from(files).map((file) => {
      const mediaType = detectMediaType(file);
      const isTooLarge = file.size > MAX_MEDIA_UPLOAD_BYTES;
      let previewUrl: string | null = null;
      if (mediaType === 'image' && !isTooLarge) {
        previewUrl = URL.createObjectURL(file);
        previewUrlsRef.current.add(previewUrl);
      }
      return {
        localId: `up-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        previewUrl,
        mediaType,
        title: cleanFileNameToTitle(file.name),
        caption: '',
        yearCode: selectedYear,
        eventId: targetEventId,
        progress: 0,
        status: isTooLarge ? 'error' : 'queued',
        errorMsg: isTooLarge
          ? `Tệp nặng ${formatFileSize(file.size)}, vượt quá giới hạn tối đa 1GB/tệp.`
          : undefined,
      };
    });

    setQueue((prev) => [...prev, ...nextItems]);
  };

  const removeQueueItem = (localId: string) => {
    setQueue((prev) => {
      const target = prev.find((q) => q.localId === localId);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
        previewUrlsRef.current.delete(target.previewUrl);
      }
      return prev.filter((q) => q.localId !== localId);
    });
  };

  const handleClose = () => {
    if (isUploadingAll) return;
    setQueue((prev) => {
      prev.forEach((item) => {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
          previewUrlsRef.current.delete(item.previewUrl);
        }
      });
      return [];
    });
    setSharedTagsText('');
    onClose();
  };

  const handleYearChange = (nextYear: YearCode) => {
    setSelectedYear(nextYear);
    const matching = events
      .filter((ev) => ev.yearCode === nextYear)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const preferred =
      matching.find((ev) => ev.slug === 'ky-niem-khac') || matching[0];
    const nextEventId = preferred?.id || '';
    setSelectedEventId(nextEventId);
    setQueue((prev) =>
      prev.map((q) =>
        q.status === 'queued'
          ? { ...q, yearCode: nextYear, eventId: nextEventId }
          : q
      )
    );
  };

  const handleGlobalEventChange = (nextEventId: string) => {
    setSelectedEventId(nextEventId);
    setQueue((prev) =>
      prev.map((q) =>
        q.status === 'queued' ? { ...q, eventId: nextEventId } : q
      )
    );
  };

  const uploadSingleItem = async (item: QueuedContribution) => {
    const matchedEvent =
      events.find((ev) => ev.id === item.eventId) ||
      events.find((ev) => ev.yearCode === item.yearCode && ev.slug === 'ky-niem-khac') ||
      events.find((ev) => ev.yearCode === item.yearCode);

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
        q.localId === item.localId
          ? {
              ...q,
              status: 'uploading',
              progress: 8,
              stageText:
                item.mediaType === 'video'
                  ? 'Đang trích xuất ảnh bìa video...'
                  : 'Đang tối ưu ảnh & xóa GPS EXIF...',
              errorMsg: undefined,
            }
          : q
      )
    );

    try {
      const safeName = `${Date.now()}-${item.file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      let mainUrl = '';
      let mainStoragePath = '';
      let thumbUrl = '';
      let thumbStoragePath = '';
      let durationSec = 0;

      if (item.mediaType === 'video') {
        const extracted = await extractVideoThumbnail(item.file);
        durationSec = extracted.durationSec;

        setQueue((prev) =>
          prev.map((q) =>
            q.localId === item.localId
              ? { ...q, stageText: 'Đang tải video lên kho lưu trữ C3...', progress: 15 }
              : q
          )
        );

        const uploadedVid = await uploadBlobToFirebaseStorage(
          item.file,
          `c3-memories/${item.yearCode}/video/${safeName}`,
          item.file.type || 'video/mp4',
          (pct) => {
            setQueue((prev) =>
              prev.map((q) =>
                q.localId === item.localId
                  ? { ...q, progress: Math.max(15, Math.min(92, pct)) }
                  : q
              )
            );
          }
        );
        mainUrl = uploadedVid.url;
        mainStoragePath = uploadedVid.storagePath;

        if (extracted.blob) {
          try {
            const uploadedThumb = await uploadBlobToFirebaseStorage(
              extracted.blob,
              `c3-memories/${item.yearCode}/thumbnail/${safeName}.jpg`,
              'image/jpeg',
              () => {}
            );
            thumbUrl = uploadedThumb.url;
            thumbStoragePath = uploadedThumb.storagePath;
          } catch {
            // Thumbnail upload failure should not block the video itself
          }
        }
      } else {
        const cleanedBlob = await stripImageExifGps(item.file);
        setQueue((prev) =>
          prev.map((q) =>
            q.localId === item.localId
              ? { ...q, stageText: 'Đang tải ảnh lên kho lưu trữ C3...', progress: 20 }
              : q
          )
        );

        const uploadedImg = await uploadBlobToFirebaseStorage(
          cleanedBlob,
          `c3-memories/${item.yearCode}/image/${safeName}`,
          cleanedBlob.type || item.file.type || 'image/jpeg',
          (pct) => {
            setQueue((prev) =>
              prev.map((q) =>
                q.localId === item.localId
                  ? { ...q, progress: Math.max(20, Math.min(95, pct)) }
                  : q
              )
            );
          }
        );
        mainUrl = uploadedImg.url;
        mainStoragePath = uploadedImg.storagePath;
      }

      setQueue((prev) =>
        prev.map((q) =>
          q.localId === item.localId
            ? { ...q, stageText: 'Đang lưu vào bộ sưu tập lớp C3...', progress: 96 }
            : q
        )
      );

      const extraTags = sharedTagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      await publishMemberMedia({
        yearCode: item.yearCode,
        eventId: matchedEvent.id,
        eventSlug: matchedEvent.slug,
        eventTitle: matchedEvent.title,
        mediaType: item.mediaType,
        title: item.title.trim() || cleanFileNameToTitle(item.file.name),
        caption: item.caption.trim(),
        url: mainUrl,
        storagePath: mainStoragePath,
        thumbnailUrl: thumbUrl,
        thumbnailStoragePath: thumbStoragePath,
        durationSec,
        tags: [item.yearCode.toLowerCase(), matchedEvent.slug, ...extraTags],
      });

      setQueue((prev) =>
        prev.map((q) =>
          q.localId === item.localId
            ? {
                ...q,
                status: 'done',
                progress: 100,
                stageText: 'Đã đăng trực tiếp lên kho C3!',
              }
            : q
        )
      );
    } catch (err) {
      const msg = formatUserFacingError(err, 'Không thể tải tệp lên lúc này.');
      setQueue((prev) =>
        prev.map((q) =>
          q.localId === item.localId
            ? { ...q, status: 'error', errorMsg: msg, stageText: undefined }
            : q
        )
      );
    }
  };

  const handlePublishAll = async (e: React.FormEvent) => {
    e.preventDefault();
    const pending = queue.filter((q) => q.status === 'queued' || q.status === 'error');
    if (pending.length === 0 || isUploadingAll) return;
    setIsUploadingAll(true);
    try {
      for (const item of pending) {
        await uploadSingleItem(item);
      }
    } finally {
      setIsUploadingAll(false);
    }
  };

  const pendingCount = queue.filter((q) => q.status === 'queued' || q.status === 'error').length;
  const doneCount = queue.filter((q) => q.status === 'done').length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Đóng góp ảnh và video kỷ niệm C3"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#171412]/75 p-4 backdrop-blur-md"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[#E5DDD0] bg-[#FAF7F2] shadow-2xl"
      >
        {/* Header */}
        <div className="obsidian-darkroom flex items-start justify-between gap-4 px-6 py-4 text-[#FAF7F2]">
          <div>
            <p className="text-[11px] font-medium tracking-[0.16em] text-[#E9C46A]">
              ĐÓNG GÓP TRỰC TIẾP · KHÔNG CẦN CHỜ DUYỆT
            </p>
            <h3 className="mt-1 font-serif text-2xl font-semibold">
              Tải lên Ảnh &amp; Video Kỷ niệm C3
            </h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isUploadingAll}
            aria-label="Đóng hộp thoại tải lên"
            className="cursor-pointer rounded-full p-1.5 text-[#D6CEC2] hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form
          onSubmit={(e) => void handlePublishAll(e)}
          className="flex-1 space-y-5 overflow-y-auto p-6"
        >
          {/* Step 1: Choose Year & Event (including Kỷ niệm khác) */}
          <div className="grid grid-cols-1 gap-4 rounded-2xl border border-[#E5DDD0] bg-white p-4 sm:grid-cols-12">
            <div className="sm:col-span-4">
              <label
                htmlFor="contrib-year-select"
                className="block text-xs font-semibold text-[#1C1917]"
              >
                1. Năm học
              </label>
              <select
                id="contrib-year-select"
                value={selectedYear}
                onChange={(e) => handleYearChange(e.target.value as YearCode)}
                className="mt-1.5 w-full rounded-xl border border-[#D6CEC2] bg-[#FAF7F2] px-3 py-2 text-sm text-[#1C1917]"
              >
                <option value="10A3">Lớp 10 (10A3)</option>
                <option value="11B3">Lớp 11 (11B3)</option>
                <option value="12C3">Lớp 12 (12C3)</option>
              </select>
            </div>

            <div className="sm:col-span-5">
              <label
                htmlFor="contrib-event-select"
                className="block text-xs font-semibold text-[#1C1917]"
              >
                2. Sự kiện hoặc Kỷ niệm khác
              </label>
              <select
                id="contrib-event-select"
                value={selectedEventId}
                onChange={(e) => handleGlobalEventChange(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[#D6CEC2] bg-[#FAF7F2] px-3 py-2 text-sm text-[#1C1917]"
              >
                {yearEvents.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.slug === 'ky-niem-khac' ? `★ ${ev.title}` : ev.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-3">
              <label
                htmlFor="contrib-tags-input"
                className="block text-xs font-semibold text-[#1C1917]"
              >
                Thẻ chung (tuỳ chọn)
              </label>
              <input
                id="contrib-tags-input"
                type="text"
                value={sharedTagsText}
                onChange={(e) => setSharedTagsText(e.target.value)}
                placeholder="VD: ra chơi, sân trường"
                className="mt-1.5 w-full rounded-xl border border-[#D6CEC2] bg-[#FAF7F2] px-3 py-2 text-xs text-[#1C1917]"
              />
            </div>
          </div>

          {/* Step 2: Drag & Drop Multi-File Dropzone */}
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              addFilesToQueue(e.dataTransfer.files);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
              isDragging
                ? 'border-[#C83E31] bg-[#FEF2F2]'
                : 'border-[#D6CEC2] bg-white hover:border-[#C83E31]/60 hover:bg-[#FAF7F2]'
            }`}
          >
            <UploadCloud className="h-8 w-8 text-[#C83E31]" aria-hidden="true" />
            <span className="mt-2.5 text-sm font-semibold text-[#1C1917]">
              Kéo thả ảnh hoặc video vào đây, hoặc bấm để chọn nhiều tệp cùng lúc
            </span>
            <span className="mt-1 text-xs text-[#57534E]">
              Hỗ trợ JPG, PNG, WebP, HEIC, MP4, MOV, WebM (tối đa 1GB/tệp · tự động chia nhỏ khi tải lên) · Đăng hiển thị ngay lập tức
            </span>
            <input
              type="file"
              multiple
              accept="image/*,video/*,.mp4,.mov,.webm,.m4v,.avi,.mkv,.3gp,.heic,.heif,.jpg,.jpeg,.png,.webp"
              onChange={(e) => {
                addFilesToQueue(e.target.files);
                e.target.value = '';
              }}
              className="sr-only"
            />
          </label>

          {/* Step 3: File Preview Queue */}
          {queue.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-[#1C1917]">
                  Danh sách tệp đã chọn ({queue.length} tệp
                  {doneCount > 0 ? ` · ${doneCount} đã đăng thành công` : ''})
                </p>
                {doneCount > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setQueue((prev) => prev.filter((q) => q.status !== 'done'))
                    }
                    className="cursor-pointer text-xs text-[#C83E31] underline hover:text-[#1C1917]"
                  >
                    Ẩn các tệp đã đăng xong
                  </button>
                )}
              </div>

              {queue.map((item) => (
                <div
                  key={item.localId}
                  className={`rounded-2xl border p-3.5 transition-colors ${
                    item.status === 'done'
                      ? 'border-[#15803D]/40 bg-[#ECFDF5]'
                      : item.status === 'error'
                      ? 'border-[#B91C1C]/40 bg-[#FEF2F2]'
                      : 'border-[#E5DDD0] bg-white'
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                    {/* Preview Box */}
                    <div className="flex h-20 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#E5DDD0] bg-[#FAF7F2]">
                      {item.mediaType === 'image' && item.previewUrl ? (
                        <img
                          src={item.previewUrl}
                          alt={item.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-1 text-[#57534E]">
                          <Film className="h-6 w-6 text-[#C83E31]" />
                          <span className="font-mono text-[10px]">VIDEO</span>
                        </div>
                      )}
                    </div>

                    {/* Editable Metadata */}
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#57534E]">
                          <span className="inline-flex items-center gap-1 font-medium text-[#1C1917]">
                            {item.mediaType === 'video' ? (
                              <Film className="h-3.5 w-3.5 text-[#B45309]" />
                            ) : (
                              <ImageIcon className="h-3.5 w-3.5 text-[#C83E31]" />
                            )}
                            {item.file.name}
                          </span>
                          <span className="font-mono text-[11px] tabular-nums">
                            ({formatFileSize(item.file.size)})
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {item.status === 'error' && (
                            <button
                              type="button"
                              onClick={() => void uploadSingleItem(item)}
                              className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-[#C83E31] px-3 py-1 text-[11px] font-medium text-white"
                            >
                              <RefreshCw className="h-3 w-3" />
                              <span>Thử lại</span>
                            </button>
                          )}
                          {item.status !== 'uploading' && (
                            <button
                              type="button"
                              onClick={() => removeQueueItem(item.localId)}
                              aria-label={`Xóa ${item.file.name}`}
                              className="cursor-pointer p-1 text-[#78716C] hover:text-[#B91C1C]"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <input
                          type="text"
                          value={item.title}
                          disabled={item.status === 'uploading' || item.status === 'done'}
                          onChange={(e) =>
                            setQueue((prev) =>
                              prev.map((q) =>
                                q.localId === item.localId
                                  ? { ...q, title: e.target.value }
                                  : q
                              )
                            )
                          }
                          placeholder="Tiêu đề khoảnh khắc..."
                          className="rounded-xl border border-[#D6CEC2] bg-[#FAF7F2] px-2.5 py-1.5 text-xs text-[#1C1917] disabled:opacity-60"
                        />
                        <select
                          value={item.eventId}
                          disabled={item.status === 'uploading' || item.status === 'done'}
                          onChange={(e) =>
                            setQueue((prev) =>
                              prev.map((q) =>
                                q.localId === item.localId
                                  ? { ...q, eventId: e.target.value }
                                  : q
                              )
                            )
                          }
                          className="rounded-xl border border-[#D6CEC2] bg-[#FAF7F2] px-2.5 py-1.5 text-xs text-[#1C1917] disabled:opacity-60"
                        >
                          {events
                            .filter((ev) => ev.yearCode === item.yearCode)
                            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                            .map((ev) => (
                              <option key={ev.id} value={ev.id}>
                                {ev.yearCode} · {ev.title}
                              </option>
                            ))}
                        </select>
                      </div>

                      <input
                        type="text"
                        value={item.caption}
                        disabled={item.status === 'uploading' || item.status === 'done'}
                        onChange={(e) =>
                          setQueue((prev) =>
                            prev.map((q) =>
                              q.localId === item.localId
                                ? { ...q, caption: e.target.value }
                                : q
                            )
                          )
                        }
                        placeholder="Chú thích ngắn (không bắt buộc)..."
                        className="w-full rounded-xl border border-[#D6CEC2] bg-[#FAF7F2] px-2.5 py-1.5 text-xs text-[#1C1917] disabled:opacity-60"
                      />

                      {item.status === 'uploading' && (
                        <div className="space-y-1 pt-1">
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#EFE9DE]">
                            <div
                              className="h-full rounded-full bg-[#C83E31] transition-all"
                              style={{ width: `${item.progress}%` }}
                            />
                          </div>
                          <p className="text-[11px] text-[#57534E]">
                            {item.stageText || 'Đang tải lên...'} ({item.progress}%)
                          </p>
                        </div>
                      )}

                      {item.status === 'done' && (
                        <p className="inline-flex items-center gap-1.5 text-xs font-medium text-[#15803D]">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>{item.stageText}</span>
                        </p>
                      )}

                      {item.status === 'error' && item.errorMsg && (
                        <p className="text-xs text-[#B91C1C]">{item.errorMsg}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Footer actions inside form */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E5DDD0] pt-4">
            <p className="text-xs text-[#57534E]">
              Ảnh &amp; video sau khi đăng sẽ xuất hiện ngay trong mục tương ứng của năm học.
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleClose}
                disabled={isUploadingAll}
                className="cursor-pointer rounded-xl border border-[#D6CEC2] px-5 py-2 text-xs font-medium text-[#57534E] disabled:opacity-40"
              >
                {doneCount > 0 && pendingCount === 0 ? 'Xong & Đóng' : 'Đóng'}
              </button>
              <button
                type="submit"
                disabled={isUploadingAll || pendingCount === 0}
                className="cursor-pointer rounded-xl bg-[#C83E31] px-6 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#A93125] disabled:opacity-50"
              >
                {isUploadingAll
                  ? 'Đang tải lên...'
                  : pendingCount > 0
                  ? `Đăng ngay (${pendingCount} tệp)`
                  : 'Chọn tệp để đăng'}
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
