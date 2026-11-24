import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight,
  BookOpen,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Film,
  Lock,
  Play,
  Plus,
  Send,
  Trash2,
  Users,
} from 'lucide-react';
import { useArchive } from '../context/ArchiveContext';
import { YEAR_META } from '../data/seedCatalog';
import type { GuestbookNote, MediaItem, YearCode } from '../types/memory';
import {
  filterAndPaginateGuestbook,
  formatDateDDMMYYYY,
  formatDuration,
  getVisiblePageNumbers,
  GUESTBOOK_CATEGORY_OPTIONS,
  type GuestbookCategoryFilter,
  normalizeTimestampToIso,
  splitMediaByType,
} from '../utils/memorySearch';
import { ArchivalMediaFrame } from './ArchivalMediaFrame';
import { ContributeMediaModal } from './ContributeMediaModal';

interface HomeViewProps {
  onOpenImage: (item: MediaItem, list: MediaItem[]) => void;
  onOpenVideo: (item: MediaItem) => void;
}

const YEAR_CARD_ACCENTS: Record<
  YearCode,
  {
    topRule: string;
    indexNum: string;
    labelColor: string;
    cardHover: string;
    buttonColor: string;
  }
> = {
  '10A3': {
    topRule: 'bg-[#B45309]',
    indexNum: '01.',
    labelColor: 'text-[#B45309]',
    cardHover: 'hover:border-[#B45309]/60',
    buttonColor: 'text-[#B45309] hover:text-[#92400E]',
  },
  '11B3': {
    topRule: 'bg-[#1D4ED8]',
    indexNum: '02.',
    labelColor: 'text-[#1D4ED8]',
    cardHover: 'hover:border-[#1D4ED8]/60',
    buttonColor: 'text-[#1D4ED8] hover:text-[#1E40AF]',
  },
  '12C3': {
    topRule: 'bg-[#C83E31]',
    indexNum: '03.',
    labelColor: 'text-[#C83E31]',
    cardHover: 'hover:border-[#C83E31]/60',
    buttonColor: 'text-[#C83E31] hover:text-[#9F2D22]',
  },
};

export const HomeView: React.FC<HomeViewProps> = ({ onOpenImage, onOpenVideo }) => {
  const {
    siteConfig,
    navigate,
    media,
    events,
    guestbook,
    isAuthorized,
    isAdmin,
    user,
    userRole,
    demoPreviewActive,
    signInWithGoogle,
    addGuestbookNote,
    deleteGuestbookNote,
  } = useArchive();

  const [noteYear, setNoteYear] = useState<GuestbookNote['yearTag']>('12C3');
  const [noteMessage, setNoteMessage] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [showContributeModal, setShowContributeModal] = useState(false);
  const [confirmDeleteNoteId, setConfirmDeleteNoteId] = useState<string | null>(null);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [deleteNoteError, setDeleteNoteError] = useState<string | null>(null);
  const [activeNoteCategory, setActiveNoteCategory] = useState<GuestbookCategoryFilter>('ALL');
  const [notePage, setNotePage] = useState(1);
  const [noteSlideDirection, setNoteSlideDirection] = useState<1 | -1>(1);

  const { images, videos } = useMemo(() => splitMediaByType(media), [media]);

  const featuredImages = useMemo(() => {
    const starred = images.filter((i) => i.featuredOnHome);
    return (starred.length > 0 ? starred : images).slice(0, 4);
  }, [images]);

  const heroCover = useMemo(() => {
    return (
      images.find((i) => !i.isDemo && i.featuredOnHome) ||
      images.find((i) => !i.isDemo) ||
      null
    );
  }, [images]);

  const featuredVideos = useMemo(() => {
    const starred = videos.filter((v) => v.featuredOnHome);
    return (starred.length > 0 ? starred : videos).slice(0, 3);
  }, [videos]);

  const paginatedGuestbook = useMemo(
    () => filterAndPaginateGuestbook(guestbook, activeNoteCategory, notePage, 2),
    [guestbook, activeNoteCategory, notePage]
  );

  const handleSelectNoteCategory = (category: GuestbookCategoryFilter) => {
    if (category === activeNoteCategory) return;
    setNoteSlideDirection(1);
    setActiveNoteCategory(category);
    setNotePage(1);
    setConfirmDeleteNoteId(null);
  };

  const handleChangeNotePage = (nextPage: number) => {
    const clamped = Math.min(Math.max(1, nextPage), paginatedGuestbook.totalPages);
    if (clamped === paginatedGuestbook.currentPage) return;
    setNoteSlideDirection(clamped > paginatedGuestbook.currentPage ? 1 : -1);
    setNotePage(clamped);
    setConfirmDeleteNoteId(null);
  };

  const handleGuestbookSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteMessage.trim() || submittingNote) return;
    setSubmittingNote(true);
    setNoteError(null);
    try {
      await addGuestbookNote(noteYear, noteMessage);
      setNoteMessage('');
      setNoteSlideDirection(-1);
      if (activeNoteCategory !== 'ALL' && activeNoteCategory !== noteYear) {
        setActiveNoteCategory(noteYear);
      }
      setNotePage(1);
    } catch {
      setNoteError('Không thể lưu lời nhắn lúc này. Vui lòng thử lại.');
    } finally {
      setSubmittingNote(false);
    }
  };

  const handleConfirmDeleteNote = async (entryId: string) => {
    if (deletingNoteId) return;
    setDeletingNoteId(entryId);
    setDeleteNoteError(null);
    try {
      await deleteGuestbookNote(entryId);
      setConfirmDeleteNoteId(null);
    } catch {
      setDeleteNoteError('Không thể xóa dòng lưu bút này. Vui lòng thử lại.');
    } finally {
      setDeletingNoteId(null);
    }
  };

  const leadImage = featuredImages[0];
  const secondaryImages = featuredImages.slice(1);

  return (
    <main className="pb-20">
      {/* Privacy status strip for unauthenticated or pending visitors */}
      {!isAuthorized && (
        <div className="border-b border-[#E5DDD0] bg-[#F4EFE6] px-5 py-2.5 text-xs text-[#1C1917]">
          <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-[#C83E31]" aria-hidden="true" />
              <span>
                {user && userRole === 'pending'
                  ? 'Tài khoản của bạn đang chờ Quản trị viên cấp quyền thành viên lớp C3. Hiện bạn đang xem bản mẫu DEMO.'
                  : demoPreviewActive
                  ? 'Không gian lưu trữ riêng tư của C3 — Đang hiển thị khung mẫu DEMO để trải nghiệm giao diện.'
                  : 'Kho lưu trữ ảnh và video của C3 đang được bảo vệ riêng tư.'}
              </span>
            </div>
            {!user && (
              <button
                type="button"
                onClick={() => void signInWithGoogle()}
                className="cursor-pointer font-semibold text-[#C83E31] underline underline-offset-4 transition-colors hover:text-[#1C1917]"
              >
                Đăng nhập bằng tài khoản C3
              </button>
            )}
          </div>
        </div>
      )}

      {/* 1. Editorial Exhibition Hero Split + Full-Width Archival Index Strip */}
      <section className="relative border-b border-[#E5DDD0] bg-[#FAF7F2]">
        <div className="mx-auto grid max-w-[1320px] grid-cols-1 items-stretch gap-10 px-5 py-12 sm:px-8 lg:grid-cols-12 lg:py-16">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col justify-between lg:col-span-6"
          >
            <div>
              <p className="text-xs font-medium tracking-[0.14em] text-[#C83E31]">
                {siteConfig.schoolName} · Niên khóa 10A3 – 11B3 – 12C3
              </p>
              <h1 className="mt-4 font-serif text-4xl font-semibold leading-[1.06] tracking-tight text-[#1C1917] sm:text-5xl lg:text-[3.75rem]">
                {siteConfig.heroTitle}
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-[#57534E]">
                {siteConfig.heroSubtitle}
              </p>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3.5">
              <button
                type="button"
                onClick={() => navigate({ page: 'year', year: '10A3' })}
                className="inline-flex cursor-pointer items-center gap-2.5 rounded-xl bg-[#C83E31] px-6 py-3.5 text-sm font-semibold text-[#FAF7F2] transition-colors duration-200 hover:bg-[#A93125] whitespace-nowrap shrink-0"
              >
                <span>Bắt đầu hành trình 3 năm</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => navigate({ page: 'yearbook' })}
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[#D6CEC2] bg-white px-5 py-3.5 text-sm font-medium text-[#1C1917] transition-colors hover:border-[#1C1917] whitespace-nowrap shrink-0"
              >
                <BookOpen className="h-4 w-4 text-[#C83E31]" aria-hidden="true" />
                <span>Phòng ảnh Kỷ yếu 12C3</span>
              </button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
            className="flex items-stretch lg:col-span-6"
          >
            <figure className="group editorial-card-shadow flex w-full flex-col justify-between rounded-2xl border border-[#E5DDD0] bg-white p-3.5">
              <ArchivalMediaFrame
                src={heroCover?.url || 'plate://hero-courtyard'}
                alt={heroCover?.title || 'Sân trường THPT Bình Sơn và tập thể C3'}
                isDemo={heroCover ? heroCover.isDemo : false}
                label={heroCover?.title || 'Tập thể C3 · Trường THPT Bình Sơn'}
                aspectClass="aspect-[16/10] lg:h-full"
                className="rounded-xl"
              />
              <figcaption className="mt-3 flex items-center justify-between gap-4 px-1 text-xs text-[#57534E]">
                <span className="font-serif italic text-sm text-[#1C1917]">
                  Fig. 01 — {siteConfig.slogan}
                </span>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-[#78716C]">
                  C3 · 50
                </span>
              </figcaption>
            </figure>
          </motion.div>
        </div>

        {/* Full-Width 4-Column Archival Metric Strip */}
        <div className="border-t border-[#E5DDD0] bg-[#F4EFE6]/70">
          <div className="mx-auto grid max-w-[1320px] grid-cols-2 divide-x divide-y divide-[#E5DDD0] sm:grid-cols-4 sm:divide-y-0">
            <div className="px-6 py-5">
              <p className="font-mono text-2xl font-semibold text-[#1C1917] tabular-nums">50</p>
              <p className="mt-1 text-xs text-[#57534E]">Thành viên chung một mái lớp</p>
            </div>
            <div className="px-6 py-5">
              <p className="font-mono text-2xl font-semibold text-[#C83E31] tabular-nums">03</p>
              <p className="mt-1 text-xs text-[#57534E]">Chặng đường 10A3 · 11B3 · 12C3</p>
            </div>
            <div className="px-6 py-5">
              <p className="font-mono text-2xl font-semibold text-[#1C1917] tabular-nums">
                {String(events.length || 18).padStart(2, '0')}
              </p>
              <p className="mt-1 text-xs text-[#57534E]">Không gian sự kiện &amp; kỷ yếu</p>
            </div>
            <div className="px-6 py-5">
              <p className="font-mono text-2xl font-semibold text-[#1C1917] tabular-nums">
                {String(images.length + videos.length).padStart(2, '0')}
              </p>
              <p className="mt-1 text-xs text-[#57534E]">Tư liệu ảnh &amp; thước phim lưu giữ</p>
            </div>
          </div>
        </div>
      </section>

      {/* Subtle Architectural Marquee Section Divider */}
      <div
        aria-hidden="true"
        className="overflow-hidden border-b border-[#E5DDD0] bg-white py-2.5 select-none"
      >
        <div className="animate-archival-marquee flex w-max items-center gap-8 whitespace-nowrap font-mono text-[11px] tracking-[0.22em] text-[#78716C]">
          {[0, 1].map((dup) => (
            <span key={dup} className="flex items-center gap-8">
              <span>10A3 KHỞI ĐẦU</span>
              <span className="text-[#C83E31]">·</span>
              <span>11B3 TRƯỞNG THÀNH</span>
              <span className="text-[#C83E31]">·</span>
              <span>12C3 VĨNH CỬU</span>
              <span className="text-[#C83E31]">·</span>
              <span>50 MẢNH GHÉP THANH XUÂN</span>
              <span className="text-[#C83E31]">·</span>
              <span>TRƯỜNG THPT BÌNH SƠN</span>
              <span className="text-[#C83E31]">·</span>
            </span>
          ))}
        </div>
      </div>

      {/* 2. Asymmetric Editorial Manifesto (Whitespace & Hairlines) */}
      <section className="border-b border-[#E5DDD0] py-16 sm:py-20">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto grid max-w-[1320px] grid-cols-1 gap-10 px-5 sm:px-8 lg:grid-cols-12"
        >
          <div className="lg:col-span-5">
            <p className="text-xs font-semibold text-[#C83E31]">Lời ngỏ tập thể 12C3</p>
            <h2 className="mt-2 font-serif text-3xl font-semibold leading-tight text-[#1C1917] sm:text-4xl">
              Năm mươi người bạn dưới một mái trường
            </h2>
            <p className="mt-5 border-t border-[#E5DDD0] pt-4 font-serif text-xl italic leading-relaxed text-[#57534E]">
              “Có những mùa hạ đi qua rất nhanh, chỉ còn ánh nắng sân trường và tên năm mươi người ở lại mãi.”
            </p>
          </div>

          <div className="flex flex-col justify-between gap-7 lg:col-span-7 lg:pl-8">
            <p className="max-w-prose text-base leading-[1.8] text-[#44403C] first-letter:float-left first-letter:mr-3 first-letter:mt-1 first-letter:font-serif first-letter:text-5xl first-letter:font-bold first-letter:leading-none first-letter:text-[#C83E31]">
              {siteConfig.introStory}
            </p>
            <div className="flex flex-wrap items-center gap-4 border-t border-[#E5DDD0] pt-6">
              <button
                type="button"
                onClick={() => navigate({ page: 'classroom' })}
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#1C1917] px-5 py-3 text-xs font-semibold text-[#FAF7F2] transition-colors hover:bg-[#C83E31]"
              >
                <Users className="h-4 w-4 text-[#E9C46A]" aria-hidden="true" />
                <span>Mở sơ đồ phòng học 50 thành viên</span>
              </button>
              <span className="text-xs text-[#78716C]">
                Nhấn vào từng số ghế #01 – #50 để xem hồ sơ kỷ niệm riêng
              </span>
            </div>
          </div>
        </motion.div>
      </section>

      {/* 3. Three-Chapter Chronological Monograph (10A3 -> 11B3 -> 12C3) */}
      <section className="border-b border-[#E5DDD0] bg-[#F4EFE6]/70 py-16 sm:py-20">
        <div className="mx-auto max-w-[1320px] px-5 sm:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold text-[#C83E31]">Dòng thời gian thanh xuân</p>
              <h2 className="mt-1 font-serif text-3xl font-semibold text-[#1C1917] sm:text-4xl">
                Hành trình từ 10A3 đến 12C3
              </h2>
            </div>
            <p className="max-w-md text-sm text-[#57534E]">
              Chọn một niên khóa để bước vào từng sự kiện, album ảnh và kho thước phim riêng biệt của năm ấy.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-3">
            {(['10A3', '11B3', '12C3'] as YearCode[]).map((code, idx) => {
              const info = YEAR_META[code];
              const accent = YEAR_CARD_ACCENTS[code];
              const yearEventsCount = events.filter((e) => e.yearCode === code).length;
              return (
                <motion.article
                  key={code}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.15 }}
                  transition={{
                    duration: 0.45,
                    delay: idx * 0.08,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className={`group editorial-card-shadow relative flex flex-col justify-between overflow-hidden rounded-2xl border border-[#E5DDD0] bg-white p-5 transition-all duration-200 hover:-translate-y-1 ${accent.cardHover}`}
                >
                  <div className={`absolute inset-x-0 top-0 h-[3px] ${accent.topRule}`} />
                  <div className="pt-1.5">
                    <div className="flex items-center justify-between text-xs text-[#57534E]">
                      <span className={`font-semibold ${accent.labelColor}`}>
                        {accent.indexNum} {info.chapter}
                      </span>
                      <span className="font-mono tabular-nums text-[#78716C]">
                        {yearEventsCount} sự kiện
                      </span>
                    </div>

                    <div className="mt-4 overflow-hidden rounded-xl">
                      <ArchivalMediaFrame
                        src={info.coverPlate}
                        alt={info.subtitle}
                        isDemo={false}
                        label={info.subtitle}
                        aspectClass="aspect-[4/3]"
                        className="rounded-xl"
                      />
                    </div>

                    <h3 className="mt-5 font-serif text-2xl font-semibold text-[#1C1917]">
                      {code} · {info.headline}
                    </h3>
                    <p className="mt-2.5 text-sm leading-relaxed text-[#57534E]">
                      {info.story}
                    </p>
                  </div>

                  <div className="mt-6 flex items-center justify-between border-t border-[#EFEAE0] pt-4">
                    <button
                      type="button"
                      onClick={() => navigate({ page: 'year', year: code })}
                      className={`inline-flex cursor-pointer items-center gap-2 text-xs font-semibold transition-colors ${accent.buttonColor}`}
                    >
                      <span>Mở không gian {code}</span>
                      <ArrowRight
                        className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </button>

                    {code === '12C3' && (
                      <button
                        type="button"
                        onClick={() => navigate({ page: 'yearbook' })}
                        className="cursor-pointer text-xs font-semibold text-[#1C1917] underline underline-offset-4 transition-colors hover:text-[#C83E31]"
                      >
                        Phòng Kỷ yếu
                      </button>
                    )}
                  </div>
                </motion.article>
              );
            })}
          </div>
        </div>
      </section>

      {/* 4. Curated Photo Exhibition (Bento Asymmetric Grid on Warm Paper) */}
      <section className="border-b border-[#E5DDD0] bg-[#FAF7F2] py-16 sm:py-20">
        <div className="mx-auto max-w-[1320px] px-5 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-[#C83E31]">Phòng trưng bày Hình ảnh</p>
              <h2 className="mt-1 font-serif text-3xl font-semibold text-[#1C1917]">
                Khoảnh khắc tĩnh đọng lại qua năm tháng
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              {isAuthorized ? (
                <button
                  type="button"
                  onClick={() => setShowContributeModal(true)}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#C83E31] px-5 py-2.5 text-xs font-semibold text-[#FAF7F2] transition-colors hover:bg-[#A93125]"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Đóng góp ảnh / video</span>
                </button>
              ) : !user ? (
                <button
                  type="button"
                  onClick={() => void signInWithGoogle()}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[#C83E31] bg-white px-5 py-2.5 text-xs font-semibold text-[#C83E31] transition-colors hover:bg-[#C83E31] hover:text-white"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Đăng nhập để đóng góp ảnh / video</span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => navigate({ page: 'yearbook' })}
                className="cursor-pointer text-xs font-semibold text-[#1C1917] underline underline-offset-4 hover:text-[#C83E31]"
              >
                Xem Phòng ảnh Kỷ yếu 12C3
              </button>
            </div>
          </div>

          {featuredImages.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-[#D6CEC2] bg-white p-10 text-center text-sm text-[#57534E]">
              Chưa có hình ảnh nào được đăng tải. Hãy bấm <strong className="text-[#1C1917]">Đóng góp ảnh / video</strong> để lưu lại khoảnh khắc đầu tiên!
            </div>
          ) : featuredImages.length >= 3 && leadImage ? (
            <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Lead Showcase Frame */}
              <motion.button
                type="button"
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                onClick={() => onOpenImage(leadImage, images)}
                className="group editorial-card-shadow flex cursor-pointer flex-col justify-between rounded-2xl border border-[#E5DDD0] bg-white p-4 text-left transition-all duration-200 hover:-translate-y-1 hover:border-[#C83E31]/60 lg:col-span-6"
              >
                <ArchivalMediaFrame
                  src={leadImage.url}
                  alt={leadImage.title}
                  isDemo={leadImage.isDemo}
                  mediaType="image"
                  label={leadImage.title}
                  aspectClass="aspect-[4/3] lg:aspect-[5/4]"
                  className="rounded-xl"
                />
                <div className="mt-4 px-0.5">
                  <p className="text-xs font-medium text-[#78716C]">
                    Fig. 01 · {leadImage.yearCode} · {leadImage.eventTitle}
                  </p>
                  <h3 className="mt-1.5 font-serif text-2xl font-semibold text-[#1C1917]">
                    {leadImage.title}
                  </h3>
                  {leadImage.caption && (
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[#57534E]">
                      {leadImage.caption}
                    </p>
                  )}
                </div>
              </motion.button>

              {/* Secondary Bento Frames */}
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:col-span-6">
                {secondaryImages.map((img, idx) => {
                  const spanWide = secondaryImages.length === 3 && idx === 2;
                  return (
                    <motion.button
                      key={img.id}
                      type="button"
                      initial={{ opacity: 0, y: 14 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.15 }}
                      transition={{
                        duration: 0.45,
                        delay: (idx + 1) * 0.06,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                      onClick={() => onOpenImage(img, images)}
                      className={`group editorial-card-shadow flex cursor-pointer flex-col justify-between rounded-2xl border border-[#E5DDD0] bg-white p-3.5 text-left transition-all duration-200 hover:-translate-y-1 hover:border-[#C83E31]/60 ${
                        spanWide ? 'sm:col-span-2' : ''
                      }`}
                    >
                      <ArchivalMediaFrame
                        src={img.url}
                        alt={img.title}
                        isDemo={img.isDemo}
                        mediaType="image"
                        label={img.title}
                        aspectClass={spanWide ? 'aspect-[16/9]' : 'aspect-[4/3]'}
                        className="rounded-xl"
                      />
                      <div className="mt-3 px-0.5">
                        <p className="text-[11px] font-medium text-[#78716C]">
                          Fig. 0{idx + 2} · {img.yearCode} · {img.eventTitle}
                        </p>
                        <h3 className="mt-1 line-clamp-2 font-serif text-lg font-semibold text-[#1C1917]">
                          {img.title}
                        </h3>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {featuredImages.map((img, idx) => (
                <motion.button
                  key={img.id}
                  type="button"
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.15 }}
                  transition={{ duration: 0.45, delay: idx * 0.06, ease: [0.16, 1, 0.3, 1] }}
                  onClick={() => onOpenImage(img, images)}
                  className="group editorial-card-shadow cursor-pointer rounded-2xl border border-[#E5DDD0] bg-white p-3.5 text-left transition-all duration-200 hover:-translate-y-1 hover:border-[#C83E31]/60"
                >
                  <ArchivalMediaFrame
                    src={img.url}
                    alt={img.title}
                    isDemo={img.isDemo}
                    mediaType="image"
                    label={img.title}
                    aspectClass="aspect-[4/3]"
                    className="rounded-xl"
                  />
                  <div className="mt-3 px-0.5">
                    <p className="text-[11px] font-medium text-[#78716C]">
                      Fig. 0{idx + 1} · {img.yearCode} · {img.eventTitle}
                    </p>
                    <h3 className="mt-1 line-clamp-2 font-serif text-lg font-semibold text-[#1C1917]">
                      {img.title}
                    </h3>
                  </div>
                </motion.button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 5. Obsidian Darkroom Video Screening Room (Strictly Separated) */}
      <section className="obsidian-darkroom border-b border-[#2E2925] py-16 text-[#FAF7F2] sm:py-20">
        <div className="mx-auto max-w-[1320px] px-5 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
            <div>
              <p className="text-xs font-semibold text-[#E9C46A]">Phòng chiếu Video C3</p>
              <h2 className="mt-1 font-serif text-3xl font-semibold text-[#FAF7F2]">
                Những thước phim còn vang mãi tiếng cười
              </h2>
            </div>
            <span className="font-mono text-xs tabular-nums text-[#D6CEC2]">
              {videos.length} thước phim tách biệt khỏi kho ảnh tĩnh
            </span>
          </div>

          {featuredVideos.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-white/20 bg-white/5 p-10 text-center text-sm text-[#D6CEC2]">
              Chưa có video nào được đăng tải. Các thước phim của tập thể C3 sẽ hiển thị tách biệt tại đây.
            </div>
          ) : (
            <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
              {featuredVideos.map((vid, idx) => (
                <motion.button
                  key={vid.id}
                  type="button"
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.15 }}
                  transition={{ duration: 0.45, delay: idx * 0.08, ease: [0.16, 1, 0.3, 1] }}
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
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#C83E31] text-white shadow-lg transition-transform duration-200 group-hover:scale-110">
                        <Play className="ml-0.5 h-5 w-5" aria-hidden="true" />
                      </span>
                    </div>
                    {vid.durationSec ? (
                      <span className="absolute right-2.5 bottom-2.5 rounded-md bg-black/80 px-2 py-0.5 font-mono text-[11px] tabular-nums text-[#FAF7F2]">
                        {formatDuration(vid.durationSec)}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3.5 px-0.5">
                    <p className="flex items-center gap-1.5 text-[11px] text-[#E9C46A]">
                      <Film className="h-3 w-3" aria-hidden="true" />
                      <span>
                        {vid.yearCode} · {vid.eventTitle}
                      </span>
                    </p>
                    <h3 className="mt-1 line-clamp-2 font-serif text-lg font-semibold text-[#FAF7F2]">
                      {vid.title}
                    </h3>
                  </div>
                </motion.button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 6. Archival Stationery Guestbook Section */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto grid max-w-[1320px] grid-cols-1 gap-12 px-5 sm:px-8 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className="text-xs font-semibold text-[#C83E31]">Trang lưu bút C3</p>
            <h2 className="mt-2 font-serif text-3xl font-semibold text-[#1C1917]">
              Lời nhắn gửi lại cho năm tháng sau này
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[#57534E]">
              Mỗi dòng chữ viết hôm nay sẽ là món quà cho chính chúng ta khi mở lại trang web này sau 5 năm, 10 năm nữa.
            </p>

            {isAuthorized ? (
              <form
                onSubmit={(e) => void handleGuestbookSubmit(e)}
                className="editorial-card-shadow mt-6 space-y-3 rounded-2xl border border-[#E5DDD0] bg-white p-5"
              >
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="guestbook-year" className="text-xs font-semibold text-[#1C1917]">
                    Gửi tới chặng đường
                  </label>
                  <select
                    id="guestbook-year"
                    value={noteYear}
                    onChange={(e) => setNoteYear(e.target.value as GuestbookNote['yearTag'])}
                    className="rounded-lg border border-[#D6CEC2] bg-[#FAF7F2] px-3 py-1.5 text-xs font-medium text-[#1C1917]"
                  >
                    <option value="12C3">12C3</option>
                    <option value="11B3">11B3</option>
                    <option value="10A3">10A3</option>
                    <option value="C3">Tập thể C3</option>
                  </select>
                </div>
                <textarea
                  rows={3}
                  required
                  minLength={2}
                  maxLength={600}
                  value={noteMessage}
                  onChange={(e) => setNoteMessage(e.target.value)}
                  placeholder="Viết vài dòng lưu bút gửi 50 thành viên C3..."
                  className="w-full rounded-xl border border-[#D6CEC2] bg-[#FAF7F2] p-3.5 text-sm text-[#1C1917] placeholder:text-[#78716C] focus:border-[#C83E31] focus:outline-none"
                />
                {noteError && (
                  <p className="text-xs text-[#B91C1C]">{noteError}</p>
                )}
                <button
                  type="submit"
                  disabled={submittingNote || noteMessage.trim().length < 2}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#1C1917] px-5 py-2.5 text-xs font-semibold text-[#FAF7F2] transition-colors hover:bg-[#C83E31] disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{submittingNote ? 'Đang lưu...' : 'Gửi lưu bút'}</span>
                </button>
              </form>
            ) : (
              <div className="mt-6 rounded-2xl border border-[#E5DDD0] bg-white p-5 text-xs text-[#57534E]">
                Đăng nhập bằng tài khoản thành viên C3 để viết thêm dòng lưu bút mới.
              </div>
            )}
          </div>

          <div className="space-y-4 lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div
                role="tablist"
                aria-label="Lọc lưu bút theo mục"
                className="flex flex-wrap items-center gap-1 rounded-xl border border-[#E5DDD0] bg-[#EFE9DE] p-1"
              >
                {GUESTBOOK_CATEGORY_OPTIONS.map((tab) => {
                  const isActive = activeNoteCategory === tab.id;
                  const count = paginatedGuestbook.countsByCategory[tab.id];
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => handleSelectNoteCategory(tab.id)}
                      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 transition-all duration-200 ${
                        isActive
                          ? 'bg-white text-[#1C1917] shadow-xs'
                          : 'text-[#57534E] hover:text-[#1C1917]'
                      }`}
                    >
                      <span>{tab.label}</span>
                      <span
                        className={`font-mono text-[11px] tabular-nums ${
                          isActive ? 'text-[#C83E31]' : 'text-[#78716C]'
                        }`}
                      >
                        ({count})
                      </span>
                    </button>
                  );
                })}
              </div>

              {paginatedGuestbook.filteredNotes.length > 0 && (
                <p className="text-xs font-medium text-[#57534E] tabular-nums">
                  Trang {paginatedGuestbook.currentPage} / {paginatedGuestbook.totalPages}
                  <span aria-hidden="true" className="mx-1.5 text-[#D6CEC2]">·</span>
                  <span>{paginatedGuestbook.filteredNotes.length} lưu bút</span>
                </p>
              )}
            </div>

            {deleteNoteError && (
              <p className="rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-2.5 text-xs text-[#991B1B]">
                {deleteNoteError}
              </p>
            )}

            <div className="overflow-hidden py-1">
              <AnimatePresence mode="wait" custom={noteSlideDirection}>
                <motion.div
                  key={`${activeNoteCategory}-${paginatedGuestbook.currentPage}`}
                  custom={noteSlideDirection}
                  initial={{ opacity: 0, x: noteSlideDirection * 32 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: noteSlideDirection * -32 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className="space-y-4"
                >
                  {paginatedGuestbook.pageItems.length === 0 ? (
                    <div className="editorial-card-shadow rounded-2xl border border-dashed border-[#D6CEC2] bg-white p-8 text-center">
                      <p className="font-serif text-lg font-semibold text-[#1C1917]">
                        Chưa có dòng lưu bút nào trong mục này
                      </p>
                      <p className="mt-1.5 text-xs text-[#57534E]">
                        Hãy là người đầu tiên gửi lời nhắn hoặc xem lại tất cả lưu bút của lớp.
                      </p>
                      {activeNoteCategory !== 'ALL' && (
                        <button
                          type="button"
                          onClick={() => handleSelectNoteCategory('ALL')}
                          className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#D6CEC2] bg-[#FAF7F2] px-4 py-2 text-xs font-semibold text-[#1C1917] transition-colors hover:border-[#C83E31] hover:text-[#C83E31]"
                        >
                          <span>Xem tất cả lưu bút</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    paginatedGuestbook.pageItems.map((entry) => {
                      const canDelete =
                        !entry.id.startsWith('demo-') &&
                        (isAdmin || Boolean(user && entry.authorUid === user.uid));
                      const isConfirming = confirmDeleteNoteId === entry.id;
                      const sentDateLabel = formatDateDDMMYYYY(entry.createdAt, entry.id);
                      const sentDateIso = normalizeTimestampToIso(entry.createdAt, entry.id)?.slice(
                        0,
                        10
                      );

                      return (
                        <blockquote
                          key={entry.id}
                          className="editorial-card-shadow rounded-2xl border border-[#E5DDD0] bg-white p-6 transition-transform duration-200 hover:-translate-y-0.5"
                        >
                          <p className="font-serif text-xl italic leading-relaxed text-[#1C1917]">
                            “{entry.message}”
                          </p>
                          <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#EFEAE0] pt-3 text-xs text-[#57534E]">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-[#1C1917]">
                                {entry.authorName}
                              </span>
                              {sentDateLabel && (
                                <>
                                  <span aria-hidden="true" className="text-[#D6CEC2]">·</span>
                                  <time
                                    dateTime={sentDateIso}
                                    className="inline-flex items-center gap-1 text-[11px] text-[#57534E]"
                                  >
                                    <Calendar className="h-3 w-3 text-[#C83E31]" aria-hidden="true" />
                                    <span>
                                      Gửi ngày{' '}
                                      <span className="font-mono tabular-nums">{sentDateLabel}</span>
                                    </span>
                                  </time>
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-medium text-[#C83E31]">
                                Kỷ niệm {entry.yearTag === 'C3' ? 'Tập thể C3' : entry.yearTag}
                              </span>
                              {canDelete &&
                                (isConfirming ? (
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      disabled={deletingNoteId === entry.id}
                                      onClick={() => void handleConfirmDeleteNote(entry.id)}
                                      className="cursor-pointer rounded-lg bg-[#B91C1C] px-3 py-1 text-[11px] font-medium text-white disabled:opacity-50"
                                    >
                                      {deletingNoteId === entry.id
                                        ? 'Đang xóa...'
                                        : 'Xác nhận xóa'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteNoteId(null)}
                                      className="cursor-pointer rounded-lg border border-[#D6CEC2] px-2.5 py-1 text-[11px] text-[#57534E]"
                                    >
                                      Hủy
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteNoteId(entry.id)}
                                    aria-label={`Xóa lưu bút của ${entry.authorName}`}
                                    className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-medium text-[#B91C1C] hover:underline"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                    <span>Xóa lưu bút</span>
                                  </button>
                                ))}
                            </div>
                          </footer>
                        </blockquote>
                      );
                    })
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {paginatedGuestbook.totalPages > 1 && (
              <div className="flex justify-center pt-1">
                <nav
                  aria-label="Chuyển trang lưu bút"
                  className="inline-flex flex-wrap items-center justify-center gap-1.5 rounded-xl border border-[#E5DDD0] bg-white px-3 py-2 shadow-xs"
                >
                  <button
                    type="button"
                    onClick={() => handleChangeNotePage(paginatedGuestbook.currentPage - 1)}
                    disabled={paginatedGuestbook.currentPage <= 1}
                    className="inline-flex min-h-[38px] cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#1C1917] whitespace-nowrap shrink-0 transition-colors hover:bg-[#FAF7F2] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    <span>Trang trước</span>
                  </button>

                  <div className="flex flex-wrap items-center justify-center gap-1">
                    {getVisiblePageNumbers(
                      paginatedGuestbook.currentPage,
                      paginatedGuestbook.totalPages
                    ).map((item, idx) => {
                      if (item === 'ellipsis') {
                        return (
                          <span
                            key={`ellipsis-${idx}`}
                            aria-hidden="true"
                            className="px-1.5 text-xs text-[#78716C]"
                          >
                            …
                          </span>
                        );
                      }
                      const isCurrent = item === paginatedGuestbook.currentPage;
                      return (
                        <button
                          key={item}
                          type="button"
                          aria-label={`Trang lưu bút ${item}`}
                          aria-current={isCurrent ? 'page' : undefined}
                          onClick={() => handleChangeNotePage(item)}
                          className={`inline-flex h-9 min-w-[36px] cursor-pointer items-center justify-center rounded-lg px-2.5 font-mono text-xs font-semibold tabular-nums transition-all ${
                            isCurrent
                              ? 'bg-[#1C1917] text-[#FAF7F2]'
                              : 'border border-[#E5DDD0] bg-[#FAF7F2] text-[#57534E] hover:border-[#C83E31] hover:text-[#1C1917]'
                          }`}
                        >
                          {item}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleChangeNotePage(paginatedGuestbook.currentPage + 1)}
                    disabled={paginatedGuestbook.currentPage >= paginatedGuestbook.totalPages}
                    className="inline-flex min-h-[38px] cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#1C1917] whitespace-nowrap shrink-0 transition-colors hover:bg-[#FAF7F2] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span>Trang sau</span>
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </nav>
              </div>
            )}
          </div>
        </div>
      </section>

      <ContributeMediaModal
        isOpen={showContributeModal}
        onClose={() => setShowContributeModal(false)}
        defaultYear="12C3"
        defaultEventSlug="ky-niem-khac"
      />
    </main>
  );
};
