import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEAVES_STORAGE_KEY,
  createLeafParticles,
  getLeafCountForWidth,
  readLeavesPreference,
  stepLeafParticle,
  writeLeavesPreference,
} from './fallingLeaves';

function createMemoryStorage(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

test('readLeavesPreference defaults to true unless reduced motion is active or stored false', () => {
  assert.equal(readLeavesPreference(createMemoryStorage(), false), true);
  assert.equal(readLeavesPreference(createMemoryStorage(), true), false);
  assert.equal(
    readLeavesPreference(createMemoryStorage({ [LEAVES_STORAGE_KEY]: 'false' }), false),
    false
  );
  assert.equal(
    readLeavesPreference(createMemoryStorage({ [LEAVES_STORAGE_KEY]: 'true' }), true),
    true
  );
});

test('writeLeavesPreference persists boolean flag as string', () => {
  const storage = createMemoryStorage();
  writeLeavesPreference(false, storage);
  assert.equal(storage.getItem(LEAVES_STORAGE_KEY), 'false');
  assert.equal(readLeavesPreference(storage, false), false);

  writeLeavesPreference(true, storage);
  assert.equal(storage.getItem(LEAVES_STORAGE_KEY), 'true');
  assert.equal(readLeavesPreference(storage, true), true);
});

test('getLeafCountForWidth scales cleanly across mobile and desktop viewports', () => {
  assert.equal(getLeafCountForWidth(390), 20);
  assert.equal(getLeafCountForWidth(768), 28);
  assert.equal(getLeafCountForWidth(1440), 36);
});

test('createLeafParticles produces bounded, valid particles', () => {
  let seed = 0.25;
  const deterministicRng = () => {
    seed = (seed * 9301 + 49297) % 233280 / 233280;
    return seed;
  };
  const leaves = createLeafParticles(1440, 900, 12, deterministicRng);
  assert.equal(leaves.length, 12);
  for (const leaf of leaves) {
    assert.ok(leaf.x >= 0 && leaf.x <= 1440);
    assert.ok(leaf.y >= 0 && leaf.y <= 900);
    assert.ok(leaf.size >= 9 && leaf.size <= 18);
    assert.ok(leaf.vy > 0);
    assert.ok(leaf.opacity > 0 && leaf.opacity <= 1);
  }
});

test('stepLeafParticle moves downward and wraps seamlessly past viewport edges', () => {
  const [leaf] = createLeafParticles(1200, 800, 1, () => 0.5);
  const moved = stepLeafParticle(leaf, 1200, 800, 0.04, 1.0);
  assert.ok(moved.y > leaf.y);

  // Spike dt is clamped to 0.05s
  const spiked = stepLeafParticle(leaf, 1200, 800, 5.0, 1.0);
  assert.ok(spiked.y - leaf.y <= leaf.vy * 0.05 + 0.001);

  // Bottom wrap-around returns particle above the top edge
  const nearBottom = { ...leaf, y: 800 + leaf.size * 2 + 1 };
  const wrapped = stepLeafParticle(nearBottom, 1200, 800, 0.02, 1.0);
  assert.ok(wrapped.y < 0);
  assert.ok(wrapped.x >= 0 && wrapped.x <= 1200);
});
