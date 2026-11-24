import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Flag, Trash2, X } from 'lucide-react';
import { useArchive } from '../context/ArchiveContext';
import type { MediaItem } from '../types/memory';
import { ArchivalMediaFrame } from './ArchivalMediaFrame';

interface LightboxModalProps {
  items: MediaItem[];
  activeIndex: number;
  onClose: () => void;
  onChangeIndex: (nextIndex: number) => void;
}

export const LightboxModal: React.FC<LightboxModalProps> = ({
  items,
  activeIndex,
  onClose,
  onChangeIndex,
}) => {
  const { isAuthorized, isAdmin, user, submitRemovalRequest, deleteMediaItem } = useArchive();
  const [showRemovalForm, setShowRemovalForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reason, setReason] = useState('');
  const [sentMessage, setSentMessage] = useState('');

  const item = items[activeIndex];

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && items.length > 1) {
        onChangeIndex((activeIndex - 1 + items.length) % items.length);
      }
      if (e.key === 'ArrowRight' && items.length > 1) {
        onChangeIndex((activeIndex + 1) % items.length);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeIndex, items.length, onChangeIndex, onClose]);

  useEffect(() => {
    setShowRemovalForm(false);
    setConfirmDelete(false);
    setReason('');
    setSentMessage('');
  }, [activeIndex]);

  if (!item) return null;

  const handleSubmitRemoval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 4) return;
    try {
      await submitRemovalRequest(item, reason);
      setSentMessage('Đã gửi yêu cầu gỡ ảnh tới Quản trị viên.');
      setReason('');
      setShowRemovalForm(false);
    } catch {
      setSentMessage('Không thể gửi yêu cầu lúc này. Vui lòng thử lại.');
    }
  };

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={`Xem ảnh ${item.title}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex flex-col bg-[#141210]/95 text-[#FAF7F2] backdrop-blur-xl"
    >
      <div className="flex items-center justify-between border-b border-white/12 px-5 py-3.5 sm:px-8">
        <div className="flex items-center gap-3 text-xs text-[#D6CEC2]">
          <span className="font-mono tabular-nums text-[#E9C46A]">
            {String(activeIndex + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')}
          </span>
          <span aria-hidden="true">·</span>
          <span>{item.yearCode}</span>
          <span aria-hidden="true">·</span>
          <span className="max-w-[200px] truncate sm:max-w-none">{item.eventTitle}</span>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng trình xem ảnh"
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/20 bg-white/8 px-3.5 py-1.5 text-xs text-[#FAF7F2] transition-colors hover:border-[#E9C46A] hover:bg-white/15"
        >
          <X className="h-4 w-4" />
          <span>Đóng</span>
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-6 sm:px-16">
        {items.length > 1 && (
          <button
            type="button"
            onClick={() => onChangeIndex((activeIndex - 1 + items.length) % items.length)}
            aria-label="Ảnh trước"
            className="absolute left-3 z-10 flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-white/20 bg-white/10 text-[#FAF7F2] backdrop-blur-md transition-colors hover:border-[#E9C46A] sm:left-6"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}

        <motion.div
          key={item.id}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-4xl"
        >
          <ArchivalMediaFrame
            src={item.url}
            alt={item.title}
            isDemo={item.isDemo}
            mediaType="image"
            label={item.title}
            aspectClass="aspect-[16/10] max-h-[64vh] mx-auto"
            className="rounded-2xl border border-white/12 shadow-2xl"
          />
        </motion.div>

        {items.length > 1 && (
          <button
            type="button"
            onClick={() => onChangeIndex((activeIndex + 1) % items.length)}
            aria-label="Ảnh tiếp theo"
            className="absolute right-3 z-10 flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-white/20 bg-white/10 text-[#FAF7F2] backdrop-blur-md transition-colors hover:border-[#E9C46A] sm:right-6"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="border-t border-white/12 bg-[#1A1715] px-5 py-4 sm:px-8">
        <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="font-serif text-xl font-medium text-[#FAF7F2] sm:text-2xl">
              {item.title}
            </h3>
            {item.caption && (
              <p className="mt-1 max-w-2xl text-sm text-[#D6CEC2]">{item.caption}</p>
            )}
            {item.tags && item.tags.length > 0 && (
              <p className="mt-2 text-xs text-[#A8A29E]">
                Từ khóa: {item.tags.join(' · ')}
              </p>
            )}
          </div>

          {isAuthorized && !item.isDemo && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {(isAdmin || (user && item.uploadedBy === user.uid)) && (
                confirmDelete ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        void deleteMediaItem(item.id)
                          .then(() => onClose())
                          .catch(() => setSentMessage('Không thể xóa ảnh lúc này.'));
                      }}
                      className="cursor-pointer rounded-xl bg-[#C83E31] px-3.5 py-1.5 text-xs font-medium text-white"
                    >
                      Xác nhận xóa ảnh
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
                    <span>Xóa ảnh</span>
                  </button>
                )
              )}
              <button
                type="button"
                onClick={() => setShowRemovalForm((v) => !v)}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/20 px-3.5 py-1.5 text-xs text-[#D6CEC2] hover:border-[#E9C46A]"
              >
                <Flag className="h-3.5 w-3.5" />
                <span>Yêu cầu gỡ ảnh</span>
              </button>
            </div>
          )}
        </div>

        {sentMessage && (
          <p className="mx-auto mt-2 max-w-4xl text-xs text-[#E9C46A]">{sentMessage}</p>
        )}

        {showRemovalForm && (
          <form
            onSubmit={(e) => void handleSubmitRemoval(e)}
            className="mx-auto mt-3 flex max-w-4xl flex-col gap-2 sm:flex-row"
          >
            <input
              type="text"
              required
              minLength={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Nêu lý do bạn muốn gỡ hoặc ẩn bức ảnh này..."
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
      </div>
    </motion.div>
  );
};
