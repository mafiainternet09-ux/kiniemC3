import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowLeftRight, Check, Edit3, Film, Image as ImageIcon, Search, User, X } from 'lucide-react';
import { useArchive } from '../context/ArchiveContext';
import { formatUserFacingError } from '../lib/firebase';
import { stripImageExifGps, uploadBlobToFirebaseStorage } from '../lib/mediaProcessing';
import type { ClassroomSeat, MediaItem } from '../types/memory';
import { normalizeVietnamese } from '../utils/memorySearch';
import { ArchivalMediaFrame } from './ArchivalMediaFrame';

interface ClassroomViewProps {
  initialSeatNumber?: number;
  onOpenImage: (item: MediaItem, list: MediaItem[]) => void;
  onOpenVideo: (item: MediaItem) => void;
}

export const ClassroomView: React.FC<ClassroomViewProps> = ({
  initialSeatNumber,
  onOpenImage,
  onOpenVideo,
}) => {
  const { seats, media, isAdmin, saveSeat, swapSeats, navigate } = useArchive();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState<'all' | 1 | 2>('all');
  const [selectedSeat, setSelectedSeat] = useState<ClassroomSeat | null>(null);
  const consumedInitialSeatRef = useRef<number | undefined>(undefined);

  // Admin inline profile edit state
  const [editingProfile, setEditingProfile] = useState(false);

  // Admin seat swap mode
  const [swapMode, setSwapMode] = useState(false);
  const [swapFirstSeat, setSwapFirstSeat] = useState<number | null>(null);
  const [swapStatus, setSwapStatus] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftNickname, setDraftNickname] = useState('');
  const [draftBio, setDraftBio] = useState('');
  const [draftQuote, setDraftQuote] = useState('');
  const [draftSubject, setDraftSubject] = useState('');
  const [draftAssigned, setDraftAssigned] = useState(true);
  const [draftLinkedIds, setDraftLinkedIds] = useState<string[]>([]);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [draftAvatarUrl, setDraftAvatarUrl] = useState('');
  const [savingSeat, setSavingSeat] = useState(false);
  const [seatError, setSeatError] = useState<string | null>(null);

  const syncSeatDrafts = useCallback((seat: ClassroomSeat) => {
    setDraftName(seat.memberName);
    setDraftNickname(seat.nickname || '');
    setDraftBio(seat.bio || '');
    setDraftQuote(seat.quote || '');
    setDraftSubject(seat.favoriteSubject || '');
    setDraftAssigned(seat.isAssigned);
    setDraftAvatarUrl(seat.avatarUrl || '');
    setDraftLinkedIds(seat.linkedMediaIds || []);
    setSeatError(null);
  }, []);

  const closeSeatModal = useCallback(() => {
    setSelectedSeat(null);
    setEditingProfile(false);
    setSeatError(null);
    if (initialSeatNumber !== undefined) {
      consumedInitialSeatRef.current = undefined;
      navigate({ page: 'classroom' });
    }
  }, [initialSeatNumber, navigate]);

  useEffect(() => {
    if (!selectedSeat || editingProfile) return;
    const latest = seats.find((s) => s.seatId === selectedSeat.seatId);
    if (latest && latest !== selectedSeat) {
      setSelectedSeat(latest);
    }
  }, [seats, selectedSeat, editingProfile]);

  useEffect(() => {
    if (initialSeatNumber === undefined) {
      consumedInitialSeatRef.current = undefined;
      return;
    }
    if (consumedInitialSeatRef.current === initialSeatNumber) return;
    const target = seats.find((s) => s.seatNumber === initialSeatNumber);
    if (target) {
      consumedInitialSeatRef.current = initialSeatNumber;
      setSelectedSeat(target);
      setEditingProfile(false);
      syncSeatDrafts(target);
    }
  }, [initialSeatNumber, seats, syncSeatDrafts]);

  useEffect(() => {
    if (!selectedSeat) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeSeatModal();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedSeat, closeSeatModal]);

  const orderedSeats = useMemo(
    () => [...seats].sort((a, b) => a.seatNumber - b.seatNumber),
    [seats]
  );

  // Dãy 1: Bàn 1(5), Bàn 2(5), Bàn 3(4), Bàn 4(4), Bàn 5(4), Bàn 6(3) = 25
  // Dãy 2: Bàn 1(4), Bàn 2(5), Bàn 3(4), Bàn 4(4), Bàn 5(5), Bàn 6(3) = 25 -> 50 seats
  const deskRows = useMemo(() => {
    const layout: [number, number][] = [
      [5, 4],
      [5, 5],
      [4, 4],
      [4, 4],
      [4, 5],
      [3, 3],
    ];
    const result: { rowNumber: number; aisle1: ClassroomSeat[]; aisle2: ClassroomSeat[] }[] = [];
    let cursor = 0;
    layout.forEach(([c1, c2], idx) => {
      const aisle1 = orderedSeats.slice(cursor, cursor + c1);
      cursor += c1;
      const aisle2 = orderedSeats.slice(cursor, cursor + c2);
      cursor += c2;
      result.push({ rowNumber: idx + 1, aisle1, aisle2 });
    });
    return result;
  }, [orderedSeats]);

  const matchesSearch = (seat: ClassroomSeat) => {
    const q = normalizeVietnamese(searchQuery);
    if (!q) return true;
    const hay = normalizeVietnamese(
      `${seat.seatNumber} vi tri ${seat.seatNumber} ${seat.memberName} ${seat.nickname ?? ''} ${seat.quote ?? ''}`
    );
    return hay.includes(q);
  };

  const openProfile = (seat: ClassroomSeat) => {
    if (swapMode && isAdmin) {
      if (swapFirstSeat === null) {
        setSwapFirstSeat(seat.seatNumber);
        setSwapStatus(`Đã chọn vị trí ${String(seat.seatNumber).padStart(2, '0')}. Hãy nhấn vào vị trí thứ hai để đổi chỗ.`);
      } else if (swapFirstSeat === seat.seatNumber) {
        setSwapFirstSeat(null);
        setSwapStatus(null);
      } else {
        const first = swapFirstSeat;
        setSwapFirstSeat(null);
        setSwapStatus(`Đang đổi vị trí ${first} và ${seat.seatNumber}...`);
        void swapSeats(first, seat.seatNumber)
          .then(() => {
            setSwapStatus(`Đã đổi chỗ ngồi #${first} và #${seat.seatNumber}.`);
          })
          .catch(() => {
            setSwapStatus(`Không thể đổi vị trí #${first} và #${seat.seatNumber}. Vui lòng kiểm tra quyền Firestore.`);
          });
      }
      return;
    }

    setSelectedSeat(seat);
    setEditingProfile(false);
    syncSeatDrafts(seat);
  };

  const handleAvatarUpload = async (file: File) => {
    if (!selectedSeat) return;
    setAvatarUploading(true);
    setSeatError(null);
    try {
      const cleaned = await stripImageExifGps(file);
      const uploaded = await uploadBlobToFirebaseStorage(
        cleaned,
        `c3-memories/avatars/image/${selectedSeat.seatId}-${Date.now()}.jpg`,
        cleaned.type || 'image/jpeg',
        () => {}
      );
      setDraftAvatarUrl(uploaded.url);
    } catch (err) {
      setSeatError(
        err instanceof Error
          ? err.message
          : 'Không thể tải ảnh đại diện lên lúc này. Vui lòng thử lại.'
      );
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSaveSeatProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSeat) return;
    setSavingSeat(true);
    setSeatError(null);
    try {
      const updated: ClassroomSeat = {
        ...selectedSeat,
        memberName: draftName.trim() || `Vị trí ${String(selectedSeat.seatNumber).padStart(2, '0')}`,
        nickname: draftNickname.trim(),
        bio: draftBio.trim(),
        quote: draftQuote.trim(),
        favoriteSubject: draftSubject.trim(),
        avatarUrl: draftAvatarUrl,
        isAssigned: draftAssigned,
        linkedMediaIds: draftLinkedIds.slice(0, 12),
      };
      await saveSeat(updated);
      setSelectedSeat(updated);
      setEditingProfile(false);
    } catch (err) {
      setSeatError(
        formatUserFacingError(err, 'Không thể lưu thông tin vị trí vào Firestore. Vui lòng thử lại.')
      );
    } finally {
      setSavingSeat(false);
    }
  };

  const linkedMedia = useMemo(() => {
    if (!selectedSeat || !selectedSeat.linkedMediaIds?.length) return [];
    const setIds = new Set(selectedSeat.linkedMediaIds);
    return media.filter((m) => setIds.has(m.id) && m.status !== 'removed');
  }, [selectedSeat, media]);

  const assignedCount = orderedSeats.filter((s) => s.isAssigned).length;

  return (
    <main className="pb-20">
      {/* Header Band */}
      <section className="obsidian-darkroom border-b border-white/12 text-[#FAF7F2]">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-6 px-5 py-12 sm:px-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-medium tracking-[0.16em] text-[#E9C46A]">
              Không gian lớp học · Trường THPT Bình Sơn
            </p>
            <h1 className="mt-2 font-serif text-4xl font-semibold sm:text-5xl">
              Phòng học C3 — Sơ đồ 50 thành viên
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#D6CEC2]">
              Nhìn từ trên cao xuống hai dãy bàn quen thuộc (mỗi dãy 6 bàn). Nhấn vào từng vị trí để mở hồ sơ kỷ niệm của thành viên. Hiện đã gán{' '}
              <span className="font-mono font-semibold text-[#E9C46A] tabular-nums">{assignedCount}/50</span> vị trí.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-2.5 left-3.5 h-3.5 w-3.5 text-[#D6CEC2]"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm số ghế hoặc tên..."
                aria-label="Tìm vị trí hoặc thành viên trong phòng học"
                className="w-56 rounded-xl border border-white/20 bg-white/10 py-2 pr-4 pl-9 text-xs text-white placeholder:text-[#A8A29E] focus:border-[#E9C46A] focus:outline-none"
              />
            </div>

            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setSwapMode((v) => !v);
                  setSwapFirstSeat(null);
                  setSwapStatus(null);
                }}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${
                  swapMode
                    ? 'bg-[#E9C46A] text-[#1C1917]'
                    : 'border border-white/20 bg-white/10 text-[#FAF7F2] hover:border-[#E9C46A]'
                }`}
              >
                <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{swapMode ? 'Thoát đổi chỗ' : 'Đổi vị trí ngồi'}</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {swapStatus && (
        <div className="border-b border-[#E5DDD0] bg-[#FEF2F2] px-5 py-2.5 text-center text-xs font-medium text-[#C83E31]">
          {swapStatus}
        </div>
      )}

      {/* Mobile Column Filter */}
      <section className="mx-auto max-w-[1320px] px-5 pt-6 sm:px-8 lg:hidden">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveGroup('all')}
            className={`cursor-pointer rounded-xl px-4 py-1.5 text-xs font-semibold transition-colors ${
              activeGroup === 'all'
                ? 'bg-[#1C1917] text-[#FAF7F2]'
                : 'bg-[#EFE9DE] text-[#57534E]'
            }`}
          >
            Tất cả 50 chỗ
          </button>
          {[1, 2].map((grp) => (
            <button
              key={grp}
              type="button"
              onClick={() => setActiveGroup(grp as 1 | 2)}
              className={`cursor-pointer rounded-xl px-4 py-1.5 text-xs font-semibold transition-colors ${
                activeGroup === grp
                  ? 'bg-[#C83E31] text-[#FAF7F2]'
                  : 'bg-[#EFE9DE] text-[#57534E]'
              }`}
            >
              Dãy {grp}
            </button>
          ))}
        </div>
      </section>

      {/* Top-Down Architectural Classroom Floorplan */}
      <section className="mx-auto max-w-[1320px] px-5 py-10 sm:px-8">
        <div className="editorial-card-shadow rounded-2xl border border-[#E5DDD0] bg-white p-4 sm:p-8">
          {/* Front of Classroom: Authentic Matte Chalkboard + Teacher Podium */}
          <div className="mb-10 flex flex-col items-center gap-4 border-b border-[#EFEAE0] pb-8">
            <div className="w-full max-w-2xl rounded-2xl border-[5px] border-[#8B5E3C] bg-[#1B3A2B] px-6 py-5 text-center text-[#FAF7F2] shadow-lg">
              <p className="font-serif text-xl font-medium tracking-wide sm:text-2xl">
                12C3 · Trường THPT Bình Sơn
              </p>
              <p className="mt-1 text-[11px] text-[#A7F3D0]">
                Bảng xanh phấn trắng · Phía trên bục giảng
              </p>
            </div>
            <div className="grid w-full max-w-5xl grid-cols-3 items-center gap-2 text-xs text-[#57534E]">
              <div aria-hidden="true" />
              <span className="justify-self-center whitespace-nowrap rounded-xl border border-[#D6CEC2] bg-[#F4EFE6] px-5 py-2 font-semibold text-[#1C1917]">
                Bàn Giáo Viên
              </span>
              <span className="justify-self-end whitespace-nowrap rounded-xl border border-[#E5DDD0] bg-white px-3.5 py-1.5 font-medium">
                Cửa ra vào
              </span>
            </div>
          </div>

          {/* 2 Aisles x 6 Desks Each */}
          <div className="space-y-5">
            {deskRows.map(({ rowNumber, aisle1, aisle2 }) => (
              <div
                key={rowNumber}
                className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-10"
              >
                {([
                  { groupNumber: 1 as const, deskSeats: aisle1 },
                  { groupNumber: 2 as const, deskSeats: aisle2 },
                ]).map(({ groupNumber, deskSeats }) => {
                  if (activeGroup !== 'all' && activeGroup !== groupNumber) {
                    return null;
                  }
                  if (deskSeats.length === 0) {
                    return null;
                  }

                  const deskStyle =
                    groupNumber === 1
                      ? 'bg-[#FAF6EE] border-[#E5DDD0]'
                      : 'bg-[#F3F5F8] border-[#DCE2EA]';

                  return (
                    <div
                      key={groupNumber}
                      className={`rounded-2xl border p-3.5 ${deskStyle}`}
                    >
                      <div className="mb-2.5 flex items-center justify-between px-1 font-mono text-[11px] font-medium text-[#57534E]">
                        <span>Dãy {groupNumber}</span>
                        <span>Bàn {rowNumber}</span>
                      </div>
                      <div
                        className={`grid grid-cols-2 gap-2.5 ${
                          deskSeats.length >= 5
                            ? 'md:grid-cols-5'
                            : deskSeats.length === 4
                            ? 'md:grid-cols-4'
                            : 'md:grid-cols-3'
                        }`}
                      >
                        {deskSeats.map((seat) => {
                          const matched = matchesSearch(seat);
                          const isSwapSelected = swapFirstSeat === seat.seatNumber;

                          return (
                            <button
                              key={seat.seatId}
                              type="button"
                              onClick={() => openProfile(seat)}
                              aria-label={`Ghế số ${seat.seatNumber}: ${seat.memberName}`}
                              className={`group flex min-h-[82px] cursor-pointer flex-col justify-between rounded-xl border p-2.5 text-left transition-all duration-150 ${
                                isSwapSelected
                                  ? 'border-[#C83E31] bg-[#FEF2F2] ring-2 ring-[#C83E31]'
                                  : seat.isAssigned
                                  ? 'border-[#DDD5C7] bg-white shadow-xs hover:-translate-y-0.5 hover:border-[#C83E31]'
                                  : 'border-[#E5DDD0] bg-white/75 hover:-translate-y-0.5 hover:border-[#1C1917] hover:bg-white'
                              } ${matched ? 'opacity-100' : 'opacity-25'}`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-mono text-[11px] font-semibold text-[#C83E31] tabular-nums">
                                  #{String(seat.seatNumber).padStart(2, '0')}
                                </span>
                                {seat.avatarUrl ? (
                                  <img
                                    src={seat.avatarUrl}
                                    alt=""
                                    referrerPolicy="no-referrer"
                                    className="h-5 w-5 rounded-full object-cover ring-1 ring-[#D6CEC2]"
                                  />
                                ) : (
                                  <User
                                    className="h-3.5 w-3.5 text-[#A8A29E] transition-colors group-hover:text-[#C83E31]"
                                    aria-hidden="true"
                                  />
                                )}
                              </div>
                              <p className="mt-1.5 line-clamp-2 text-xs font-semibold leading-snug text-[#1C1917]">
                                {seat.memberName}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="mt-8 border-t border-[#EFEAE0] pt-4 text-center text-xs text-[#57534E]">
            Cuối lớp · Bảng tin kỷ niệm &amp; góc tủ đồ 12C3
          </div>
        </div>
      </section>

      {/* Member Profile Modal */}
      <AnimatePresence>
        {selectedSeat && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`Hồ sơ vị trí ${selectedSeat.seatNumber}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#171412]/75 p-4 backdrop-blur-md"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#E5DDD0] bg-[#FAF7F2] shadow-2xl"
            >
              <div className="obsidian-darkroom flex items-center justify-between px-6 py-4 text-[#FAF7F2]">
                <button
                  type="button"
                  onClick={closeSeatModal}
                  className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-[#D6CEC2] hover:text-[#E9C46A]"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Quay lại sơ đồ phòng học</span>
                </button>

                <div className="flex items-center gap-3">
                  {isAdmin && !editingProfile && (
                    <button
                      type="button"
                      onClick={() => {
                        syncSeatDrafts(selectedSeat);
                        setEditingProfile(true);
                      }}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#E9C46A] bg-transparent px-3.5 py-1 text-xs font-medium text-[#E9C46A] transition-colors hover:bg-[#E9C46A] hover:text-[#1C1917]"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      <span>Chỉnh sửa vị trí</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={closeSeatModal}
                    aria-label="Đóng hồ sơ thành viên"
                    className="cursor-pointer rounded-full p-1.5 text-[#D6CEC2] hover:bg-white/10 hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {!editingProfile ? (
                <div className="p-6 sm:p-8">
                  <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
                    <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-[#E5DDD0] bg-white">
                      {selectedSeat.avatarUrl ? (
                        <img
                          src={selectedSeat.avatarUrl}
                          alt={selectedSeat.memberName}
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center font-serif text-3xl font-semibold text-[#C83E31]">
                          {String(selectedSeat.seatNumber).padStart(2, '0')}
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="font-mono text-xs font-semibold text-[#C83E31] tabular-nums">
                        VỊ TRÍ #{String(selectedSeat.seatNumber).padStart(2, '0')} ·{' '}
                        {selectedSeat.isAssigned ? 'Đã gán thành viên' : 'Vị trí mẫu chưa gán tên'}
                      </p>
                      <h2 className="mt-1 font-serif text-3xl font-semibold text-[#1C1917]">
                        {selectedSeat.memberName}
                      </h2>
                      {selectedSeat.nickname && (
                        <p className="mt-0.5 text-sm text-[#57534E]">
                          Biệt danh: {selectedSeat.nickname}
                        </p>
                      )}
                      {selectedSeat.favoriteSubject && (
                        <p className="mt-1 text-xs text-[#57534E]">
                          Môn học yêu thích: {selectedSeat.favoriteSubject}
                        </p>
                      )}
                    </div>
                  </div>

                  {selectedSeat.quote && (
                    <blockquote className="mt-6 rounded-xl border border-[#E5DDD0] bg-white p-5 font-serif text-xl italic text-[#1C1917]">
                      “{selectedSeat.quote}”
                    </blockquote>
                  )}

                  {selectedSeat.bio && (
                    <p className="mt-5 text-sm leading-relaxed text-[#44403C]">
                      {selectedSeat.bio}
                    </p>
                  )}

                  {/* Linked memories */}
                  <div className="mt-8 border-t border-[#E5DDD0] pt-5">
                    <h3 className="font-serif text-xl font-semibold text-[#1C1917]">
                      Kỷ niệm gắn với vị trí #{String(selectedSeat.seatNumber).padStart(2, '0')}
                    </h3>
                    {linkedMedia.length === 0 ? (
                      <p className="mt-2 text-xs text-[#57534E]">
                        Chưa có ảnh hoặc video nào được gắn riêng cho vị trí này. Quản trị viên có thể liên kết ảnh kỷ niệm trong mục Chỉnh sửa.
                      </p>
                    ) : (
                      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {linkedMedia.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              if (item.mediaType === 'video') {
                                onOpenVideo(item);
                              } else {
                                onOpenImage(
                                  item,
                                  linkedMedia.filter((m) => m.mediaType === 'image')
                                );
                              }
                            }}
                            className="group cursor-pointer rounded-xl border border-[#E5DDD0] bg-white p-2.5 text-left transition-all hover:-translate-y-0.5 hover:border-[#C83E31]"
                          >
                            <ArchivalMediaFrame
                              src={item.mediaType === 'video' ? item.thumbnailUrl : item.url}
                              alt={item.title}
                              isDemo={item.isDemo}
                              mediaType={item.mediaType}
                              label={item.title}
                              aspectClass="aspect-[4/3]"
                              className="rounded-lg"
                            />
                            <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-[#1C1917]">
                              {item.mediaType === 'video' ? (
                                <Film className="h-3.5 w-3.5 text-[#B45309]" />
                              ) : (
                                <ImageIcon className="h-3.5 w-3.5 text-[#C83E31]" />
                              )}
                              <span className="truncate">{item.title}</span>
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <form onSubmit={(e) => void handleSaveSeatProfile(e)} className="space-y-4 p-6 sm:p-8">
                  <div className="flex items-center justify-between">
                    <h2 className="font-serif text-2xl font-semibold text-[#1C1917]">
                      Cập nhật vị trí #{String(selectedSeat.seatNumber).padStart(2, '0')}
                    </h2>
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-[#1C1917]">
                      <input
                        type="checkbox"
                        checked={draftAssigned}
                        onChange={(e) => setDraftAssigned(e.target.checked)}
                      />
                      <span>Đánh dấu đã gán thành viên</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-[#1C1917]">Tên thành viên</label>
                      <input
                        type="text"
                        required
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[#D6CEC2] bg-white px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#1C1917]">Biệt danh</label>
                      <input
                        type="text"
                        value={draftNickname}
                        onChange={(e) => setDraftNickname(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[#D6CEC2] bg-white px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-[#1C1917]">Môn học / Dấu ấn</label>
                      <input
                        type="text"
                        value={draftSubject}
                        onChange={(e) => setDraftSubject(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[#D6CEC2] bg-white px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#1C1917]">
                        Ảnh đại diện (tải lên hoặc dán URL)
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handleAvatarUpload(f);
                          e.target.value = '';
                        }}
                        className="mt-1 w-full text-xs"
                      />
                      <input
                        type="url"
                        value={draftAvatarUrl}
                        onChange={(e) => setDraftAvatarUrl(e.target.value)}
                        placeholder="Hoặc dán đường dẫn ảnh..."
                        className="mt-1.5 w-full rounded-xl border border-[#D6CEC2] bg-white px-3 py-1.5 text-xs"
                      />
                      {avatarUploading && (
                        <p className="mt-1 text-[11px] text-[#C83E31]">Đang tải ảnh đại diện...</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#1C1917]">Câu nói / Lưu bút ngắn</label>
                    <input
                      type="text"
                      value={draftQuote}
                      onChange={(e) => setDraftQuote(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-[#D6CEC2] bg-white px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#1C1917]">Giới thiệu ngắn</label>
                    <textarea
                      rows={3}
                      value={draftBio}
                      onChange={(e) => setDraftBio(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-[#D6CEC2] bg-white p-3 text-sm"
                    />
                  </div>

                  <div>
                    <p className="text-xs font-medium text-[#1C1917]">
                      Gắn ảnh/video kỷ niệm liên quan (tối đa 12)
                    </p>
                    <div className="mt-2 max-h-36 space-y-1.5 overflow-y-auto rounded-xl border border-[#E5DDD0] bg-white p-3">
                      {media
                        .filter((m) => m.status !== 'removed')
                        .map((m) => {
                          const checked = draftLinkedIds.includes(m.id);
                          return (
                            <label
                              key={m.id}
                              className="flex cursor-pointer items-center gap-2 text-xs text-[#57534E]"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setDraftLinkedIds((prev) =>
                                      prev.length < 12 ? [...prev, m.id] : prev
                                    );
                                  } else {
                                    setDraftLinkedIds((prev) => prev.filter((id) => id !== m.id));
                                  }
                                }}
                              />
                              <span className="truncate">
                                [{m.yearCode} · {m.mediaType === 'video' ? 'Video' : 'Ảnh'}] {m.title}
                              </span>
                            </label>
                          );
                        })}
                    </div>
                  </div>

                  {seatError && (
                    <p className="text-xs text-[#B91C1C]">{seatError}</p>
                  )}

                  <div className="flex justify-end gap-3 border-t border-[#E5DDD0] pt-4">
                    <button
                      type="button"
                      onClick={() => setEditingProfile(false)}
                      className="cursor-pointer rounded-xl border border-[#D6CEC2] px-5 py-2 text-xs font-medium text-[#57534E]"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      disabled={savingSeat}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#1C1917] px-5 py-2 text-xs font-semibold text-[#FAF7F2] hover:bg-[#C83E31]"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>{savingSeat ? 'Đang lưu...' : 'Lưu thông tin vị trí'}</span>
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
};
