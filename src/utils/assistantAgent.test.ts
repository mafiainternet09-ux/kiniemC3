import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildArchiveOverview,
  findMatchingSeats,
  runLocalAssistantFallback,
} from './assistantAgent';
import { DEFAULT_EVENTS, DEFAULT_SEATS, DEMO_MEDIA_ITEMS } from '../data/seedCatalog';

test('findMatchingSeats resolves seat by seat number and assigned member name', () => {
  const customSeats = DEFAULT_SEATS.map((s) =>
    s.seatNumber === 7
      ? { ...s, isAssigned: true, memberName: 'Nguyễn Minh Anh', nickname: 'Miu' }
      : s
  );

  const byNum = findMatchingSeats(customSeats, 'xem ghế số 7');
  assert.equal(byNum.length, 1);
  assert.equal(byNum[0].seatNumber, 7);

  const byName = findMatchingSeats(customSeats, 'Minh Anh');
  assert.equal(byName.length, 1);
  assert.equal(byName[0].seatNumber, 7);

  const explicitLabel = findMatchingSeats(customSeats, 'Vị trí 01');
  assert.equal(explicitLabel.length, 1);
  assert.equal(explicitLabel[0].seatNumber, 1);

  const unrelated = findMatchingSeats(customSeats, 'Trần Quốc Bảo');
  assert.equal(unrelated.length, 0);
});

test('buildArchiveOverview computes accurate media, event, and seat counts', () => {
  const overview = buildArchiveOverview({
    catalog: DEMO_MEDIA_ITEMS,
    events: DEFAULT_EVENTS,
    seats: DEFAULT_SEATS,
    guestbook: [],
  });
  assert.equal(overview.totalSeats, 50);
  assert.equal(overview.assignedSeats, 0);
  assert.equal(overview.eventsCount, DEFAULT_EVENTS.length);
  assert.ok(overview.imagesCount > 0);
  assert.ok(overview.videosCount > 0);
});

test('runLocalAssistantFallback handles friendly chat, archive info, seat lookup, and media search cleanly', () => {
  const customSeats = DEFAULT_SEATS.map((s) =>
    s.seatNumber === 12
      ? { ...s, isAssigned: true, memberName: 'Lê Hoàng Nam', nickname: 'Nam C3' }
      : s
  );

  const ctx = {
    catalog: DEMO_MEDIA_ITEMS,
    events: DEFAULT_EVENTS,
    seats: customSeats,
    guestbook: [],
  };

  const greetRes = runLocalAssistantFallback('Chào bạn, bạn làm được gì?', ctx);
  assert.equal(greetRes.actions.length, 0);
  assert.ok(greetRes.reply.includes('10A3'));

  const statsRes = runLocalAssistantFallback('Lớp mình hiện có bao nhiêu ảnh và video?', ctx);
  assert.equal(statsRes.actions.length, 0);
  assert.ok(statsRes.reply.includes('ảnh') && statsRes.reply.includes('video'));

  const seatRes = runLocalAssistantFallback('Ai ngồi ghế số 12 vậy?', ctx);
  assert.equal(seatRes.actions.length, 0);
  assert.equal(seatRes.seats?.[0]?.memberName, 'Lê Hoàng Nam');

  const searchRes = runLocalAssistantFallback('Tìm ảnh hội trại lớp 10', ctx);
  assert.equal(searchRes.actions.length, 0);
  assert.ok(searchRes.matches.length >= 1);
  assert.ok(searchRes.matches.every((m) => m.yearCode === '10A3' && m.mediaType === 'image'));
});
