import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUploadChunkPlan,
  calculateChunkedProgressPercent,
  MAX_MEDIA_UPLOAD_BYTES,
  sanitizeUploadSessionId,
  UPLOAD_CHUNK_BYTES,
} from './uploadChunking';

test('buildUploadChunkPlan splits large files into bounded <= 4MB chunks cleanly', () => {
  assert.equal(UPLOAD_CHUNK_BYTES, 4 * 1024 * 1024);
  assert.equal(MAX_MEDIA_UPLOAD_BYTES, 1024 * 1024 * 1024);

  const plan = buildUploadChunkPlan(10 * 1024 * 1024 + 512, UPLOAD_CHUNK_BYTES);
  assert.equal(plan.length, 3);
  assert.deepEqual(
    plan.map((c) => c.byteLength),
    [4 * 1024 * 1024, 4 * 1024 * 1024, 2 * 1024 * 1024 + 512]
  );
  assert.equal(plan[0].start, 0);
  assert.equal(plan[2].end, 10 * 1024 * 1024 + 512);
  assert.deepEqual(buildUploadChunkPlan(0), []);
});

test('sanitizeUploadSessionId strips path traversal characters and enforces safe length', () => {
  assert.equal(sanitizeUploadSessionId('../../etc/passwd'), 'etcpasswd');
  assert.equal(sanitizeUploadSessionId('up-123456-abc'), 'up-123456-abc');
  assert.ok(sanitizeUploadSessionId('short').length >= 8);
});

test('calculateChunkedProgressPercent progresses monotonically from 1 to 99', () => {
  const totalBytes = 10 * 1024 * 1024;
  const p0 = calculateChunkedProgressPercent(0, 2 * 1024 * 1024, 3, totalBytes);
  const p1 = calculateChunkedProgressPercent(1, 2 * 1024 * 1024, 3, totalBytes);
  const p2 = calculateChunkedProgressPercent(2, 2 * 1024 * 1024, 3, totalBytes);
  assert.equal(p0, 20);
  assert.equal(p1, 60);
  assert.equal(p2, 99);
});
