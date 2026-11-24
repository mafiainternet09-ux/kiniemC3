import React, { useEffect, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { Leaf } from 'lucide-react';
import { ArchiveProvider, useArchive } from './context/ArchiveContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Navbar } from './components/Navbar';
import { HomeView } from './components/HomeView';
import { YearSpaceView } from './components/YearSpaceView';
import { YearbookGalleryView } from './components/YearbookGalleryView';
import { ClassroomView } from './components/ClassroomView';
import { AdminDashboardView } from './components/AdminDashboardView';
import { LightboxModal } from './components/LightboxModal';
import { VideoPlayerModal } from './components/VideoPlayerModal';
import { MusicPlayerBar } from './components/MusicPlayerBar';
import { AiMemoryChatbox } from './components/AiMemoryChatbox';
import { ContributeMediaModal } from './components/ContributeMediaModal';
import { FallingLeavesOverlay } from './components/FallingLeavesOverlay';
import {
  readLeavesPreference,
  writeLeavesPreference,
} from './utils/fallingLeaves';
import type { MediaItem, YearCode } from './types/memory';

function ArchiveShell() {
  const {
    route,
    isAuthorized,
    siteConfig,
    navigate,
    firestoreError,
    dismissFirestoreError,
    authError,
  } = useArchive();
  const [lightboxState, setLightboxState] = useState<{
    items: MediaItem[];
    index: number;
  } | null>(null);
  const [activeVideo, setActiveVideo] = useState<MediaItem | null>(null);
  const [assistantContribute, setAssistantContribute] = useState<{
    yearCode: YearCode;
    eventSlug: string;
  } | null>(null);
  const [leavesEnabled, setLeavesEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const reduced =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    return readLeavesPreference(window.localStorage, reduced);
  });

  const handleToggleLeaves = () => {
    setLeavesEnabled((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        writeLeavesPreference(next, window.localStorage);
      }
      return next;
    });
  };

  useEffect(() => {
    const onOpenContribute = (e: Event) => {
      if (!isAuthorized) return;
      const detail = (e as CustomEvent<{ yearCode?: YearCode; eventSlug?: string }>).detail;
      setAssistantContribute({
        yearCode: detail?.yearCode || (route.page === 'year' ? route.year : '12C3'),
        eventSlug: detail?.eventSlug || (route.page === 'yearbook' ? 'ky-yeu' : 'ky-niem-khac'),
      });
    };
    window.addEventListener('c3:open-contribute', onOpenContribute);
    return () => window.removeEventListener('c3:open-contribute', onOpenContribute);
  }, [route, isAuthorized]);

  const openImage = (item: MediaItem, list: MediaItem[]) => {
    const imagesOnly = list.filter((m) => m.mediaType === 'image');
    const idx = imagesOnly.findIndex((m) => m.id === item.id);
    setLightboxState({
      items: imagesOnly.length > 0 ? imagesOnly : [item],
      index: idx >= 0 ? idx : 0,
    });
  };

  const viewKey =
    route.page === 'year'
      ? `year-${route.year}-${route.eventSlug || 'all'}`
      : route.page === 'classroom'
      ? 'classroom'
      : route.page;

  return (
    <div className="archival-paper-bg min-h-screen text-[#1C1917]">
      <FallingLeavesOverlay enabled={leavesEnabled} />
      <Navbar
        leavesEnabled={leavesEnabled}
        onToggleLeaves={handleToggleLeaves}
      />

      {(firestoreError || authError) && (
        <div
          role="alert"
          className="border-b border-[#E5C5C2] bg-[#FEF2F2] px-5 py-3 text-xs text-[#991B1B]"
        >
          <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-4">
            <span className="leading-relaxed">{firestoreError || authError}</span>
            {firestoreError && (
              <button
                type="button"
                onClick={dismissFirestoreError}
                className="shrink-0 cursor-pointer rounded-lg border border-[#FCA5A5] bg-white px-3 py-1 text-[11px] font-medium text-[#1C1917] transition-colors hover:bg-[#FEF2F2]"
              >
                Đóng
              </button>
            )}
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={viewKey}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        >
          {route.page === 'home' && (
            <HomeView onOpenImage={openImage} onOpenVideo={setActiveVideo} />
          )}

          {route.page === 'year' && (
            <YearSpaceView
              key={`${route.year}-${route.eventSlug || 'all'}`}
              year={route.year}
              initialEventSlug={route.eventSlug}
              onOpenImage={openImage}
              onOpenVideo={setActiveVideo}
            />
          )}

          {route.page === 'yearbook' && (
            <YearbookGalleryView onOpenImage={openImage} onOpenVideo={setActiveVideo} />
          )}

          {route.page === 'classroom' && (
            <ClassroomView
              initialSeatNumber={route.seatNumber}
              onOpenImage={openImage}
              onOpenVideo={setActiveVideo}
            />
          )}

          {route.page === 'admin' && <AdminDashboardView />}
        </motion.div>
      </AnimatePresence>

      <footer className="border-t border-[#E5DDD0] bg-[#F4EFE6] px-5 py-14 pb-28 sm:px-8">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-serif text-2xl font-bold tracking-tight text-[#1C1917]">
              {siteConfig.siteName}
            </p>
            <p className="mt-1.5 text-xs text-[#57534E]">
              {siteConfig.schoolName} · {siteConfig.slogan}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-medium text-[#57534E]">
            <button
              type="button"
              onClick={() => navigate({ page: 'year', year: '10A3' })}
              className="cursor-pointer transition-colors hover:text-[#B45309] hover:underline underline-offset-4"
            >
              10A3
            </button>
            <button
              type="button"
              onClick={() => navigate({ page: 'year', year: '11B3' })}
              className="cursor-pointer transition-colors hover:text-[#1D4ED8] hover:underline underline-offset-4"
            >
              11B3
            </button>
            <button
              type="button"
              onClick={() => navigate({ page: 'year', year: '12C3' })}
              className="cursor-pointer transition-colors hover:text-[#C83E31] hover:underline underline-offset-4"
            >
              12C3
            </button>
            <button
              type="button"
              onClick={() => navigate({ page: 'yearbook' })}
              className="cursor-pointer transition-colors hover:text-[#C83E31] hover:underline underline-offset-4"
            >
              Kỷ yếu 12C3
            </button>
            <button
              type="button"
              onClick={() => navigate({ page: 'classroom' })}
              className="cursor-pointer transition-colors hover:text-[#1C1917] hover:underline underline-offset-4"
            >
              Phòng học 50 thành viên
            </button>
            <button
              type="button"
              onClick={handleToggleLeaves}
              aria-pressed={leavesEnabled}
              className="inline-flex cursor-pointer items-center gap-1.5 transition-colors hover:text-[#C83E31]"
            >
              <Leaf className="h-3.5 w-3.5 text-[#C83E31]" aria-hidden="true" />
              <span>Lá rơi: {leavesEnabled ? 'Bật' : 'Tắt'}</span>
            </button>
          </div>
        </div>
      </footer>

      <MusicPlayerBar
        leavesEnabled={leavesEnabled}
        onToggleLeaves={handleToggleLeaves}
      />
      <AiMemoryChatbox onOpenImage={openImage} onOpenVideo={setActiveVideo} />

      <AnimatePresence>
        {lightboxState && (
          <LightboxModal
            items={lightboxState.items}
            activeIndex={lightboxState.index}
            onClose={() => setLightboxState(null)}
            onChangeIndex={(nextIdx) =>
              setLightboxState((prev) => (prev ? { ...prev, index: nextIdx } : null))
            }
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeVideo && (
          <VideoPlayerModal video={activeVideo} onClose={() => setActiveVideo(null)} />
        )}
      </AnimatePresence>

      {assistantContribute && (
        <ContributeMediaModal
          isOpen
          onClose={() => setAssistantContribute(null)}
          defaultYear={assistantContribute.yearCode}
          defaultEventSlug={assistantContribute.eventSlug}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ErrorBoundary>
        <ArchiveProvider>
          <ArchiveShell />
        </ArchiveProvider>
      </ErrorBoundary>
    </MotionConfig>
  );
}
