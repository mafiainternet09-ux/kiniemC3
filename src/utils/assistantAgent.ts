import type {
  AssistantChatResponse,
  ClassroomSeat,
  GuestbookNote,
  MediaItem,
  RouteView,
  SiteConfig,
  UserRole,
  YearCode,
  YearEvent,
} from '../types/memory';
import { matchMediaCatalog, normalizeVietnamese, parseQueryLocally } from './memorySearch';

export interface AssistantRuntimeContext {
  siteConfig?: Partial<SiteConfig>;
  userName?: string;
  userRole?: UserRole;
  currentRoute?: RouteView;
  catalog: MediaItem[];
  events?: YearEvent[];
  seats?: ClassroomSeat[];
  guestbook?: GuestbookNote[];
}

export function findMatchingSeats(
  seats: ClassroomSeat[],
  query = '',
  seatNumber?: number
): ClassroomSeat[] {
  if (!Array.isArray(seats) || seats.length === 0) return [];

  if (typeof seatNumber === 'number' && Number.isFinite(seatNumber)) {
    const exact = seats.find((s) => s.seatNumber === Math.round(seatNumber));
    return exact ? [exact] : [];
  }

  const norm = normalizeVietnamese(query);
  if (!norm) return [];

  const numMatch =
    norm.match(/(?:ghe|vi tri|cho|ban|so|#)\s*0*(\d{1,2})\b/) || norm.match(/^0*(\d{1,2})$/);
  if (numMatch) {
    const targetNum = Number(numMatch[1]);
    if (targetNum >= 1 && targetNum <= 50) {
      const seat = seats.find((s) => s.seatNumber === targetNum);
      if (seat) return [seat];
    }
  }

  return seats
    .filter((seat) => {
      if (!seat.isAssigned) return false;
      const hay = normalizeVietnamese(
        `${seat.memberName} ${seat.nickname ?? ''} ${seat.favoriteSubject ?? ''} ${seat.bio ?? ''}`
      );
      return hay.includes(norm);
    })
    .slice(0, 6);
}

export function buildArchiveOverview(ctx: AssistantRuntimeContext) {
  const approvedMedia = (ctx.catalog || []).filter((m) => m.status === 'approved');
  const imagesCount = approvedMedia.filter((m) => m.mediaType === 'image').length;
  const videosCount = approvedMedia.filter((m) => m.mediaType === 'video').length;
  const assignedSeats = (ctx.seats || []).filter((s) => s.isAssigned).length;
  const totalSeats = (ctx.seats || []).length || 50;
  const eventsCount = (ctx.events || []).length || 18;
  const guestbookCount = (ctx.guestbook || []).length;

  const byYear: Record<YearCode, { images: number; videos: number }> = {
    '10A3': { images: 0, videos: 0 },
    '11B3': { images: 0, videos: 0 },
    '12C3': { images: 0, videos: 0 },
  };
  for (const item of approvedMedia) {
    if (byYear[item.yearCode]) {
      if (item.mediaType === 'video') byYear[item.yearCode].videos += 1;
      else byYear[item.yearCode].images += 1;
    }
  }

  return {
    imagesCount,
    videosCount,
    totalMedia: approvedMedia.length,
    assignedSeats,
    totalSeats,
    eventsCount,
    guestbookCount,
    byYear,
  };
}

export function buildAssistantPromptContext(ctx: AssistantRuntimeContext): string {
  const overview = buildArchiveOverview(ctx);
  const assignedList = (ctx.seats || [])
    .filter((s) => s.isAssigned)
    .slice(0, 50)
    .map((s) => `#${s.seatNumber}:${s.memberName}${s.nickname ? `(${s.nickname})` : ''}`);

  const eventsSummary = (ctx.events || [])
    .slice(0, 20)
    .map((e) => `${e.yearCode}/${e.slug}:${e.title}`);

  const mediaSummary = (ctx.catalog || [])
    .filter((m) => m.status === 'approved')
    .slice(0, 20)
    .map((m) => ({
      id: m.id,
      y: m.yearCode,
      e: m.eventSlug,
      t: m.mediaType,
      title: m.title.slice(0, 80),
    }));

  const recentNotes = (ctx.guestbook || []).slice(0, 4).map((g) => ({
    by: g.authorName,
    y: g.yearTag,
    msg: g.message.slice(0, 100),
  }));

  return JSON.stringify({
    site: ctx.siteConfig?.siteName || 'C3 – Digital Memory',
    school: ctx.siteConfig?.schoolName || 'Trường THPT Bình Sơn',
    music: `${ctx.siteConfig?.musicTitle || 'Thanh Xuân'} - ${ctx.siteConfig?.musicArtist || 'Da LAB'}`,
    user: {
      name: ctx.userName || 'Khách ghé thăm',
      role: ctx.userRole || 'guest',
    },
    stats: overview,
    events: eventsSummary,
    assignedSeats: assignedList,
    mediaSample: mediaSummary,
    guestbook: recentNotes,
  });
}

export function runLocalAssistantFallback(
  rawMessage: string,
  ctx: AssistantRuntimeContext,
  apiNotice?: string
): AssistantChatResponse {
  const trimmed = rawMessage.trim();
  const norm = normalizeVietnamese(trimmed);
  const catalog = ctx.catalog || [];
  const seats = ctx.seats || [];
  const overview = buildArchiveOverview(ctx);

  // 1. Archive statistics & general class information
  if (
    /(bao nhieu|thong ke|tong cong|so luong|co nhung su kien nao|nhac nen|bai hat|truong nao|lop nao)/.test(
      norm
    )
  ) {
    return {
      reply:
        `Tập thể C3 – Trường THPT Bình Sơn (hành trình 10A3 → 11B3 → 12C3, 50 thành viên) hiện đang lưu giữ ${overview.imagesCount} bức ảnh và ${overview.videosCount} video qua ${overview.eventsCount} không gian sự kiện (10A3: ${overview.byYear['10A3'].images} ảnh/${overview.byYear['10A3'].videos} video; 11B3: ${overview.byYear['11B3'].images} ảnh/${overview.byYear['11B3'].videos} video; 12C3: ${overview.byYear['12C3'].images} ảnh/${overview.byYear['12C3'].videos} video), ${overview.assignedSeats}/${overview.totalSeats} vị trí phòng học đã gán thông tin và ${overview.guestbookCount} dòng lưu bút. Bài nhạc nền của trang là "${ctx.siteConfig?.musicTitle || 'Thanh Xuân'} – ${ctx.siteConfig?.musicArtist || 'Da LAB'}".`,
      matches: [],
      actions: [],
      usedGemini: false,
      apiNotice,
    };
  }

  // 2. Classroom seat info lookup (by seat number or assigned member name)
  const seatNumMatch = norm.match(/(?:ghe|vi tri|ban|so|#)\s*0*(\d{1,2})\b/);
  if (seatNumMatch || /(ai ngoi|tim ban|ho so thanh vien|ghe so|ngoi dau)/.test(norm)) {
    const targetSeatNum = seatNumMatch ? Number(seatNumMatch[1]) : undefined;
    const matchedSeats = findMatchingSeats(seats, trimmed, targetSeatNum);
    if (matchedSeats.length === 1) {
      const s = matchedSeats[0];
      return {
        reply: s.isAssigned
          ? `Ghế #${String(s.seatNumber).padStart(2, '0')} (Bàn ${s.row}) là vị trí của ${s.memberName}${s.nickname ? ` (${s.nickname})` : ''}${s.favoriteSubject ? `, môn yêu thích: ${s.favoriteSubject}` : ''}. Bạn bấm vào thẻ bên dưới để xem chi tiết hồ sơ nhé!`
          : `Vị trí #${String(s.seatNumber).padStart(2, '0')} (Bàn ${s.row}) trong Phòng học 50 chỗ hiện chưa được gán tên thành viên. Bạn có thể bấm thẻ bên dưới để mở đúng vị trí này.`,
        matches: [],
        seats: matchedSeats,
        actions: [],
        usedGemini: false,
        apiNotice,
      };
    }
    if (matchedSeats.length > 1) {
      return {
        reply: `Mình tìm thấy ${matchedSeats.length} vị trí khớp trong sơ đồ Phòng học 50 thành viên nè, bạn bấm vào thẻ bên dưới để xem chi tiết nhé!`,
        matches: [],
        seats: matchedSeats,
        actions: [],
        usedGemini: false,
        apiNotice,
      };
    }
  }

  // 3. Friendly conversational responses (unless explicitly asking to search media/events)
  const hasExplicitMediaQuery =
    /(tim|anh|hinh|video|clip|phim|ky yeu|hoi trai|ky niem khac|20\/10|19\/11|20\/11|8\/3|08\/03|10a3|11b3|12c3)/.test(
      norm
    );

  if (!hasExplicitMediaQuery) {
    if (
      /^(chao|hello|hi|xin chao|alo|helo|hey|yo)\b/.test(norm) ||
      /(ban la ai|ten gi|lam duoc gi|giup duoc gi|co the lam)/.test(norm)
    ) {
      return {
        reply:
          'Chào bạn của C3! Mình là bạn đồng hành trong kho ký ức 10A3 – 11B3 – 12C3 THPT Bình Sơn. Bạn có thể trò chuyện thoải mái với mình hoặc nhờ mình tìm ảnh, tìm video theo sự kiện, tra cứu vị trí trong phòng học 50 chỗ và xem thống kê kho lưu trữ nhé!',
        matches: [],
        actions: [],
        usedGemini: false,
        apiNotice,
      };
    }

    if (/(cam on|thank|iu|yeu|tuyet voi|hay qua)/.test(norm)) {
      return {
        reply:
          'Không có chi đâu nè! Kỷ niệm C3 là để tụi mình cùng giữ gìn mà. Khi nào muốn tâm sự hay tìm lại ảnh, video năm lớp 10, 11, 12 thì cứ nhắn mình nhé!',
        matches: [],
        actions: [],
        usedGemini: false,
        apiNotice,
      };
    }

    if (/(tam biet|bye|hen gap|ngu ngon)/.test(norm)) {
      return {
        reply:
          'Tạm biệt bạn nha! Lúc nào nhớ sân trường Bình Sơn và 50 mảnh ghép C3 thì ghé lại trò chuyện với mình nhé.',
        matches: [],
        actions: [],
        usedGemini: false,
        apiNotice,
      };
    }
  }

  // 4. Search memories (photos & videos) from real catalog
  const searchIntent = parseQueryLocally(trimmed);
  const matches = matchMediaCatalog(catalog, searchIntent, trimmed);

  if (matches.length > 0) {
    return {
      reply:
        matches.length === 1
          ? `Mình tìm thấy 1 kỷ niệm khớp với yêu cầu của bạn: "${matches[0].title}" (${matches[0].yearCode} · ${matches[0].eventTitle}). Bạn nhấn vào thẻ bên dưới để mở xem ngay nhé!`
          : `Mình tìm thấy ${matches.length} tư liệu phù hợp trong kho lưu trữ C3 nè! Bạn bấm vào từng thẻ bên dưới để xem ảnh/video hoặc ghé sự kiện tương ứng.`,
      matches,
      actions: [],
      usedGemini: false,
      apiNotice,
    };
  }

  // Honest fallback when no catalog item or info matched
  return {
    reply:
      `Mình chưa tìm thấy ảnh, video hay thông tin khớp với "${trimmed}" trong kho C3. Bạn thử hỏi cụ thể hơn theo năm học (10A3, 11B3, 12C3), sự kiện (20/10, 19/11, 20/11, 8/3, hội trại, kỷ yếu, kỷ niệm khác), số ghế (1–50), hoặc nhắn tin trò chuyện với mình nhé!`,
    matches: [],
    actions: [],
    usedGemini: false,
    apiNotice,
  };
}
