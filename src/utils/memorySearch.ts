import type {
  ClassroomSeat,
  EventSlug,
  GuestbookNote,
  MediaItem,
  MediaType,
  ParsedSearchIntent,
  YearCode,
} from '../types/memory';

export function normalizeVietnamese(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9/\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function splitMediaByType(items: MediaItem[]): {
  images: MediaItem[];
  videos: MediaItem[];
} {
  const images: MediaItem[] = [];
  const videos: MediaItem[] = [];
  for (const item of items) {
    if (item.status === 'removed') continue;
    if (item.mediaType === 'video') {
      videos.push(item);
    } else {
      images.push(item);
    }
  }
  return { images, videos };
}

export function parseQueryLocally(rawQuery: string): ParsedSearchIntent {
  const norm = normalizeVietnamese(rawQuery);

  let yearCode: YearCode | null = null;
  if (/(10a3|lop 10|nam 10|khoi 10)/.test(norm)) {
    yearCode = '10A3';
  } else if (/(11b3|lop 11|nam 11|khoi 11)/.test(norm)) {
    yearCode = '11B3';
  } else if (/(12c3|lop 12|nam 12|khoi 12)/.test(norm)) {
    yearCode = '12C3';
  }

  let eventSlug: EventSlug | null = null;
  if (/(20\/10|20-10|20 thang 10|phu nu viet nam)/.test(norm)) {
    eventSlug = '20-10';
  } else if (/(19\/11|19-11|19 thang 11|nam gioi|quoc te nam)/.test(norm)) {
    eventSlug = '19-11';
  } else if (/(20\/11|20-11|20 thang 11|nha giao|thay co)/.test(norm)) {
    eventSlug = '20-11';
  } else if (/(8\/3|08\/03|8-3|08-03|8 thang 3|quoc te phu nu)/.test(norm)) {
    eventSlug = '08-03';
  } else if (/(hoi trai|trai he|cam trai|dot lua)/.test(norm)) {
    eventSlug = 'hoi-trai';
  } else if (/(ky yeu|tot nghiep|ao dai|vest|ra truong)/.test(norm)) {
    eventSlug = 'ky-yeu';
  } else if (/(ky niem khac|doi thuong|ngau hung|tan truong|ra choi)/.test(norm)) {
    eventSlug = 'ky-niem-khac';
  }

  let mediaType: MediaType | null = null;
  const asksVideo = /(video|clip|phim|thuoc phim|quay)/.test(norm);
  const asksImage = /(anh|hinh|photo|khoanh khac|album anh|buc)/.test(norm);
  if (asksVideo && !asksImage) {
    mediaType = 'video';
  } else if (asksImage && !asksVideo) {
    mediaType = 'image';
  }

  const stopWords = new Set([
    'tim', 'giup', 'minh', 'cho', 'xem', 'nhung', 'cac', 'buc', 'anh', 'hinh',
    'video', 'clip', 'co', 'nao', 've', 'ngay', 'nam', 'lop', '10', '11', '12',
    '10a3', '11b3', '12c3', 'khong', 'cua', 'tai', 'o', 'voi', 'trong', 've',
    'hoat', 'dong', 'thang', '20/10', '19/11', '20/11', '8/3', '08/03',
  ]);

  const keywords = norm
    .split(' ')
    .filter((token) => token.length >= 2 && !stopWords.has(token));

  return {
    yearCode,
    eventSlug,
    mediaType,
    keywords,
    reply: '',
    usedGemini: false,
  };
}

export function matchMediaCatalog(
  catalog: MediaItem[],
  intent: ParsedSearchIntent,
  rawQuery = ''
): MediaItem[] {
  const activeItems = catalog.filter((item) => item.status === 'approved');
  const normalizedKeywords = intent.keywords
    .map((k) => normalizeVietnamese(k))
    .filter((k) => k.length >= 2);

  // If user specified filters (year, event, or mediaType), strictly enforce those filters first
  let candidates = activeItems.filter((item) => {
    if (intent.yearCode && item.yearCode !== intent.yearCode) return false;
    if (intent.eventSlug && item.eventSlug !== intent.eventSlug) return false;
    if (intent.mediaType && item.mediaType !== intent.mediaType) return false;
    return true;
  });

  if (normalizedKeywords.length === 0) {
    // If no structural filters AND no keywords, return empty rather than dumping everything on nonsense input
    if (!intent.yearCode && !intent.eventSlug && !intent.mediaType) {
      const normRaw = normalizeVietnamese(rawQuery);
      if (!normRaw) return [];
      return activeItems.filter((item) => {
        const hay = normalizeVietnamese(
          `${item.title} ${item.caption ?? ''} ${item.eventTitle} ${item.yearCode} ${(item.tags ?? []).join(' ')}`
        );
        return hay.includes(normRaw);
      });
    }
    return candidates;
  }

  const tokenMatch = (haystack: string, kw: string): boolean => {
    const words = haystack.split(' ');
    if (kw.length <= 3) {
      return words.includes(kw);
    }
    return words.some((w) => w === kw || w.startsWith(kw)) || haystack.includes(` ${kw} `);
  };

  const minMatches = normalizedKeywords.length >= 3 ? 2 : 1;

  const scored = candidates
    .map((item) => {
      const hay = normalizeVietnamese(
        `${item.title} ${item.caption ?? ''} ${item.eventTitle} ${item.yearCode} ${(item.tags ?? []).join(' ')}`
      );
      let hits = 0;
      for (const kw of normalizedKeywords) {
        if (tokenMatch(hay, kw)) {
          hits += 1;
        }
      }
      if (hits < minMatches) {
        return { item, score: 0 };
      }
      let score = hits * 2;
      if (intent.yearCode && item.yearCode === intent.yearCode) score += 1;
      if (intent.eventSlug && item.eventSlug === intent.eventSlug) score += 1;
      return { item, score };
    })
    .filter((entry) => entry.score > 0);

  if (scored.length > 0) {
    scored.sort((a, b) => b.score - a.score);
    return scored.map((entry) => entry.item);
  }

  return [];
}

export function formatDuration(seconds?: number): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return '00:00';
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function createDefault50Seats(updatedBy = 'system'): ClassroomSeat[] {
  const seats: ClassroomSeat[] = [];
  const rowTotals = [9, 10, 8, 8, 9, 6]; // [5+4, 5+5, 4+4, 4+4, 4+5, 3+3] = 50
  let seatNum = 1;
  rowTotals.forEach((totalInRow, rowIdx) => {
    for (let c = 1; c <= totalInRow; c++) {
      const seatNumberLabel = String(seatNum).padStart(2, '0');
      seats.push({
        seatId: `seat-${seatNumberLabel}`,
        seatNumber: seatNum,
        row: rowIdx + 1,
        col: c,
        memberName: `Vị trí ${seatNumberLabel}`,
        nickname: '',
        avatarUrl: '',
        bio: 'Vị trí thành viên trong phòng học C3 – THPT Bình Sơn. Quản trị viên có thể cập nhật tên, ảnh đại diện và kỷ niệm tại đây.',
        quote: '',
        favoriteSubject: '',
        linkedMediaIds: [],
        isAssigned: false,
        updatedBy,
      });
      seatNum += 1;
    }
  });
  return seats;
}

export function swapSeatAssignments(
  seats: ClassroomSeat[],
  seatNumberA: number,
  seatNumberB: number,
  updatedBy: string
): ClassroomSeat[] {
  if (seatNumberA === seatNumberB) return seats;
  const seatA = seats.find((s) => s.seatNumber === seatNumberA);
  const seatB = seats.find((s) => s.seatNumber === seatNumberB);
  if (!seatA || !seatB) return seats;

  return seats.map((seat) => {
    if (seat.seatNumber === seatNumberA) {
      return {
        ...seat,
        memberName: seatB.isAssigned ? seatB.memberName : `Vị trí ${String(seatNumberA).padStart(2, '0')}`,
        nickname: seatB.nickname ?? '',
        avatarUrl: seatB.avatarUrl ?? '',
        avatarStoragePath: seatB.avatarStoragePath ?? '',
        bio: seatB.bio ?? '',
        quote: seatB.quote ?? '',
        favoriteSubject: seatB.favoriteSubject ?? '',
        linkedMediaIds: seatB.linkedMediaIds ?? [],
        isAssigned: seatB.isAssigned,
        updatedBy,
      };
    }
    if (seat.seatNumber === seatNumberB) {
      return {
        ...seat,
        memberName: seatA.isAssigned ? seatA.memberName : `Vị trí ${String(seatNumberB).padStart(2, '0')}`,
        nickname: seatA.nickname ?? '',
        avatarUrl: seatA.avatarUrl ?? '',
        avatarStoragePath: seatA.avatarStoragePath ?? '',
        bio: seatA.bio ?? '',
        quote: seatA.quote ?? '',
        favoriteSubject: seatA.favoriteSubject ?? '',
        linkedMediaIds: seatA.linkedMediaIds ?? [],
        isAssigned: seatA.isAssigned,
        updatedBy,
      };
    }
    return seat;
  });
}

export function validateMediaPayload(input: {
  title: string;
  yearCode: string;
  eventId: string;
  mediaType: string;
  url: string;
}): { valid: boolean; error?: string } {
  if (!input.title || input.title.trim().length < 2) {
    return { valid: false, error: 'Tiêu đề kỷ niệm cần tối thiểu 2 ký tự.' };
  }
  if (!['10A3', '11B3', '12C3'].includes(input.yearCode)) {
    return { valid: false, error: 'Năm học không hợp lệ.' };
  }
  if (!input.eventId || !input.eventId.trim()) {
    return { valid: false, error: 'Vui lòng chọn sự kiện lưu trữ.' };
  }
  if (!['image', 'video'].includes(input.mediaType)) {
    return { valid: false, error: 'Loại tệp phải là hình ảnh hoặc video.' };
  }
  if (!input.url || !input.url.trim()) {
    return { valid: false, error: 'Đường dẫn phương tiện không được để trống.' };
  }
  return { valid: true };
}

export function truncateText(
  value: string | undefined | null,
  maxLength: number,
  fallback = ''
): string {
  const clean = (value ?? '').trim();
  if (!clean) return fallback.slice(0, maxLength);
  return clean.slice(0, maxLength);
}

export function sanitizeFirestoreId(input: string, fallbackPrefix = 'item'): string {
  const normalized = normalizeVietnamese(input)
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  if (normalized.length >= 1) return normalized;
  return `${fallbackPrefix}-${Date.now().toString(36)}`;
}

export function sanitizeTags(tags: string[] | undefined, maxItems = 10): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const raw of tags) {
    const trimmed = String(raw ?? '').trim().slice(0, 64);
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    clean.push(trimmed);
    if (clean.length >= maxItems) break;
  }
  return clean;
}

export function extractYoutubeVideoId(input: string, fallback = 'GgQFO8dL5XQ'): string {
  const raw = (input ?? '').trim();
  if (!raw) return fallback;
  if (/^[a-zA-Z0-9_-]{5,32}$/.test(raw)) {
    return raw;
  }
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    const vParam = url.searchParams.get('v');
    if (vParam && /^[a-zA-Z0-9_-]{5,32}$/.test(vParam)) {
      return vParam;
    }
    const parts = url.pathname.split('/').filter(Boolean);
    const candidate = parts[parts.length - 1] || '';
    if (/^[a-zA-Z0-9_-]{5,32}$/.test(candidate)) {
      return candidate;
    }
  } catch {
    // Ignore malformed URLs and fall back
  }
  return fallback;
}

export function resolveTimestampMs(value: unknown, fallbackId?: string): number | null {
  if (value !== null && value !== undefined) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value;
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.getTime();
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Date.parse(value.trim());
      if (!Number.isNaN(parsed)) return parsed;
    }
    if (typeof value === 'object') {
      const maybeObj = value as {
        toDate?: () => Date;
        seconds?: number;
        _seconds?: number;
      };
      if (typeof maybeObj.toDate === 'function') {
        const d = maybeObj.toDate();
        if (d instanceof Date && !Number.isNaN(d.getTime())) return d.getTime();
      }
      const sec =
        typeof maybeObj.seconds === 'number' ? maybeObj.seconds : maybeObj._seconds;
      if (typeof sec === 'number' && Number.isFinite(sec)) {
        return sec * 1000;
      }
    }
  }
  if (typeof fallbackId === 'string') {
    const match = fallbackId.match(/^gb-(\d{10,15})(?:-|$)/);
    if (match) {
      const ms = Number(match[1]);
      if (Number.isFinite(ms) && ms > 0) return ms;
    }
  }
  return null;
}

export function normalizeTimestampToIso(
  value: unknown,
  fallbackId?: string
): string | undefined {
  const ms = resolveTimestampMs(value, fallbackId);
  if (ms === null) return undefined;
  return new Date(ms).toISOString();
}

export function formatDateDDMMYYYY(
  value: unknown,
  fallbackId?: string
): string | null {
  const ms = resolveTimestampMs(value, fallbackId);
  if (ms === null) return null;
  const date = new Date(ms);
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export type GuestbookCategoryFilter = 'ALL' | GuestbookNote['yearTag'];

export const GUESTBOOK_CATEGORY_OPTIONS: Array<{
  id: GuestbookCategoryFilter;
  label: string;
}> = [
  { id: 'ALL', label: 'Tất cả' },
  { id: '12C3', label: '12C3' },
  { id: '11B3', label: '11B3' },
  { id: '10A3', label: '10A3' },
  { id: 'C3', label: 'Tập thể C3' },
];

export interface PaginatedGuestbookResult {
  filteredNotes: GuestbookNote[];
  pageItems: GuestbookNote[];
  currentPage: number;
  totalPages: number;
  countsByCategory: Record<GuestbookCategoryFilter, number>;
}

export function filterAndPaginateGuestbook(
  notes: GuestbookNote[],
  category: GuestbookCategoryFilter,
  requestedPage: number,
  pageSize = 2
): PaginatedGuestbookResult {
  const safePageSize = Math.max(1, Math.floor(pageSize) || 1);
  const countsByCategory: Record<GuestbookCategoryFilter, number> = {
    ALL: notes.length,
    '12C3': 0,
    '11B3': 0,
    '10A3': 0,
    C3: 0,
  };

  for (const note of notes) {
    if (note.yearTag in countsByCategory) {
      countsByCategory[note.yearTag] += 1;
    }
  }

  const filteredNotes =
    category === 'ALL' ? notes : notes.filter((note) => note.yearTag === category);

  const totalPages = Math.max(1, Math.ceil(filteredNotes.length / safePageSize));
  const rawPage = Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1;
  const currentPage = Math.min(Math.max(1, rawPage), totalPages);
  const startIndex = (currentPage - 1) * safePageSize;
  const pageItems = filteredNotes.slice(startIndex, startIndex + safePageSize);

  return {
    filteredNotes,
    pageItems,
    currentPage,
    totalPages,
    countsByCategory,
  };
}

export function getVisiblePageNumbers(
  currentPage: number,
  totalPages: number
): Array<number | 'ellipsis'> {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages: Array<number | 'ellipsis'> = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) pages.push('ellipsis');
  for (let p = start; p <= end; p++) {
    pages.push(p);
  }
  if (end < totalPages - 1) pages.push('ellipsis');
  pages.push(totalPages);
  return pages;
}

