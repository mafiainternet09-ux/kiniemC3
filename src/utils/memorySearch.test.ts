import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefault50Seats,
  extractYoutubeVideoId,
  filterAndPaginateGuestbook,
  formatDateDDMMYYYY,
  formatDuration,
  getVisiblePageNumbers,
  matchMediaCatalog,
  normalizeTimestampToIso,
  parseQueryLocally,
  resolveTimestampMs,
  sanitizeFirestoreId,
  sanitizeTags,
  splitMediaByType,
  swapSeatAssignments,
  truncateText,
  validateMediaPayload,
} from './memorySearch';
import type { GuestbookNote, MediaItem } from '../types/memory';

const sampleMedia: MediaItem[] = [
  {
    id: 'm1',
    yearCode: '10A3',
    eventId: '10a3-hoi-trai',
    eventSlug: 'hoi-trai',
    eventTitle: 'Hội trại Lớp 10',
    mediaType: 'image',
    title: 'Đêm lửa trại đầu tiên 10A3',
    caption: 'Cổng trại bằng tre và ánh đèn vàng sân trường THPT Bình Sơn',
    url: 'plate://camp-10a3',
    tags: ['hoi trai', '10a3', 'lua trai'],
    featuredOnHome: true,
    isYearbookSpread: false,
    isDemo: true,
    status: 'approved',
    uploadedBy: 'admin',
    uploadedByName: 'Quản trị viên',
  },
  {
    id: 'm2',
    yearCode: '11B3',
    eventId: '11b3-20-11',
    eventSlug: '20-11',
    eventTitle: 'Ngày Nhà giáo Việt Nam 20/11',
    mediaType: 'video',
    title: 'Tiết mục văn nghệ 20/11 lớp 11B3',
    caption: 'Giai điệu tri ân thầy cô trên sân khấu trường',
    url: 'plate://video-11b3-20-11',
    durationSec: 185,
    tags: ['20/11', 'van nghe', '11b3'],
    featuredOnHome: true,
    isYearbookSpread: false,
    isDemo: true,
    status: 'approved',
    uploadedBy: 'admin',
    uploadedByName: 'Quản trị viên',
  },
  {
    id: 'm3',
    yearCode: '12C3',
    eventId: '12c3-ky-yeu',
    eventSlug: 'ky-yeu',
    eventTitle: 'Phòng ảnh Kỷ yếu 12C3',
    mediaType: 'image',
    title: 'Khoảnh khắc tập thể 12C3 dưới hàng phượng',
    caption: 'Bộ ảnh kỷ yếu mùa hạ năm cuối',
    url: 'plate://ky-yeu-12c3',
    tags: ['ky yeu', 'tap the', '12c3'],
    featuredOnHome: true,
    isYearbookSpread: true,
    isDemo: true,
    status: 'approved',
    uploadedBy: 'admin',
    uploadedByName: 'Quản trị viên',
  },
  {
    id: 'm4',
    yearCode: '12C3',
    eventId: '12c3-08-03',
    eventSlug: '08-03',
    eventTitle: 'Ngày Quốc tế Phụ nữ 8/3',
    mediaType: 'image',
    title: 'Bó hoa cúc họa mi ngày 8/3 lớp 12C3',
    caption: 'Bất ngờ nhỏ đầu giờ sinh hoạt',
    url: 'plate://08-03-12c3',
    tags: ['8/3', '12c3'],
    featuredOnHome: false,
    isYearbookSpread: false,
    isDemo: true,
    status: 'removed',
    uploadedBy: 'admin',
    uploadedByName: 'Quản trị viên',
  },
];

test('splitMediaByType strictly separates images and videos and excludes removed items', () => {
  const { images, videos } = splitMediaByType(sampleMedia);
  assert.equal(images.length, 2);
  assert.equal(videos.length, 1);
  assert.equal(images.every((i) => i.mediaType === 'image'), true);
  assert.equal(videos.every((v) => v.mediaType === 'video'), true);
});

test('parseQueryLocally and matchMediaCatalog find 10A3 camp photos accurately', () => {
  const intent = parseQueryLocally('Tìm giúp mình ảnh hội trại năm lớp 10.');
  assert.equal(intent.yearCode, '10A3');
  assert.equal(intent.eventSlug, 'hoi-trai');
  assert.equal(intent.mediaType, 'image');

  const results = matchMediaCatalog(sampleMedia, intent, 'Tìm giúp mình ảnh hội trại năm lớp 10.');
  assert.equal(results.length, 1);
  assert.equal(results[0].id, 'm1');
});

test('matchMediaCatalog finds 11B3 20/11 video and returns empty for non-existent queries', () => {
  const videoIntent = parseQueryLocally('Có video nào về ngày 20/11 năm lớp 11 không?');
  assert.equal(videoIntent.yearCode, '11B3');
  assert.equal(videoIntent.eventSlug, '20-11');
  assert.equal(videoIntent.mediaType, 'video');
  const videoMatches = matchMediaCatalog(sampleMedia, videoIntent);
  assert.equal(videoMatches.length, 1);
  assert.equal(videoMatches[0].id, 'm2');

  const missingIntent = parseQueryLocally('Tìm ảnh chuyến du hành sao hỏa');
  const missingMatches = matchMediaCatalog(sampleMedia, missingIntent, 'Tìm ảnh chuyến du hành sao hỏa');
  assert.equal(missingMatches.length, 0);
});

test('createDefault50Seats generates 50 ordered seats without fabricated personal names', () => {
  const seats = createDefault50Seats();
  assert.equal(seats.length, 50);
  assert.equal(seats[0].seatNumber, 1);
  assert.equal(seats[49].seatNumber, 50);
  assert.equal(seats.every((s) => s.isAssigned === false), true);
  assert.equal(seats[0].memberName, 'Vị trí 01');
});

test('swapSeatAssignments exchanges two seat profiles cleanly while keeping seatNumbers fixed', () => {
  const seats = createDefault50Seats();
  seats[0] = { ...seats[0], memberName: 'Thành viên A', isAssigned: true, quote: 'Nhớ C3' };
  seats[1] = { ...seats[1], memberName: 'Thành viên B', isAssigned: true, quote: 'THPT Bình Sơn' };

  const swapped = swapSeatAssignments(seats, 1, 2, 'admin-1');
  assert.equal(swapped[0].seatNumber, 1);
  assert.equal(swapped[0].memberName, 'Thành viên B');
  assert.equal(swapped[1].seatNumber, 2);
  assert.equal(swapped[1].memberName, 'Thành viên A');
});

test('formatDuration and validateMediaPayload behave deterministically', () => {
  assert.equal(formatDuration(185), '03:05');
  assert.equal(formatDuration(0), '00:00');
  assert.equal(
    validateMediaPayload({
      title: 'A',
      yearCode: '12C3',
      eventId: 'e1',
      mediaType: 'image',
      url: 'https://example.com/a.jpg',
    }).valid,
    false
  );
  assert.equal(
    validateMediaPayload({
      title: 'Khoảnh khắc thanh xuân',
      yearCode: '12C3',
      eventId: 'e1',
      mediaType: 'image',
      url: 'https://example.com/a.jpg',
    }).valid,
    true
  );
});

test('Firestore sanitization helpers enforce valid IDs, bounded tags, and YouTube IDs', () => {
  assert.equal(sanitizeFirestoreId('Hội trại 12C3!'), 'hoi-trai-12c3');
  assert.equal(sanitizeFirestoreId('   ', 'ev').startsWith('ev-'), true);

  const longTag = 'a'.repeat(100);
  const tags = sanitizeTags([' 12c3 ', '12c3', '', longTag, 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10', 't11']);
  assert.equal(tags.length, 10);
  assert.equal(tags[0], '12c3');
  assert.equal(tags[1].length, 64);

  assert.equal(extractYoutubeVideoId('GgQFO8dL5XQ'), 'GgQFO8dL5XQ');
  assert.equal(extractYoutubeVideoId('https://www.youtube.com/watch?v=GgQFO8dL5XQ&t=12s'), 'GgQFO8dL5XQ');
  assert.equal(extractYoutubeVideoId('https://youtu.be/GgQFO8dL5XQ'), 'GgQFO8dL5XQ');
  assert.equal(extractYoutubeVideoId('not valid!!'), 'GgQFO8dL5XQ');

  assert.equal(truncateText('  xin chào  ', 5), 'xin c');
  assert.equal(truncateText('', 10, 'Mặc định'), 'Mặc định');
});

test('parseQueryLocally and matchMediaCatalog recognize Kỷ niệm khác queries', () => {
  const otherItem: MediaItem = {
    id: 'm5',
    yearCode: '12C3',
    eventId: '12c3-ky-niem-khac',
    eventSlug: 'ky-niem-khac',
    eventTitle: 'Kỷ niệm khác · 12C3',
    mediaType: 'image',
    title: 'Giờ ra chơi đá cầu sân trường',
    caption: 'Khoảnh khắc đời thường của nhóm bạn',
    url: 'https://example.com/ra-choi.jpg',
    tags: ['ky niem khac', '12c3', 'ra choi'],
    featuredOnHome: false,
    isYearbookSpread: false,
    isDemo: false,
    status: 'approved',
    uploadedBy: 'u1',
    uploadedByName: 'Thành viên C3',
  };

  const intent = parseQueryLocally('Tìm ảnh kỷ niệm khác lớp 12');
  assert.equal(intent.yearCode, '12C3');
  assert.equal(intent.eventSlug, 'ky-niem-khac');
  assert.equal(intent.mediaType, 'image');

  const matches = matchMediaCatalog([...sampleMedia, otherItem], intent, 'Tìm ảnh kỷ niệm khác lớp 12');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, 'm5');
});

test('formatDateDDMMYYYY and normalizeTimestampToIso handle Date, Firestore Timestamp, and gb-<ms> IDs', () => {
  const localNoon = new Date(2026, 10, 23, 12, 0, 0);
  assert.equal(formatDateDDMMYYYY(localNoon), '23/11/2026');

  const firestoreLike = { toDate: () => new Date(2026, 4, 5, 9, 30, 0) };
  assert.equal(formatDateDDMMYYYY(firestoreLike), '05/05/2026');

  const secondsObj = { seconds: Math.floor(localNoon.getTime() / 1000) };
  assert.equal(formatDateDDMMYYYY(secondsObj), '23/11/2026');

  const fallbackMs = localNoon.getTime();
  assert.equal(formatDateDDMMYYYY(null, `gb-${fallbackMs}-abc123`), '23/11/2026');
  assert.equal(resolveTimestampMs(null, 'demo-gb-1'), null);
  assert.equal(formatDateDDMMYYYY(undefined, 'demo-gb-1'), null);

  const iso = normalizeTimestampToIso(firestoreLike);
  assert.ok(typeof iso === 'string' && iso.endsWith('Z'));
});

test('filterAndPaginateGuestbook computes category counts, slices pages horizontally, and clamps out-of-range pages', () => {
  const sampleNotes: GuestbookNote[] = [
    { id: 'n1', authorUid: 'u1', authorName: 'A', yearTag: '12C3', message: 'm1', status: 'approved' },
    { id: 'n2', authorUid: 'u2', authorName: 'B', yearTag: '12C3', message: 'm2', status: 'approved' },
    { id: 'n3', authorUid: 'u3', authorName: 'C', yearTag: '12C3', message: 'm3', status: 'approved' },
    { id: 'n4', authorUid: 'u4', authorName: 'D', yearTag: '11B3', message: 'm4', status: 'approved' },
    { id: 'n5', authorUid: 'u5', authorName: 'E', yearTag: 'C3', message: 'm5', status: 'approved' },
  ];

  const allPage2 = filterAndPaginateGuestbook(sampleNotes, 'ALL', 2, 2);
  assert.equal(allPage2.countsByCategory.ALL, 5);
  assert.equal(allPage2.countsByCategory['12C3'], 3);
  assert.equal(allPage2.countsByCategory['11B3'], 1);
  assert.equal(allPage2.countsByCategory['10A3'], 0);
  assert.equal(allPage2.countsByCategory.C3, 1);
  assert.equal(allPage2.totalPages, 3);
  assert.equal(allPage2.currentPage, 2);
  assert.deepEqual(
    allPage2.pageItems.map((n) => n.id),
    ['n3', 'n4']
  );

  const clamped = filterAndPaginateGuestbook(sampleNotes, '12C3', 99, 2);
  assert.equal(clamped.totalPages, 2);
  assert.equal(clamped.currentPage, 2);
  assert.deepEqual(
    clamped.pageItems.map((n) => n.id),
    ['n3']
  );

  const emptyCat = filterAndPaginateGuestbook(sampleNotes, '10A3', 3, 2);
  assert.equal(emptyCat.totalPages, 1);
  assert.equal(emptyCat.currentPage, 1);
  assert.equal(emptyCat.pageItems.length, 0);

  assert.deepEqual(getVisiblePageNumbers(2, 4), [1, 2, 3, 4]);
  assert.deepEqual(getVisiblePageNumbers(1, 10), [1, 2, 'ellipsis', 10]);
  assert.deepEqual(getVisiblePageNumbers(5, 10), [1, 'ellipsis', 4, 5, 6, 'ellipsis', 10]);
  assert.deepEqual(getVisiblePageNumbers(10, 10), [1, 'ellipsis', 9, 10]);
});

