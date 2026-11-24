import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ChevronLeft, ChevronRight, Film, Image as ImageIcon, Play, Plus } from 'lucide-react';
import { useArchive } from '../context/ArchiveContext';
import type { MediaItem } from '../types/memory';
import { formatDuration, splitMediaByType } from '../utils/memorySearch';
import { ArchivalMediaFrame } from './ArchivalMediaFrame';
import { ContributeMediaModal } from './ContributeMediaModal';

interface YearbookGalleryViewProps {
  onOpenImage: (item: MediaItem, list: MediaItem[]) => void;
  onOpenVideo: (item: MediaItem) => void;
}

export const YearbookGalleryView: React.FC<YearbookGalleryViewProps> = ({
  onOpenImage,
  onOpenVideo,
}) => {
  const { media, navigate, isAuthorized } = useArchive();
  const [activeTab, setActiveTab] = useState<'images' | 'videos'>('images');
  const [slideIdx, setSlideIdx] = useState(0);
  const [showContributeModal, setShowContributeModal] = useState(false);

  const yearbookItems = useMemo(() => {
    const spread = media.filter(
      (m) =>
        m.status !== 'removed' &&
        (m.eventSlug === 'ky-yeu' || (m.yearCode === '12C3' && m.isYearbookSpread))
    );
    if (spread.length > 0) return spread;
    return media.filter((m) => m.yearCode === '12C3' && m.status !== 'removed');
  }, [media]);

  const { images, videos } = useMemo(
    () => splitMediaByType(yearbookItems),
    [yearbookItems]
  );

  const activeSlide = images[slideIdx % Math.max(images.length, 1)];

  return (
    <main className="obsidian-darkroom text-[#FAF7F2]">
      {/* Magazine Editorial Cover */}
      <section className="border-b border-white/12">
        <div className="mx-auto max-w-[1320px] px-5 py-12 sm:px-8 lg:py-16">
          <button
            type="button"
            onClick={() => navigate({ page: 'year', year: '12C3' })}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/20 bg-white/8 px-3.5 py-1.5 text-xs text-[#E7E2D8] transition-colors hover:border-[#E9C46A] hover:text-[#E9C46A]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Trở về không gian 12C3</span>
          </button>

          <div className="mt-6 grid grid-cols-1 items-end gap-10 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <p className="text-xs font-medium tracking-[0.2em] text-[#E9C46A]">
                Ấn bản Kỷ yếu Điện tử · 12C3 THPT Bình Sơn
              </p>
              <h1 className="mt-3 font-serif text-4xl font-semibold leading-[1.06] sm:text-6xl">
                Mùa hạ cuối cùng mang tên C3
              </h1>
              <p className="mt-5 max-w-2xl font-serif text-xl italic leading-relaxed text-[#E7E2D8]">
                “Có những ngày tháng ta cứ nghĩ sẽ còn rất dài, cho đến một buổi chiều đứng dưới hàng phượng đỏ mới nhận ra thanh xuân đẹp nhất là khi được gọi chung tên một lớp.”
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 lg:col-span-5 lg:justify-end">
              <button
                type="button"
                onClick={() => setActiveTab('images')}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'images'
                    ? 'bg-[#E9C46A] text-[#1C1917]'
                    : 'border border-white/20 bg-white/8 text-[#FAF7F2] hover:border-[#E9C46A]'
                }`}
              >
                <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Bộ ảnh Kỷ yếu ({images.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('videos')}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'videos'
                    ? 'bg-[#E9C46A] text-[#1C1917]'
                    : 'border border-white/20 bg-white/8 text-[#FAF7F2] hover:border-[#E9C46A]'
                }`}
              >
                <Film className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Phim Kỷ yếu ({videos.length})</span>
              </button>
              {isAuthorized && (
                <button
                  type="button"
                  onClick={() => setShowContributeModal(true)}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#C83E31] px-4 py-2.5 text-xs font-semibold text-[#FAF7F2] transition-colors hover:bg-[#A93125] whitespace-nowrap shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Đóng góp ảnh / video Kỷ yếu</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {activeTab === 'images' ? (
        <>
          {/* Interactive Editorial Slideshow Spread */}
          {activeSlide && (
            <section className="border-b border-white/12 bg-black/25 py-14">
              <div className="mx-auto grid max-w-[1320px] grid-cols-1 items-center gap-10 px-5 sm:px-8 lg:grid-cols-12">
                <div className="lg:col-span-8">
                  <div className="rounded-2xl border border-white/15 bg-[#211C18] p-3.5 shadow-2xl">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={activeSlide.id}
                        initial={{ opacity: 0, scale: 0.988 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.988 }}
                        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <ArchivalMediaFrame
                          src={activeSlide.url}
                          alt={activeSlide.title}
                          isDemo={activeSlide.isDemo}
                          label={activeSlide.title}
                          aspectClass="aspect-[16/10]"
                          className="rounded-xl"
                        />
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>

                <div className="flex flex-col justify-between gap-6 lg:col-span-4">
                  <div>
                    <p className="font-mono text-xs text-[#E9C46A] tabular-nums">
                      TRANG {String((slideIdx % images.length) + 1).padStart(2, '0')} /{' '}
                      {String(images.length).padStart(2, '0')}
                    </p>
                    <h2 className="mt-3 font-serif text-3xl font-semibold text-[#FAF7F2]">
                      {activeSlide.title}
                    </h2>
                    {activeSlide.caption && (
                      <p className="mt-4 text-sm leading-relaxed text-[#D6CEC2]">
                        {activeSlide.caption}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setSlideIdx((prev) => (prev - 1 + images.length) % images.length)
                      }
                      aria-label="Trang kỷ yếu trước"
                      className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-white/20 bg-white/8 transition-colors hover:border-[#E9C46A]"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSlideIdx((prev) => (prev + 1) % images.length)}
                      aria-label="Trang kỷ yếu tiếp theo"
                      className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-white/20 bg-white/8 transition-colors hover:border-[#E9C46A]"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenImage(activeSlide, images)}
                      className="cursor-pointer rounded-xl border border-[#E9C46A] bg-transparent px-5 py-2.5 text-xs font-semibold text-[#E9C46A] transition-colors hover:bg-[#E9C46A] hover:text-[#1C1917]"
                    >
                      Phóng lớn toàn màn hình
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Stylized Polaroid & Editorial Paper Spread */}
          <section className="archival-paper-bg py-16 text-[#1C1917]">
            <div className="mx-auto max-w-[1320px] px-5 sm:px-8">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold text-[#C83E31]">Tạp chí Polaroid Kỷ yếu</p>
                <h2 className="mt-2 font-serif text-3xl font-semibold text-[#1C1917] sm:text-4xl">
                  Những khung ảnh lưu giữ mãi tuổi mười tám
                </h2>
              </div>

              {images.length === 0 ? (
                <div className="mt-8 rounded-2xl border border-dashed border-[#D6CEC2] bg-white p-10 text-center text-sm text-[#57534E]">
                  Chưa có ảnh kỷ yếu nào được tải lên. Quản trị viên có thể bổ sung bộ ảnh kỷ yếu tại Trang quản trị.
                </div>
              ) : (
                <div className="mt-10 grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3">
                  {images.map((img, i) => {
                    const tilt =
                      i % 3 === 0 ? '-rotate-1' : i % 3 === 1 ? 'rotate-1' : '-rotate-[0.5deg]';
                    return (
                      <motion.button
                        key={img.id}
                        type="button"
                        initial={{ opacity: 0, y: 16 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.1 }}
                        transition={{ duration: 0.4, delay: Math.min(i * 0.05, 0.2) }}
                        onClick={() => onOpenImage(img, images)}
                        className={`group polaroid-shadow cursor-pointer rounded-2xl border border-[#E5DDD0] bg-white p-4 pb-6 text-left transition-all duration-200 hover:rotate-0 hover:-translate-y-1 hover:border-[#C83E31] ${tilt}`}
                      >
                        <ArchivalMediaFrame
                          src={img.url}
                          alt={img.title}
                          isDemo={img.isDemo}
                          label={img.title}
                          aspectClass="aspect-[4/4]"
                          className="rounded-xl"
                        />
                        <div className="mt-4 px-1">
                          <p className="font-mono text-[11px] font-semibold text-[#C83E31] tabular-nums">
                            NO. {String(i + 1).padStart(2, '0')} · 12C3
                          </p>
                          <h3 className="mt-1 font-serif text-xl font-semibold text-[#1C1917]">
                            {img.title}
                          </h3>
                          {img.caption && (
                            <p className="mt-1.5 font-serif text-sm italic text-[#57534E]">
                              {img.caption}
                            </p>
                          )}
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </>
      ) : (
        <section className="mx-auto max-w-[1320px] px-5 py-16 sm:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-medium text-[#E9C46A]">Phim ngắn Kỷ yếu 12C3</p>
            <h2 className="mt-2 font-serif text-3xl font-semibold">
              Những thước phim khép lại ba năm cấp ba
            </h2>
          </div>

          {videos.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-white/20 bg-white/5 p-10 text-center text-sm text-[#D6CEC2]">
              Chưa có phim kỷ yếu nào được tải lên.
            </div>
          ) : (
            <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-2">
              {videos.map((vid) => (
                <button
                  key={vid.id}
                  type="button"
                  onClick={() => onOpenVideo(vid)}
                  className="group cursor-pointer rounded-2xl border border-white/15 bg-[#211C18] p-4 text-left transition-all duration-200 hover:-translate-y-1 hover:border-[#E9C46A]"
                >
                  <div className="relative overflow-hidden rounded-xl">
                    <ArchivalMediaFrame
                      src={vid.thumbnailUrl}
                      alt={vid.title}
                      isDemo={vid.isDemo}
                      mediaType="video"
                      label={vid.title}
                      aspectClass="aspect-video"
                      className="rounded-xl"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors group-hover:bg-black/15">
                      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#C83E31] text-white shadow-lg transition-transform group-hover:scale-110">
                        <Play className="ml-0.5 h-5 w-5" aria-hidden="true" />
                      </span>
                    </div>
                    {vid.durationSec ? (
                      <span className="absolute right-3 bottom-3 rounded-md bg-black/80 px-2 py-0.5 font-mono text-xs tabular-nums">
                        {formatDuration(vid.durationSec)}
                      </span>
                    ) : null}
                  </div>
                  <h3 className="mt-4 font-serif text-2xl font-semibold">{vid.title}</h3>
                  {vid.caption && (
                    <p className="mt-2 text-sm text-[#D6CEC2]">{vid.caption}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>
      )}
      <ContributeMediaModal
        isOpen={showContributeModal}
        onClose={() => setShowContributeModal(false)}
        defaultYear="12C3"
        defaultEventSlug="ky-yeu"
      />
    </main>
  );
};
