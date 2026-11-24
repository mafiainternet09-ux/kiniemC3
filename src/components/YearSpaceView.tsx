import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, BookOpen, Calendar, Film, Image as ImageIcon, Play, Plus, Search } from 'lucide-react';
import { useArchive } from '../context/ArchiveContext';
import { YEAR_META } from '../data/seedCatalog';
import type { MediaItem, YearCode, YearEvent } from '../types/memory';
import { formatDuration, normalizeVietnamese, splitMediaByType } from '../utils/memorySearch';
import { ArchivalMediaFrame } from './ArchivalMediaFrame';
import { ContributeMediaModal } from './ContributeMediaModal';

interface YearSpaceViewProps {
  year: YearCode;
  initialEventSlug?: string;
  onOpenImage: (item: MediaItem, list: MediaItem[]) => void;
  onOpenVideo: (item: MediaItem) => void;
}

const YEAR_HERO_THEME: Record<YearCode, { bg: string; accentText: string; badgeBg: string }> = {
  '10A3': {
    bg: 'bg-[#241C16]',
    accentText: 'text-[#E9C46A]',
    badgeBg: 'bg-[#E9C46A] text-[#1C1917]',
  },
  '11B3': {
    bg: 'bg-[#142033]',
    accentText: 'text-[#93C5FD]',
    badgeBg: 'bg-[#93C5FD] text-[#142033]',
  },
  '12C3': {
    bg: 'bg-[#261414]',
    accentText: 'text-[#FCA5A5]',
    badgeBg: 'bg-[#C83E31] text-[#FAF7F2]',
  },
};

export const YearSpaceView: React.FC<YearSpaceViewProps> = ({
  year,
  initialEventSlug,
  onOpenImage,
  onOpenVideo,
}) => {
  const { events, media, navigate, isAuthorized } = useArchive();
  const info = YEAR_META[year];
  const heroTheme = YEAR_HERO_THEME[year];

  const yearEvents = useMemo(
    () =>
      events
        .filter((e) => e.yearCode === year)
        .sort((a, b) => a.order - b.order),
    [events, year]
  );

  const [selectedEventSlug, setSelectedEventSlug] = useState<string>(initialEventSlug || 'all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showContributeModal, setShowContributeModal] = useState(false);

  const activeEvent: YearEvent | undefined = useMemo(
    () =>
      selectedEventSlug !== 'all'
        ? yearEvents.find((e) => e.slug === selectedEventSlug)
        : undefined,
    [selectedEventSlug, yearEvents]
  );

  const yearMedia = useMemo(() => {
    const q = normalizeVietnamese(searchTerm);
    return media.filter((m) => {
      if (m.yearCode !== year || m.status === 'removed') return false;
      if (selectedEventSlug !== 'all' && m.eventSlug !== selectedEventSlug) return false;
      if (!q) return true;
      const hay = normalizeVietnamese(
        `${m.title} ${m.caption ?? ''} ${m.eventTitle} ${(m.tags ?? []).join(' ')}`
      );
      return hay.includes(q);
    });
  }, [media, year, selectedEventSlug, searchTerm]);

  const { images, videos } = useMemo(() => splitMediaByType(yearMedia), [yearMedia]);

  return (
    <main>
      {/* Year Chapter Header */}
      <section className={`relative overflow-hidden text-[#FAF7F2] ${heroTheme.bg}`}>
        <div className="mx-auto grid max-w-[1320px] grid-cols-1 items-center gap-10 px-5 py-12 sm:px-8 lg:grid-cols-12 lg:py-16">
          <div className="lg:col-span-7">
            <div className={`flex flex-wrap items-center gap-3 text-xs font-medium ${heroTheme.accentText}`}>
              <span>{info.chapter}</span>
              <span aria-hidden="true">·</span>
              <span>{info.period}</span>
            </div>
            <h1 className="mt-3 font-serif text-4xl font-semibold leading-tight sm:text-5xl">
              {year} — {info.headline}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#E7E2D8]">
              {info.story}
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              {(['10A3', '11B3', '12C3'] as YearCode[]).map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => {
                    setSelectedEventSlug('all');
                    navigate({ page: 'year', year: y });
                  }}
                  className={`cursor-pointer rounded-xl px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    y === year
                      ? `${heroTheme.badgeBg} shadow-sm`
                      : 'border border-white/25 bg-white/8 text-[#FAF7F2] hover:border-white/60 hover:bg-white/15'
                  }`}
                >
                  Năm {y}
                </button>
              ))}

              {year === '12C3' && (
                <button
                  type="button"
                  onClick={() => navigate({ page: 'yearbook' })}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[#E9C46A]/70 bg-transparent px-4 py-2 text-xs font-semibold text-[#E9C46A] transition-colors hover:bg-[#E9C46A] hover:text-[#1C1917] whitespace-nowrap shrink-0"
                >
                  <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Phòng Trưng Bày Kỷ Yếu 12C3</span>
                </button>
              )}

              {isAuthorized && (
                <button
                  type="button"
                  onClick={() => setShowContributeModal(true)}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#C83E31] px-4 py-2 text-xs font-semibold text-[#FAF7F2] transition-colors hover:bg-[#A93125] whitespace-nowrap shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Đóng góp ảnh / video</span>
                </button>
              )}
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="rounded-2xl border border-white/15 bg-white/8 p-3 shadow-2xl">
              <ArchivalMediaFrame
                src={info.coverPlate}
                alt={info.subtitle}
                label={info.subtitle}
                aspectClass="aspect-[4/3]"
                className="rounded-xl"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Activity Milestones Strip (Clean Editorial Hairlines instead of heavy boxes) */}
      <section className="border-b border-[#E5DDD0] bg-white py-12">
        <div className="mx-auto max-w-[1320px] px-5 sm:px-8">
          <h2 className="font-serif text-2xl font-semibold text-[#1C1917]">
            Dòng thời gian hoạt động {year}
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-8 md:grid-cols-3">
            {info.milestones.map((m, idx) => (
              <motion.div
                key={m.title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.4, delay: idx * 0.06 }}
                className="border-t-2 border-[#1C1917]/15 pt-4"
              >
                <p className="font-mono text-xs font-semibold text-[#C83E31] tabular-nums">
                  {String(idx + 1).padStart(2, '0')} · {m.label}
                </p>
                <h3 className="mt-2 font-serif text-xl font-semibold text-[#1C1917]">
                  {m.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#57534E]">{m.detail}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Dedicated Event Directory OR Active Event Cover Banner */}
      <section className="border-b border-[#E5DDD0] bg-[#F4EFE6]/70 py-14">
        <div className="mx-auto max-w-[1320px] px-5 sm:px-8">
          {!activeEvent ? (
            <>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-[#C83E31]">
                    Hệ thống sự kiện năm học {year}
                  </p>
                  <h2 className="mt-1 font-serif text-3xl font-semibold text-[#1C1917]">
                    Từng dịp lễ &amp; hoạt động đáng nhớ
                  </h2>
                </div>
                <span className="font-mono text-xs text-[#57534E] tabular-nums">
                  {yearEvents.length} không gian sự kiện riêng biệt
                </span>
              </div>

              <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {yearEvents.map((ev, idx) => {
                  const evImagesCount = media.filter(
                    (m) => m.yearCode === year && m.eventSlug === ev.slug && m.mediaType === 'image' && m.status !== 'removed'
                  ).length;
                  const evVideosCount = media.filter(
                    (m) => m.yearCode === year && m.eventSlug === ev.slug && m.mediaType === 'video' && m.status !== 'removed'
                  ).length;

                  return (
                    <motion.article
                      key={ev.id}
                      initial={{ opacity: 0, y: 14 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.1 }}
                      transition={{ duration: 0.4, delay: Math.min(idx * 0.05, 0.2) }}
                      className={`group editorial-card-shadow flex flex-col justify-between rounded-2xl border bg-white p-4 transition-all duration-200 hover:-translate-y-1 ${
                        ev.isSpecial
                          ? 'border-[#C83E31]/60'
                          : 'border-[#E5DDD0] hover:border-[#1C1917]/50'
                      }`}
                    >
                      <div>
                        <ArchivalMediaFrame
                          src={ev.coverImageUrl}
                          alt={ev.title}
                          label={ev.title}
                          aspectClass="aspect-[4/3]"
                          className="rounded-xl"
                        />
                        <div className="mt-4 flex items-center justify-between text-xs text-[#57534E]">
                          <span className="inline-flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-[#C83E31]" aria-hidden="true" />
                            <span>{ev.dateLabel}</span>
                          </span>
                          <span className="font-mono tabular-nums text-[#78716C]">
                            {evImagesCount} ảnh · {evVideosCount} video
                          </span>
                        </div>
                        <h3 className="mt-2 font-serif text-xl font-semibold text-[#1C1917]">
                          {ev.title}
                        </h3>
                        <p className="mt-2 text-sm leading-relaxed text-[#57534E]">
                          {ev.summary}
                        </p>
                      </div>

                      <div className="mt-5 flex items-center justify-between border-t border-[#EFEAE0] pt-3">
                        <button
                          type="button"
                          onClick={() => {
                            if (ev.slug === 'ky-yeu') {
                              navigate({ page: 'yearbook' });
                            } else {
                              setSelectedEventSlug(ev.slug);
                            }
                          }}
                          className="cursor-pointer text-xs font-semibold text-[#C83E31] transition-colors hover:text-[#1C1917]"
                        >
                          {ev.slug === 'ky-yeu'
                            ? 'Mở Phòng Kỷ yếu cao cấp'
                            : 'Xem album Ảnh & Video sự kiện'}
                        </button>
                      </div>
                    </motion.article>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="editorial-card-shadow rounded-2xl border border-[#E5DDD0] bg-white p-6 sm:p-8">
              <button
                type="button"
                onClick={() => setSelectedEventSlug('all')}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#D6CEC2] bg-[#FAF7F2] px-3.5 py-1.5 text-xs font-medium text-[#1C1917] transition-colors hover:border-[#C83E31]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Quay lại tất cả sự kiện {year}</span>
              </button>

              <div className="mt-5 grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
                <div className="lg:col-span-5">
                  <ArchivalMediaFrame
                    src={activeEvent.coverImageUrl}
                    alt={activeEvent.title}
                    label={activeEvent.title}
                    aspectClass="aspect-[4/3]"
                    className="rounded-xl"
                  />
                </div>
                <div className="lg:col-span-7">
                  <p className="text-xs font-semibold text-[#C83E31]">{activeEvent.dateLabel}</p>
                  <h2 className="mt-2 font-serif text-3xl font-semibold text-[#1C1917]">
                    {activeEvent.title}
                  </h2>
                  <p className="mt-3 text-base leading-relaxed text-[#57534E]">
                    {activeEvent.summary}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-4 font-mono text-xs font-medium text-[#78716C] tabular-nums">
                    <span>{images.length} hình ảnh</span>
                    <span aria-hidden="true">·</span>
                    <span>{videos.length} thước phim video</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Search & Filter Toolbar */}
      <section className="mx-auto max-w-[1320px] px-5 pt-12 sm:px-8">
        <div className="flex flex-col gap-4 rounded-2xl border border-[#E5DDD0] bg-white p-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedEventSlug('all')}
              className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                selectedEventSlug === 'all'
                  ? 'bg-[#1C1917] text-[#FAF7F2]'
                  : 'bg-[#EFE9DE] text-[#57534E] hover:text-[#1C1917]'
              }`}
            >
              Tất cả sự kiện {year}
            </button>
            {yearEvents.map((ev) => (
              <button
                key={ev.id}
                type="button"
                onClick={() => setSelectedEventSlug(ev.slug)}
                className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  selectedEventSlug === ev.slug
                    ? 'bg-[#C83E31] text-[#FAF7F2]'
                    : 'bg-[#EFE9DE] text-[#57534E] hover:text-[#1C1917]'
                }`}
              >
                {ev.slug === 'hoi-trai'
                  ? 'Hội trại'
                  : ev.slug === 'ky-yeu'
                  ? 'Kỷ yếu'
                  : ev.slug === 'ky-niem-khac'
                  ? 'Kỷ niệm khác'
                  : ev.slug.replace('-', '/')}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute top-2.5 left-3.5 h-3.5 w-3.5 text-[#78716C]"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={`Tìm trong kho ${year}...`}
              aria-label={`Tìm kiếm ảnh hoặc video trong ${year}`}
              className="w-full rounded-lg border border-[#D6CEC2] bg-[#FAF7F2] py-2 pr-4 pl-9 text-xs text-[#1C1917] focus:border-[#C83E31] focus:outline-none"
            />
          </div>
        </div>
      </section>

      {/* SECTION A: IMAGE GALLERY ONLY */}
      <section className="mx-auto max-w-[1320px] px-5 pt-10 pb-16 sm:px-8">
        <div className="flex items-center justify-between border-b border-[#E5DDD0] pb-3">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-[#C83E31]" aria-hidden="true" />
            <h2 className="font-serif text-2xl font-semibold text-[#1C1917]">
              Phòng trưng bày Hình ảnh · {year}
            </h2>
          </div>
          <span className="font-mono text-xs text-[#57534E] tabular-nums">
            {images.length} ảnh
          </span>
        </div>

        {images.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-[#D6CEC2] bg-white p-10 text-center text-sm text-[#57534E]">
            Chưa có hình ảnh nào cho bộ lọc hiện tại. Quản trị viên hoặc thành viên có thể tải thêm ảnh kỷ niệm.
          </div>
        ) : (
          <div className="mt-6 columns-1 gap-5 space-y-5 sm:columns-2 lg:columns-3">
            {images.map((img, idx) => (
              <button
                key={img.id}
                type="button"
                onClick={() => onOpenImage(img, images)}
                className="group editorial-card-shadow block w-full break-inside-avoid cursor-pointer rounded-2xl border border-[#E5DDD0] bg-white p-3.5 text-left transition-all duration-200 hover:-translate-y-1 hover:border-[#C83E31]/60"
              >
                <ArchivalMediaFrame
                  src={img.url}
                  alt={img.title}
                  isDemo={img.isDemo}
                  mediaType="image"
                  label={img.title}
                  aspectClass={idx % 3 === 0 ? 'aspect-[4/5]' : 'aspect-[4/3]'}
                  className="rounded-xl"
                />
                <div className="mt-3 px-0.5">
                  <p className="text-[11px] font-medium text-[#78716C]">{img.eventTitle}</p>
                  <h3 className="mt-1 font-serif text-lg font-semibold text-[#1C1917]">
                    {img.title}
                  </h3>
                  {img.caption && (
                    <p className="mt-1 line-clamp-2 text-xs text-[#57534E]">{img.caption}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* SECTION B: VIDEO GALLERY ONLY (Darkroom Screening Room) */}
      <section className="obsidian-darkroom border-t border-[#2E2925] py-16 text-[#FAF7F2]">
        <div className="mx-auto max-w-[1320px] px-5 sm:px-8">
          <div className="flex items-center justify-between border-b border-white/12 pb-3">
            <div className="flex items-center gap-2">
              <Film className="h-4 w-4 text-[#E9C46A]" aria-hidden="true" />
              <h2 className="font-serif text-2xl font-semibold text-[#FAF7F2]">
                Phòng chiếu Video · {year}
              </h2>
            </div>
            <span className="font-mono text-xs text-[#D6CEC2] tabular-nums">
              {videos.length} video
            </span>
          </div>

          {videos.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-white/20 bg-white/5 p-10 text-center text-sm text-[#D6CEC2]">
              Chưa có video nào cho mục này. Video luôn được lưu tách biệt khỏi phòng ảnh tĩnh.
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {videos.map((vid) => (
                <button
                  key={vid.id}
                  type="button"
                  onClick={() => onOpenVideo(vid)}
                  className="group cursor-pointer rounded-2xl border border-white/12 bg-[#211C18] p-3.5 text-left text-[#FAF7F2] transition-all duration-200 hover:-translate-y-1 hover:border-[#E9C46A]/65"
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
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#C83E31] text-white shadow-lg transition-transform group-hover:scale-110">
                        <Play className="ml-0.5 h-4 w-4" aria-hidden="true" />
                      </span>
                    </div>
                    {vid.durationSec ? (
                      <span className="absolute right-2.5 bottom-2.5 rounded-md bg-black/80 px-2 py-0.5 font-mono text-[11px] tabular-nums">
                        {formatDuration(vid.durationSec)}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 px-0.5">
                    <p className="text-[11px] text-[#E9C46A]">{vid.eventTitle}</p>
                    <h3 className="mt-1 font-serif text-lg font-semibold text-[#FAF7F2]">
                      {vid.title}
                    </h3>
                    {vid.caption && (
                      <p className="mt-1 line-clamp-2 text-xs text-[#D6CEC2]">{vid.caption}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <ContributeMediaModal
        isOpen={showContributeModal}
        onClose={() => setShowContributeModal(false)}
        defaultYear={year}
        defaultEventSlug={selectedEventSlug !== 'all' ? selectedEventSlug : 'ky-niem-khac'}
      />
    </main>
  );
};
