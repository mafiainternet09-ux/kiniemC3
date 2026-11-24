import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Film, Flag, Loader2, Maximize2, Pause, Play, Trash2, Volume2, VolumeX, X } from 'lucide-react';
import { useArchive } from '../context/ArchiveContext';
import type { MediaItem } from '../types/memory';
import { formatDuration } from '../utils/memorySearch';
import { extractYoutubeVideoIdOrNull } from '../utils/videoPlayback';
import { ArchivalMediaFrame } from './ArchivalMediaFrame';

interface VideoPlayerModalProps {
  video: MediaItem | null;
  onClose: () => void;
}

export const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({ video, onClose }) => {
  const { isAuthorized, isAdmin, user, submitRemovalRequest, deleteMediaItem } = useArchive();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(80);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [videoError, setVideoError] = useState(false);
  const [resolvedPlayUrl, setResolvedPlayUrl] = useState<string>('');
  const [transcodeState, setTranscodeState] = useState<{
    status: 'ready' | 'processing' | 'error';
    progressPct: number;
    error?: string;
  }>({ status: 'ready', progressPct: 100 });
  const [showRemoval, setShowRemoval] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reason, setReason] = useState('');
  const [sentMessage, setSentMessage] = useState('');

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(video?.durationSec || 0);
    setVideoError(false);
    setShowRemoval(false);
    setConfirmDelete(false);
    setReason('');
    setSentMessage('');
  }, [video]);

  useEffect(() => {
    if (!video) return;
    const isDemo = video.isDemo || video.url.startsWith('demo-video://');
    const ytId = extractYoutubeVideoIdOrNull(video.url);
    if (isDemo || ytId || !video.url.startsWith('/uploads/')) {
      setResolvedPlayUrl(video.url);
      setTranscodeState({ status: 'ready', progressPct: 100 });
      return;
    }

    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    setResolvedPlayUrl('');
    setTranscodeState({ status: 'processing', progressPct: 5 });

    const checkPlayable = async () => {
      try {
        const res = await fetch(`/api/media/playable?url=${encodeURIComponent(video.url)}`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          if (!cancelled) {
            setResolvedPlayUrl(video.url);
            setTranscodeState({ status: 'ready', progressPct: 100 });
          }
          return;
        }
        const data = (await res.json()) as {
          status: 'processing' | 'ready' | 'error';
          progressPct?: number;
          playUrl?: string;
          error?: string;
        };
        if (cancelled) return;

        if (data.status === 'ready' && data.playUrl) {
          setResolvedPlayUrl(data.playUrl);
          setTranscodeState({ status: 'ready', progressPct: 100 });
          return;
        }

        if (data.status === 'error') {
          setResolvedPlayUrl(video.url);
          setTranscodeState({
            status: 'error',
            progressPct: 0,
            error: data.error,
          });
          return;
        }

        setTranscodeState({
          status: 'processing',
          progressPct: data.progressPct ?? 10,
        });
        pollTimer = setTimeout(() => void checkPlayable(), 1200);
      } catch {
        if (!cancelled) {
          setResolvedPlayUrl(video.url);
          setTranscodeState({ status: 'ready', progressPct: 100 });
        }
      }
    };

    void checkPlayable();
    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [video]);

  if (!video) return null;

  const isDemoVideo = video.isDemo || video.url.startsWith('demo-video://');
  const youtubeVideoId = !isDemoVideo ? extractYoutubeVideoIdOrNull(video.url) : null;

  const togglePlay = () => {
    if (isDemoVideo) {
      setIsPlaying((v) => !v);
      return;
    }
    const el = videoRef.current;
    if (!el || videoError) return;
    if (el.paused) {
      void el.play().catch(() => {
        setIsPlaying(false);
      });
    } else {
      el.pause();
    }
  };

  const handleVolume = (val: number) => {
    setVolume(val);
    setMuted(val === 0);
    if (videoRef.current) {
      videoRef.current.volume = val / 100;
      videoRef.current.muted = val === 0;
    }
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (videoRef.current) {
      videoRef.current.muted = next;
    }
  };

  const handleSeek = (val: number) => {
    setCurrentTime(val);
    if (videoRef.current && !isDemoVideo) {
      videoRef.current.currentTime = val;
    }
  };

  const handleFullscreen = () => {
    const target = videoRef.current || playerContainerRef.current;
    if (!target) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else if (typeof target.requestFullscreen === 'function') {
      void target.requestFullscreen().catch(() => {});
    }
  };

  const handleSubmitRemoval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 4) return;
    try {
      await submitRemovalRequest(video, reason);
      setSentMessage('Đã gửi yêu cầu gỡ video tới Quản trị viên.');
      setShowRemoval(false);
      setReason('');
    } catch {
      setSentMessage('Không thể gửi yêu cầu lúc này. Vui lòng thử lại.');
    }
  };

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={`Trình phát video ${video.title}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#141210]/92 p-4 backdrop-blur-xl sm:p-6"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        className="obsidian-darkroom w-full max-w-4xl overflow-hidden rounded-2xl border border-white/15 text-[#FAF7F2] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/12 px-5 py-3.5">
          <div className="flex items-center gap-2 text-xs text-[#D6CEC2]">
            <Film className="h-4 w-4 text-[#E9C46A]" aria-hidden="true" />
            <span>{video.yearCode}</span>
            <span aria-hidden="true">·</span>
            <span className="max-w-[220px] truncate sm:max-w-none">{video.eventTitle}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng trình phát video"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/20 bg-white/8 px-3.5 py-1.5 text-xs hover:bg-white/15"
          >
            <X className="h-4 w-4" />
            <span>Đóng</span>
          </button>
        </div>

        <div ref={playerContainerRef} className="relative bg-black">
          {isDemoVideo ? (
            <div className="relative">
              <ArchivalMediaFrame
                src={video.thumbnailUrl}
                alt={video.title}
                isDemo
                mediaType="video"
                label="Khung phát mẫu DEMO — Hãy tải video thật lên từ Trang quản trị"
                aspectClass="aspect-video"
                className="rounded-none"
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 p-6 text-center">
                <button
                  type="button"
                  onClick={togglePlay}
                  aria-label={isPlaying ? 'Tạm dừng xem trước' : 'Phát mô phỏng khung video'}
                  className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-full bg-[#C83E31] text-white shadow-xl transition-transform hover:scale-105"
                >
                  {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="ml-1 h-6 w-6" />}
                </button>
                <p className="mt-4 max-w-md text-xs text-[#E7E2D8]">
                  Đây là mục video mẫu DEMO để minh họa trình phát video tách biệt khỏi thư viện ảnh. Khi quản trị viên tải lên tệp MP4/MOV thực tế, video sẽ phát trực tiếp tại đây.
                </p>
              </div>
            </div>
          ) : youtubeVideoId ? (
            <iframe
              title={video.title}
              src={`https://www.youtube-nocookie.com/embed/${youtubeVideoId}?rel=0&modestbranding=1&playsinline=1`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="aspect-video w-full border-0"
            />
          ) : transcodeState.status === 'processing' ? (
            <div className="flex aspect-video w-full flex-col items-center justify-center bg-[#171412] p-6 text-center">
              <Loader2 className="h-9 w-9 animate-spin text-[#E9C46A]" aria-hidden="true" />
              <p className="mt-4 text-sm font-semibold text-[#FAF7F2]">
                Đang tối ưu video sang định dạng MP4 chuẩn trình duyệt...
              </p>
              <p className="mt-1.5 max-w-md text-xs leading-relaxed text-[#D6CEC2]">
                Video gốc đang dùng định dạng .MOV / HEVC nên trình duyệt cần bản MP4 để phát mượt trực tiếp. Quá trình này chỉ thực hiện một lần ({transcodeState.progressPct}%).
              </p>
              <div className="mt-4 h-2 w-64 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-[#C83E31] transition-all duration-300"
                  style={{ width: `${Math.max(6, transcodeState.progressPct)}%` }}
                />
              </div>
              <a
                href={video.url}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center rounded-xl border border-white/20 px-4 py-1.5 text-xs text-[#D6CEC2] hover:border-[#E9C46A] hover:text-[#E9C46A]"
              >
                Tải tệp gốc xuống trong lúc chờ
              </a>
            </div>
          ) : videoError ? (
            <div className="flex aspect-video w-full flex-col items-center justify-center bg-[#171412] p-6 text-center">
              <Film className="h-8 w-8 text-[#E9C46A]" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-[#FAF7F2]">
                Trình duyệt không thể phát trực tiếp tệp video này
              </p>
              <p className="mt-1 max-w-md text-xs text-[#D6CEC2]">
                {transcodeState.error ||
                  'Định dạng video hoặc nguồn tệp hiện không tương thích. Bạn có thể tải xuống để xem trên thiết bị hoặc thử đăng lại tệp định dạng MP4/WebM.'}
              </p>
              <a
                href={video.url}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center rounded-xl border border-[#E9C46A] px-5 py-2 text-xs font-semibold text-[#E9C46A] hover:bg-[#E9C46A] hover:text-[#1C1917]"
              >
                Mở hoặc tải video trực tiếp
              </a>
            </div>
          ) : (
            <video
              key={resolvedPlayUrl}
              ref={videoRef}
              src={resolvedPlayUrl || video.url}
              poster={video.thumbnailUrl || undefined}
              preload="metadata"
              playsInline
              onTimeUpdate={() => {
                if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
              }}
              onLoadedMetadata={() => {
                if (videoRef.current) {
                  setDuration(videoRef.current.duration);
                  videoRef.current.volume = volume / 100;
                  videoRef.current.muted = muted;
                }
              }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              onError={() => {
                setIsPlaying(false);
                setVideoError(true);
              }}
              onClick={togglePlay}
              className="aspect-video w-full cursor-pointer bg-black object-contain"
            />
          )}

          {/* Custom Video Controls Bar (shown for HTML5 & demo videos, not YouTube iframe) */}
          {!youtubeVideoId && (
            <div className="flex flex-wrap items-center gap-3 border-t border-white/12 bg-[#1B1714] px-4 py-3">
              <button
                type="button"
                onClick={togglePlay}
                disabled={transcodeState.status === 'processing'}
                aria-label={isPlaying ? 'Tạm dừng video' : 'Phát video'}
                className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-[#C83E31] text-white disabled:opacity-40"
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
              </button>

              <span className="font-mono text-xs text-[#D6CEC2] tabular-nums">
                {formatDuration(currentTime)}
              </span>

              <input
                type="range"
                min={0}
                max={Math.max(duration || video.durationSec || 100, 1)}
                value={currentTime}
                onChange={(e) => handleSeek(Number(e.target.value))}
                aria-label="Tua thời gian video"
                className="h-1.5 flex-1 cursor-pointer accent-[#C83E31]"
              />

              <span className="font-mono text-xs text-[#D6CEC2] tabular-nums">
                {formatDuration(duration || video.durationSec)}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleMute}
                  aria-label={muted ? 'Bật tiếng video' : 'Tắt tiếng video'}
                  className="cursor-pointer p-1 text-[#D6CEC2] hover:text-white"
                >
                  {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={muted ? 0 : volume}
                  onChange={(e) => handleVolume(Number(e.target.value))}
                  aria-label="Âm lượng video"
                  className="h-1 w-20 cursor-pointer accent-[#E9C46A]"
                />
                {!isDemoVideo && transcodeState.status === 'ready' && !videoError && (
                  <button
                    type="button"
                    onClick={handleFullscreen}
                    aria-label="Phóng to toàn màn hình"
                    className="cursor-pointer p-1 text-[#D6CEC2] hover:text-white"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="font-serif text-xl font-medium text-[#FAF7F2]">{video.title}</h3>
            {video.caption && (
              <p className="mt-1 text-sm text-[#D6CEC2]">{video.caption}</p>
            )}
          </div>
          {isAuthorized && !video.isDemo && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {(isAdmin || (user && video.uploadedBy === user.uid)) && (
                confirmDelete ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        void deleteMediaItem(video.id)
                          .then(() => onClose())
                          .catch(() => setSentMessage('Không thể xóa video lúc này.'));
                      }}
                      className="cursor-pointer rounded-xl bg-[#C83E31] px-3.5 py-1.5 text-xs font-medium text-white"
                    >
                      Xác nhận xóa video
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="cursor-pointer rounded-xl border border-white/20 px-3 py-1.5 text-xs text-[#D6CEC2]"
                    >
                      Hủy
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-rose-300/35 px-3.5 py-1.5 text-xs text-rose-200 hover:bg-rose-950/50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Xóa video</span>
                  </button>
                )
              )}
              <button
                type="button"
                onClick={() => setShowRemoval((v) => !v)}
                className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-white/20 px-3.5 py-1.5 text-xs text-[#D6CEC2] hover:border-[#E9C46A]"
              >
                <Flag className="h-3.5 w-3.5" />
                <span>Yêu cầu gỡ video</span>
              </button>
            </div>
          )}
        </div>

        {sentMessage && <p className="px-5 pb-4 text-xs text-[#E9C46A]">{sentMessage}</p>}

        {showRemoval && (
          <form
            onSubmit={(e) => void handleSubmitRemoval(e)}
            className="flex flex-col gap-2 border-t border-white/12 px-5 py-3 sm:flex-row"
          >
            <input
              type="text"
              required
              minLength={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Nêu lý do yêu cầu gỡ video..."
              className="flex-1 rounded-xl border border-white/20 bg-white/8 px-4 py-2 text-xs text-white placeholder:text-[#A8A29E]"
            />
            <button
              type="submit"
              className="cursor-pointer rounded-xl bg-[#E9C46A] px-5 py-2 text-xs font-semibold text-[#1C1917]"
            >
              Gửi yêu cầu
            </button>
          </form>
        )}
      </motion.div>
    </motion.div>
  );
};
