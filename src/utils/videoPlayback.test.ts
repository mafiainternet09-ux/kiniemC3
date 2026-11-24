import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractYoutubeVideoIdOrNull,
  needsWebTranscode,
  parseFfmpegProgressPercent,
  resolveSafeUploadRelativePath,
} from './videoPlayback';

test('needsWebTranscode classifies MP4 H264 as ready, MOV H264 as remux, and HEVC 10-bit as transcode', () => {
  assert.equal(needsWebTranscode({ ext: '.mp4', codecName: 'h264', pixFmt: 'yuv420p' }), 'ready');
  assert.equal(needsWebTranscode({ ext: '.mov', codecName: 'h264', pixFmt: 'yuv420p' }), 'remux');
  assert.equal(needsWebTranscode({ ext: '.mov', codecName: 'hevc', pixFmt: 'yuv420p10le' }), 'transcode');
  assert.equal(needsWebTranscode({ ext: '.mp4', codecName: 'hevc', pixFmt: 'yuv420p10le' }), 'transcode');
  assert.equal(needsWebTranscode({ ext: '.avi', codecName: 'mpeg4', pixFmt: 'yuv420p' }), 'transcode');
});

test('resolveSafeUploadRelativePath rejects traversal, .tmp paths, and external URLs', () => {
  assert.equal(
    resolveSafeUploadRelativePath('/uploads/12C3/video/clip.mov?t=1'),
    '12C3/video/clip.mov'
  );
  assert.equal(resolveSafeUploadRelativePath('/uploads/../server.ts'), null);
  assert.equal(resolveSafeUploadRelativePath('/uploads/.tmp/secret.part'), null);
  assert.equal(resolveSafeUploadRelativePath('https://example.com/video.mp4'), null);
});

test('parseFfmpegProgressPercent parses out_time_us accurately and clamps to 1..99', () => {
  assert.equal(parseFfmpegProgressPercent('frame=10\nout_time_us=50000000\n', 100), 50);
  assert.equal(parseFfmpegProgressPercent('out_time_us=120000000\n', 100), 99);
  assert.equal(parseFfmpegProgressPercent('out_time_us=100\n', 0), null);
});

test('extractYoutubeVideoIdOrNull extracts YouTube IDs without returning fallback for non-YouTube URLs', () => {
  assert.equal(extractYoutubeVideoIdOrNull('https://www.youtube.com/watch?v=GgQFO8dL5XQ'), 'GgQFO8dL5XQ');
  assert.equal(extractYoutubeVideoIdOrNull('https://youtu.be/GgQFO8dL5XQ'), 'GgQFO8dL5XQ');
  assert.equal(extractYoutubeVideoIdOrNull('/uploads/12C3/video/clip.mp4'), null);
  assert.equal(extractYoutubeVideoIdOrNull('https://example.com/clip.mp4'), null);
});
