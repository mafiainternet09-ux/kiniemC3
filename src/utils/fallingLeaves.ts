export type LeafShape = 'phoenix' | 'maple' | 'petal' | 'ginkgo';

export interface LeafPaletteEntry {
  fill: string;
  vein: string;
}

export interface LeafParticle {
  x: number;
  y: number;
  size: number;
  vy: number;
  vxDrift: number;
  swayAmp: number;
  swayFreq: number;
  swayPhase: number;
  rotation: number;
  rotSpeed: number;
  flutterPhase: number;
  flutterSpeed: number;
  opacity: number;
  shape: LeafShape;
  fill: string;
  vein: string;
}

export const LEAVES_STORAGE_KEY = 'c3_falling_leaves_enabled';

export const LEAF_PALETTE: LeafPaletteEntry[] = [
  { fill: '#FB7185', vein: '#FFE4E6' }, // Phoenix rose
  { fill: '#F43F5E', vein: '#FECDD3' }, // Red phoenix blossom
  { fill: '#F59E0B', vein: '#FEF3C7' }, // Golden autumn leaf
  { fill: '#FB923C', vein: '#FFEDD5' }, // Sunset tangerine leaf
  { fill: '#F472B6', vein: '#FCE7F3' }, // Soft sakura petal
  { fill: '#FBBF24', vein: '#FFFBEB' }, // Sunlit amber leaf
  { fill: '#34D399', vein: '#D1FAE5' }, // Fresh spring leaf
];

const LEAF_SHAPES: LeafShape[] = ['phoenix', 'petal', 'maple', 'ginkgo', 'phoenix', 'petal'];

export function readLeavesPreference(
  storage?: Pick<Storage, 'getItem'> | null,
  prefersReducedMotion = false
): boolean {
  try {
    const raw = storage?.getItem(LEAVES_STORAGE_KEY);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
  } catch {
    // Ignore storage access failures in restricted contexts
  }
  return !prefersReducedMotion;
}

export function writeLeavesPreference(
  enabled: boolean,
  storage?: Pick<Storage, 'setItem'> | null
): void {
  try {
    storage?.setItem(LEAVES_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignore storage write errors
  }
}

export function getLeafCountForWidth(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 24;
  if (width < 640) return 20;
  if (width < 1024) return 28;
  return 36;
}

export function createLeafParticles(
  width: number,
  height: number,
  count = getLeafCountForWidth(width),
  rng: () => number = Math.random
): LeafParticle[] {
  const safeW = Math.max(width, 320);
  const safeH = Math.max(height, 480);
  const particles: LeafParticle[] = [];

  for (let i = 0; i < count; i += 1) {
    const palette = LEAF_PALETTE[Math.floor(rng() * LEAF_PALETTE.length) % LEAF_PALETTE.length];
    const shape = LEAF_SHAPES[Math.floor(rng() * LEAF_SHAPES.length) % LEAF_SHAPES.length];
    const size = 9 + rng() * 9; // 9px - 18px

    particles.push({
      x: rng() * safeW,
      y: rng() * safeH,
      size,
      vy: 24 + rng() * 30, // 24 - 54 px/s gentle float
      vxDrift: -8 + rng() * 18, // gentle breeze
      swayAmp: 12 + rng() * 22,
      swayFreq: 0.7 + rng() * 0.9,
      swayPhase: rng() * Math.PI * 2,
      rotation: rng() * Math.PI * 2,
      rotSpeed: (-0.8 + rng() * 1.6),
      flutterPhase: rng() * Math.PI * 2,
      flutterSpeed: 1.4 + rng() * 2.0,
      opacity: 0.45 + rng() * 0.37,
      shape,
      fill: palette.fill,
      vein: palette.vein,
    });
  }

  return particles;
}

export function stepLeafParticle(
  leaf: LeafParticle,
  width: number,
  height: number,
  dtSec: number,
  timeSec: number
): LeafParticle {
  const safeW = Math.max(width, 320);
  const safeH = Math.max(height, 480);
  const clampedDt = Math.max(0, Math.min(dtSec, 0.05));
  const margin = leaf.size * 2;

  const swayVx = Math.sin(timeSec * leaf.swayFreq + leaf.swayPhase) * leaf.swayAmp;
  let nextX = leaf.x + (leaf.vxDrift + swayVx) * clampedDt;
  let nextY = leaf.y + leaf.vy * clampedDt;

  if (nextY > safeH + margin) {
    nextY = -margin;
    nextX = ((nextX % safeW) + safeW) % safeW;
  }

  if (nextX < -margin) {
    nextX = safeW + margin;
  } else if (nextX > safeW + margin) {
    nextX = -margin;
  }

  return {
    ...leaf,
    x: nextX,
    y: nextY,
    rotation: leaf.rotation + leaf.rotSpeed * clampedDt,
    flutterPhase: leaf.flutterPhase + leaf.flutterSpeed * clampedDt,
  };
}
