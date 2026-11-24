import React, { useEffect, useRef, useState } from 'react';
import {
  Disc3,
  ExternalLink,
  Leaf,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useArchive } from '../context/ArchiveContext';
import type { MusicCommand } from '../types/memory';
import { formatDuration } from '../utils/memorySearch';

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: string | HTMLElement,
        opts: {
          videoId: string;
          host?: string;
          height?: string | number;
          width?: string | number;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (e: { target: YTPlayerInstance }) => void;
            onStateChange?: (e: { data: number }) => void;
            onError?: () => void;
          };
        }
      ) => YTPlayerInstance;
      PlayerState?: {
        PLAYING: number;
        PAUSED: number;
        ENDED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YTPlayerInstance {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume: (vol: number) => void;
  mute: () => void;
  unMute: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  destroy: () => void;
}

interface MusicPlayerBarProps {
  leavesEnabled?: boolean;
  onToggleLeaves?: () => void;
}

export const MusicPlayerBar: React.FC<MusicPlayerBarProps> = ({
  leavesEnabled = true,
  onToggleLeaves,
}) => {
  const { siteConfig } = useArchive();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayerInstance | null>(null);
  const pendingPlayRef = useRef(false);

  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasUserStarted, setHasUserStarted] = useState(false);
  const [embedBlocked, setEmbedBlocked] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [volume, setVolume] = useState(65);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(258); // 04:18 default official track length

  const videoId = siteConfig.musicYoutubeId || 'GgQFO8dL5XQ';

  useEffect(() => {
    let cancelled = false;
    setIsReady(false);
    setIsPlaying(false);
    setEmbedBlocked(false);

    const mountPlayer = () => {
      if (cancelled || !hostRef.current || !window.YT?.Player) return;
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // ignore
        }
      }

      playerRef.current = new window.YT.Player(hostRef.current, {
        videoId,
        host: 'https://www.youtube-nocookie.com',
        width: '280',
        height: '158',
        playerVars: {
          autoplay: 0,
          controls: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (e) => {
            if (cancelled) return;
            setIsReady(true);
            setEmbedBlocked(false);
            e.target.setVolume(volume);
            const d = e.target.getDuration();
            if (d > 0) setDuration(d);
            if (pendingPlayRef.current) {
              pendingPlayRef.current = false;
              e.target.playVideo();
            }
          },
          onStateChange: (e) => {
            if (cancelled) return;
            if (e.data === 1) {
              setIsPlaying(true);
            } else if (e.data === 2 || e.data === 0) {
              setIsPlaying(false);
            }
          },
          onError: () => {
            if (!cancelled) {
              pendingPlayRef.current = false;
              setIsPlaying(false);
              setEmbedBlocked(true);
            }
          },
        },
      });
    };

    if (window.YT?.Player) {
      mountPlayer();
    } else {
      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prevCallback?.();
        mountPlayer();
      };
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        tag.async = true;
        tag.onerror = () => {
          pendingPlayRef.current = false;
          setEmbedBlocked(true);
        };
        document.head.appendChild(tag);
      }
    }

    return () => {
      cancelled = true;
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // ignore
        }
        playerRef.current = null;
      }
    };
  }, [videoId]);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => {
      if (playerRef.current) {
        try {
          const cur = playerRef.current.getCurrentTime();
          const dur = playerRef.current.getDuration();
          if (Number.isFinite(cur)) setCurrentTime(cur);
          if (Number.isFinite(dur) && dur > 0) setDuration(dur);
        } catch {
          // ignore
        }
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [isPlaying]);

  const togglePlay = () => {
    setHasUserStarted(true);
    if (embedBlocked) {
      setExpanded(true);
      return;
    }
    if (!playerRef.current || !isReady) {
      pendingPlayRef.current = !pendingPlayRef.current;
      return;
    }
    if (isPlaying) {
      playerRef.current.pauseVideo();
      setIsPlaying(false);
    } else {
      playerRef.current.playVideo();
      setIsPlaying(true);
    }
  };

  const handleVolumeChange = (val: number) => {
    setVolume(val);
    setMuted(val === 0);
    if (playerRef.current && isReady) {
      playerRef.current.setVolume(val);
      if (val === 0) playerRef.current.mute();
      else playerRef.current.unMute();
    }
  };

  const toggleMute = () => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    if (playerRef.current && isReady) {
      if (nextMuted) playerRef.current.mute();
      else {
        playerRef.current.unMute();
        playerRef.current.setVolume(volume || 60);
      }
    }
  };

  const handleSeek = (val: number) => {
    setCurrentTime(val);
    if (playerRef.current && isReady) {
      playerRef.current.seekTo(val, true);
    }
  };

  const commandHandlerRef = useRef<(cmd: MusicCommand) => void>(() => {});
  commandHandlerRef.current = (cmd: MusicCommand) => {
    if (cmd === 'play') {
      setHasUserStarted(true);
      if (embedBlocked) {
        setExpanded(true);
        return;
      }
      if (!playerRef.current || !isReady) {
        pendingPlayRef.current = true;
        return;
      }
      playerRef.current.playVideo();
      setIsPlaying(true);
    } else if (cmd === 'pause') {
      pendingPlayRef.current = false;
      if (playerRef.current && isReady) {
        playerRef.current.pauseVideo();
      }
      setIsPlaying(false);
    } else if (cmd === 'mute') {
      setMuted(true);
      if (playerRef.current && isReady) playerRef.current.mute();
    } else if (cmd === 'unmute') {
      setMuted(false);
      if (playerRef.current && isReady) {
        playerRef.current.unMute();
        playerRef.current.setVolume(volume || 60);
      }
    } else if (cmd === 'expand') {
      setExpanded(true);
    } else if (cmd === 'collapse') {
      setExpanded(false);
    }
  };

  useEffect(() => {
    const onMusicControl = (e: Event) => {
      const detail = (e as CustomEvent<{ command?: MusicCommand }>).detail;
      if (detail?.command) {
        commandHandlerRef.current(detail.command);
      }
    };
    window.addEventListener('c3:music-control', onMusicControl);
    return () => window.removeEventListener('c3:music-control', onMusicControl);
  }, []);

  const statusLabel = embedBlocked
    ? 'Mở YouTube'
    : isPlaying
    ? 'Đang phát'
    : hasUserStarted
    ? 'Tạm dừng'
    : 'Nhạc nền';

  return (
    <aside
      aria-label="Trình phát nhạc nền Thanh Xuân và hiệu ứng lá rơi"
      className="fixed bottom-3 left-3 z-30 flex items-center gap-2 max-w-[calc(100vw-11rem)] sm:bottom-4 sm:left-4 sm:max-w-md"
    >
      {/* Keep YouTube IFrame persistently mounted at real size so browsers do not throttle playback */}
      <div
        className={`overflow-hidden rounded-xl border border-[#C83E31]/35 bg-[#171412]/95 shadow-xl backdrop-blur-md transition-opacity ${
          expanded
            ? 'fixed bottom-14 left-3 w-[280px] p-2 opacity-100 sm:bottom-16 sm:left-4'
            : 'pointer-events-none fixed -left-[9999px] top-0 h-[158px] w-[280px] opacity-0'
        }`}
      >
        <div className="overflow-hidden rounded-lg">
          <div ref={hostRef} />
        </div>
        {expanded && (
          <div className="mt-2 space-y-1.5 px-1 text-[#FAF7F2]">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-[#E5DDD0] tabular-nums">
                {formatDuration(currentTime)}
              </span>
              <input
                type="range"
                min={0}
                max={Math.max(duration, 1)}
                value={Math.min(currentTime, duration)}
                onChange={(e) => handleSeek(Number(e.target.value))}
                aria-label="Thanh tiến trình bài hát Thanh Xuân"
                className="h-1 flex-1 cursor-pointer accent-[#C83E31]"
              />
              <span className="font-mono text-[10px] text-[#E5DDD0] tabular-nums">
                {formatDuration(duration)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-[10px] text-[#D6CEC2]">
              <span>{statusLabel}</span>
              <div className="flex items-center gap-1.5">
                <Volume2 className="h-3 w-3" aria-hidden="true" />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={muted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(Number(e.target.value))}
                  aria-label="Âm lượng nhạc nền"
                  className="h-1 w-16 cursor-pointer accent-[#E9C46A]"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Minimalist transparent music bar */}
      <div className="flex min-w-0 items-center gap-2 rounded-full border border-[#1C1917]/20 bg-transparent px-2.5 py-1.5 backdrop-blur-md transition-colors hover:border-[#C83E31]/60">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? 'Tạm dừng bài hát Thanh Xuân' : 'Phát bài hát Thanh Xuân'}
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[#C83E31]/60 bg-transparent text-[#C83E31] transition-transform hover:scale-105 hover:bg-[#C83E31]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C83E31]"
        >
          {isPlaying ? (
            <Pause className="h-3.5 w-3.5" />
          ) : (
            <Play className="ml-0.5 h-3.5 w-3.5" />
          )}
        </button>

        <div className="min-w-0 flex-1 pr-0.5">
          <p className="flex items-center gap-1.5 truncate text-[11px] font-semibold text-[#1C1917] [text-shadow:0_1px_10px_rgba(250,247,242,0.96)]">
            <Disc3
              className={`h-3 w-3 shrink-0 text-[#C83E31] ${
                isPlaying && !embedBlocked ? 'animate-spin' : ''
              }`}
              aria-hidden="true"
            />
            <span className="truncate">{siteConfig.musicTitle}</span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? 'Bật âm thanh nhạc nền' : 'Tắt tiếng nhạc nền'}
            className="cursor-pointer rounded-full p-1 text-[#57534E] transition-colors hover:text-[#C83E31] [filter:drop-shadow(0_1px_4px_rgba(250,247,242,0.9))]"
          >
            {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? 'Thu gọn khung phát chính thức' : 'Mở khung phát chính thức'}
            className="cursor-pointer rounded-full p-1 text-[#57534E] transition-colors hover:text-[#C83E31] [filter:drop-shadow(0_1px_4px_rgba(250,247,242,0.9))]"
          >
            {expanded ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
          <a
            href={`https://www.youtube.com/watch?v=${videoId}`}
            target="_blank"
            rel="noreferrer"
            aria-label="Mở bài hát Thanh Xuân – Da LAB trên nguồn chính thức YouTube"
            className="hidden sm:inline-flex rounded-full p-1 text-[#57534E] transition-colors hover:text-[#C83E31] [filter:drop-shadow(0_1px_4px_rgba(250,247,242,0.9))]"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* Minimalist transparent Falling Leaves toggle */}
      {onToggleLeaves && (
        <button
          type="button"
          onClick={onToggleLeaves}
          aria-pressed={leavesEnabled}
          aria-label={leavesEnabled ? 'Tắt hiệu ứng lá rơi' : 'Bật hiệu ứng lá rơi'}
          title={leavesEnabled ? 'Đang bật lá rơi · Nhấn để tắt' : 'Đang tắt lá rơi · Nhấn để bật'}
          className={`hidden sm:inline-flex h-[38px] cursor-pointer items-center gap-1.5 rounded-full border bg-transparent px-3 text-[11px] font-medium backdrop-blur-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C83E31] ${
            leavesEnabled
              ? 'border-[#C83E31]/55 text-[#C83E31] hover:border-[#C83E31] [text-shadow:0_1px_10px_rgba(250,247,242,0.96)]'
              : 'border-[#1C1917]/20 text-[#57534E] hover:border-[#1C1917]/45 hover:text-[#1C1917] [text-shadow:0_1px_10px_rgba(250,247,242,0.96)]'
          }`}
        >
          <Leaf
            className={`h-3.5 w-3.5 transition-transform duration-300 ${
              leavesEnabled ? 'text-[#C83E31] rotate-0' : 'text-[#78716C] -rotate-12'
            }`}
            aria-hidden="true"
          />
          <span>Lá rơi</span>
        </button>
      )}
    </aside>
  );
};
