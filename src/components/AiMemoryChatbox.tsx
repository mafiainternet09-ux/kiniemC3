import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Film,
  Image as ImageIcon,
  MessageSquareText,
  RotateCcw,
  Send,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import { useArchive } from '../context/ArchiveContext';
import type {
  AssistantChatResponse,
  AssistantChatTurn,
  ClassroomSeat,
  MediaItem,
} from '../types/memory';
import { runLocalAssistantFallback } from '../utils/assistantAgent';
import { formatDuration } from '../utils/memorySearch';
import { ArchivalMediaFrame } from './ArchivalMediaFrame';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  matches?: MediaItem[];
  seats?: ClassroomSeat[];
  apiNotice?: string;
}

interface AiMemoryChatboxProps {
  onOpenImage: (item: MediaItem, list: MediaItem[]) => void;
  onOpenVideo: (item: MediaItem) => void;
}

const SAMPLE_PROMPTS = [
  'Tìm giúp mình ảnh hội trại năm lớp 10.',
  'Có video nào về ngày 20/11 năm lớp 11 không?',
  'Cho mình xem những bức ảnh kỷ yếu 12C3.',
  'Lớp mình hiện có bao nhiêu ảnh và video?',
];

const INITIAL_WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  sender: 'assistant',
  text: 'Chào bạn của C3! Mình là bạn đồng hành trong kho ký ức 10A3 – 11B3 – 12C3. Bạn có thể trò chuyện với mình hoặc nhờ tìm ảnh, video, thông tin sự kiện và vị trí trong phòng học 50 chỗ nhé!',
};

export const AiMemoryChatbox: React.FC<AiMemoryChatboxProps> = ({
  onOpenImage,
  onOpenVideo,
}) => {
  const {
    media,
    events,
    seats,
    guestbook,
    siteConfig,
    user,
    userRole,
    route,
    isAuthorized,
    demoPreviewActive,
    navigate,
  } = useArchive();

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_WELCOME_MESSAGE]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const canAccessArchive = isAuthorized || demoPreviewActive;

  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, loading, open]);

  const sendMessage = async (queryText: string) => {
    const trimmed = queryText.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: trimmed,
    };

    const historyPayload: AssistantChatTurn[] = messages
      .filter((m) => m.id !== 'welcome')
      .slice(-6)
      .map((m) => ({
        role: m.sender,
        text: m.text,
      }));

    setMessages((prev) => [...prev, userMsg]);
    setInput('');

    if (!canAccessArchive) {
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          sender: 'assistant',
          text: 'Kho lưu trữ C3 đang ở chế độ riêng tư. Bạn vui lòng đăng nhập bằng tài khoản thành viên C3 để trò chuyện và tìm kiếm kỷ niệm nhé.',
        },
      ]);
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    const fetchTimer = window.setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          message: trimmed,
          history: historyPayload,
          catalog: media,
          events,
          seats,
          guestbook,
          siteConfig,
          userName: user?.displayName || 'Bạn lớp C3',
          userRole,
          currentRoute: route,
        }),
      });

      if (!response.ok) {
        throw new Error('Chat request failed');
      }

      const data = (await response.json()) as AssistantChatResponse;
      const matches = Array.isArray(data.matches) ? data.matches : [];
      const matchedSeats = Array.isArray(data.seats) ? data.seats : [];

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          sender: 'assistant',
          text: data.reply || 'Mình đã tìm giúp bạn rồi nè!',
          matches,
          seats: matchedSeats,
          apiNotice: data.apiNotice,
        },
      ]);
    } catch {
      const fallback = runLocalAssistantFallback(
        trimmed,
        {
          siteConfig,
          userName: user?.displayName || undefined,
          userRole,
          currentRoute: route,
          catalog: media,
          events,
          seats,
          guestbook,
        },
        'Không kết nối được tới máy chủ AI lúc này; trợ lý đang trò chuyện & tìm kiếm trực tiếp trên trình duyệt.'
      );

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          sender: 'assistant',
          text: fallback.reply,
          matches: fallback.matches,
          seats: fallback.seats,
          apiNotice: fallback.apiNotice,
        },
      ]);
    } finally {
      window.clearTimeout(fetchTimer);
      setLoading(false);
    }
  };

  const handleResultClick = (item: MediaItem, allMatches: MediaItem[]) => {
    if (item.mediaType === 'video') {
      onOpenVideo(item);
    } else {
      const imageMatches = allMatches.filter((m) => m.mediaType === 'image');
      onOpenImage(item, imageMatches.length > 0 ? imageMatches : [item]);
    }
  };

  return (
    <div
      className={`fixed bottom-3 right-3 sm:bottom-4 sm:right-4 ${
        open ? 'z-40' : 'z-30'
      }`}
    >
      <AnimatePresence mode="wait">
        {!open ? (
          <motion.button
            key="chat-fab"
            type="button"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            onClick={() => setOpen(true)}
            aria-label="Mở Trợ lý AI tìm kiếm kỷ niệm C3"
            className="inline-flex cursor-pointer items-center gap-2 rounded-full border-[1.5px] border-[#C83E31]/70 bg-transparent px-4 py-2 text-xs font-semibold text-[#1C1917] backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-[#C83E31] hover:bg-[#FAF7F2]/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C83E31] sm:px-4.5 sm:py-2.5"
          >
            <MessageSquareText
              className="h-4 w-4 text-[#C83E31] [filter:drop-shadow(0_1px_6px_rgba(250,247,242,0.92))]"
              aria-hidden="true"
            />
            <span className="whitespace-nowrap [text-shadow:0_1px_10px_rgba(250,247,242,0.96)]">
              Trợ lý Ký ức
            </span>
          </motion.button>
        ) : (
          <motion.section
            key="chat-panel"
            aria-label="Trợ lý tìm kiếm kỷ niệm AI"
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="flex h-[540px] max-h-[82vh] w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl border-[1.5px] border-[#C83E31]/40 bg-[#FAF7F2]/80 shadow-xl shadow-stone-900/15 backdrop-blur-xl sm:w-[420px]"
          >
            <div className="flex items-center justify-between border-b border-[#E5DDD0] bg-transparent px-5 py-3.5 text-[#1C1917]">
              <div className="flex items-center gap-2.5">
                <Sparkles className="h-4 w-4 text-[#C83E31]" aria-hidden="true" />
                <div>
                  <h2 className="font-serif text-base font-semibold leading-tight text-[#1C1917]">
                    Trợ lý Ký ức C3
                  </h2>
                  <p className="text-[11px] text-[#57534E]">
                    Trò chuyện &amp; tìm kiếm thông tin C3
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {messages.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setMessages([INITIAL_WELCOME_MESSAGE])}
                    aria-label="Bắt đầu cuộc trò chuyện mới"
                    title="Cuộc trò chuyện mới"
                    className="cursor-pointer rounded-full border border-transparent p-1.5 text-[#57534E] hover:border-[#C83E31]/35 hover:text-[#1C1917]"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Đóng Trợ lý Ký ức"
                  className="cursor-pointer rounded-full border border-transparent p-1.5 text-[#57534E] hover:border-[#C83E31]/35 hover:text-[#1C1917]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3.5">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={
                    msg.sender === 'user'
                      ? 'ml-8 rounded-2xl rounded-br-xs border border-[#1C1917]/20 bg-[#1C1917]/8 px-4 py-2.5 text-xs leading-relaxed text-[#1C1917] backdrop-blur-sm'
                      : 'mr-4 rounded-2xl rounded-bl-xs border border-[#E5DDD0] bg-white/75 px-4 py-2.5 text-xs leading-relaxed text-[#1C1917] backdrop-blur-sm'
                  }
                >
                  <p className="whitespace-pre-line">{msg.text}</p>

                  {msg.seats && msg.seats.length > 0 && (
                    <div className="mt-2.5 space-y-1.5 border-t border-[#EFEAE0] pt-2">
                      {msg.seats.map((seat) => (
                        <button
                          key={seat.seatId}
                          type="button"
                          onClick={() =>
                            navigate({ page: 'classroom', seatNumber: seat.seatNumber })
                          }
                          className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-[#E5DDD0] bg-[#FAF7F2] px-2.5 py-2 text-left transition-colors hover:border-[#C83E31]"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#1C1917] font-mono text-[10px] font-semibold text-[#FAF7F2]">
                              #{String(seat.seatNumber).padStart(2, '0')}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-[#1C1917]">
                                {seat.memberName}
                                {seat.nickname ? ` (${seat.nickname})` : ''}
                              </p>
                              <p className="truncate text-[10px] text-[#57534E]">
                                Bàn {seat.row} · Nhấn để mở hồ sơ
                              </p>
                            </div>
                          </div>
                          <User className="h-3.5 w-3.5 shrink-0 text-[#C83E31]" aria-hidden="true" />
                        </button>
                      ))}
                    </div>
                  )}

                  {msg.matches && msg.matches.length > 0 && (
                    <div className="mt-3 space-y-2 border-t border-[#EFEAE0] pt-2.5">
                      {msg.matches.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-2.5 rounded-xl border border-[#E5DDD0] bg-[#FAF7F2] p-2 transition-colors hover:border-[#C83E31]"
                        >
                          <button
                            type="button"
                            onClick={() => handleResultClick(item, msg.matches || [])}
                            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left"
                          >
                            <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg">
                              <ArchivalMediaFrame
                                src={item.mediaType === 'video' ? item.thumbnailUrl : item.url}
                                alt={item.title}
                                isDemo={item.isDemo}
                                mediaType={item.mediaType}
                                aspectClass="h-full w-full"
                                className="rounded-lg"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold text-[#1C1917]">
                                {item.title}
                              </p>
                              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[#57534E]">
                                {item.mediaType === 'video' ? (
                                  <Film className="h-3 w-3 text-[#B45309]" aria-hidden="true" />
                                ) : (
                                  <ImageIcon className="h-3 w-3 text-[#C83E31]" aria-hidden="true" />
                                )}
                                <span>
                                  {item.yearCode} · {item.eventTitle}
                                  {item.mediaType === 'video' && item.durationSec
                                    ? ` · ${formatDuration(item.durationSec)}`
                                    : ''}
                                </span>
                              </p>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setOpen(false);
                              navigate({
                                page: 'year',
                                year: item.yearCode,
                                eventSlug: item.eventSlug,
                              });
                            }}
                            className="shrink-0 cursor-pointer rounded-md border border-[#DDD5C7] bg-white px-2.5 py-1 text-[10px] font-semibold text-[#1C1917] hover:border-[#C83E31] hover:text-[#C83E31]"
                          >
                            Sự kiện
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {msg.apiNotice && (
                    <p className="mt-2 border-t border-[#EFEAE0] pt-1.5 text-[10px] text-[#78716C]">
                      {msg.apiNotice}
                    </p>
                  )}
                </div>
              ))}

              {loading && (
                <div className="mr-8 rounded-2xl border border-[#E5DDD0] bg-white/75 px-4 py-2 text-xs text-[#57534E] backdrop-blur-sm">
                  Đang tìm kiếm trong kho ký ức C3...
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-[#E5DDD0] bg-transparent px-3.5 py-2.5">
              <div className="mb-2 flex flex-wrap gap-1.5">
                {SAMPLE_PROMPTS.map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => void sendMessage(sample)}
                    className="cursor-pointer rounded-lg border border-[#DDD5C7] bg-white/70 px-2.5 py-1 text-[10px] text-[#57534E] transition-colors hover:border-[#C83E31] hover:text-[#1C1917]"
                  >
                    {sample}
                  </button>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendMessage(input);
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Trò chuyện hoặc tìm ảnh, video, thông tin C3..."
                  aria-label="Nhập câu hỏi hoặc tìm kiếm kỷ niệm"
                  className="flex-1 rounded-full border border-[#D6CEC2] bg-white/80 px-4 py-2 text-xs text-[#1C1917] placeholder:text-[#78716C] focus:border-[#C83E31] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  aria-label="Gửi lời nhắn cho Trợ lý Ký ức"
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-[#C83E31]/65 bg-transparent text-[#C83E31] transition-colors hover:bg-[#C83E31]/10 disabled:opacity-40"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </form>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
};
