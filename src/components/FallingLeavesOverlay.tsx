import React, { useEffect, useRef } from 'react';
import {
  createLeafParticles,
  getLeafCountForWidth,
  stepLeafParticle,
  type LeafParticle,
} from '../utils/fallingLeaves';

interface FallingLeavesOverlayProps {
  enabled: boolean;
}

function drawLeafShape(ctx: CanvasRenderingContext2D, leaf: LeafParticle) {
  const s = leaf.size;
  const flutterScaleY = 0.48 + 0.52 * Math.abs(Math.cos(leaf.flutterPhase));

  ctx.save();
  ctx.translate(leaf.x, leaf.y);
  ctx.rotate(leaf.rotation);
  ctx.scale(1, flutterScaleY);
  ctx.globalAlpha = leaf.opacity;
  ctx.fillStyle = leaf.fill;
  ctx.strokeStyle = leaf.vein;
  ctx.lineWidth = Math.max(0.7, s * 0.06);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();

  if (leaf.shape === 'phoenix') {
    // Slender curved schoolyard phoenix leaf
    ctx.moveTo(0, -s);
    ctx.bezierCurveTo(s * 0.62, -s * 0.35, s * 0.55, s * 0.45, 0, s);
    ctx.bezierCurveTo(-s * 0.55, s * 0.45, -s * 0.62, -s * 0.35, 0, -s);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, -s * 0.82);
    ctx.quadraticCurveTo(s * 0.08, 0, 0, s * 0.92);
    ctx.stroke();
  } else if (leaf.shape === 'petal') {
    // Soft rounded blossom petal with subtle notch
    ctx.moveTo(0, s * 0.88);
    ctx.bezierCurveTo(-s * 0.85, s * 0.25, -s * 0.72, -s * 0.72, -s * 0.14, -s * 0.86);
    ctx.quadraticCurveTo(0, -s * 0.62, s * 0.14, -s * 0.86);
    ctx.bezierCurveTo(s * 0.72, -s * 0.72, s * 0.85, s * 0.25, 0, s * 0.88);
    ctx.closePath();
    ctx.fill();
  } else if (leaf.shape === 'ginkgo') {
    // Poetic fan-shaped ginkgo leaf
    ctx.moveTo(0, s * 0.85);
    ctx.lineTo(-s * 0.08, s * 0.28);
    ctx.bezierCurveTo(-s * 0.88, s * 0.1, -s * 0.96, -s * 0.58, -s * 0.12, -s * 0.76);
    ctx.quadraticCurveTo(0, -s * 0.42, s * 0.12, -s * 0.76);
    ctx.bezierCurveTo(s * 0.96, -s * 0.58, s * 0.88, s * 0.1, s * 0.08, s * 0.28);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, s * 0.85);
    ctx.lineTo(0, s * 0.1);
    ctx.stroke();
  } else {
    // Soft three-lobe autumn leaf
    ctx.moveTo(0, s * 0.92);
    ctx.lineTo(-s * 0.07, s * 0.42);
    ctx.bezierCurveTo(-s * 0.95, s * 0.45, -s * 1.05, -s * 0.1, -s * 0.42, -s * 0.18);
    ctx.bezierCurveTo(-s * 0.55, -s * 0.72, -s * 0.12, -s * 0.98, 0, -s * 0.98);
    ctx.bezierCurveTo(s * 0.12, -s * 0.98, s * 0.55, -s * 0.72, s * 0.42, -s * 0.18);
    ctx.bezierCurveTo(s * 1.05, -s * 0.1, s * 0.95, s * 0.45, s * 0.07, s * 0.42);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, s * 0.9);
    ctx.lineTo(0, -s * 0.7);
    ctx.stroke();
  }

  ctx.restore();
}

export const FallingLeavesOverlay: React.FC<FallingLeavesOverlayProps> = ({
  enabled,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const leavesRef = useRef<LeafParticle[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const clearCanvas = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      ctx.clearRect(0, 0, width, height);
    };

    if (!enabled) {
      clearCanvas();
      return;
    }

    let width = window.innerWidth;
    let height = window.innerHeight;
    let rafId = 0;
    let lastTs = performance.now();

    const syncSize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const targetCount = getLeafCountForWidth(width);
      if (leavesRef.current.length !== targetCount) {
        leavesRef.current = createLeafParticles(width, height, targetCount);
      }
    };

    syncSize();

    const renderFrame = (now: number) => {
      if (document.hidden) {
        lastTs = now;
        rafId = window.requestAnimationFrame(renderFrame);
        return;
      }

      const dt = (now - lastTs) / 1000;
      lastTs = now;
      const timeSec = now / 1000;

      ctx.clearRect(0, 0, width, height);

      const nextLeaves: LeafParticle[] = new Array(leavesRef.current.length);
      for (let i = 0; i < leavesRef.current.length; i += 1) {
        const updated = stepLeafParticle(
          leavesRef.current[i],
          width,
          height,
          dt,
          timeSec
        );
        nextLeaves[i] = updated;
        drawLeafShape(ctx, updated);
      }
      leavesRef.current = nextLeaves;

      rafId = window.requestAnimationFrame(renderFrame);
    };

    const onVisibilityChange = () => {
      lastTs = performance.now();
    };

    window.addEventListener('resize', syncSize);
    document.addEventListener('visibilitychange', onVisibilityChange);
    rafId = window.requestAnimationFrame(renderFrame);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', syncSize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled]);

  return (
    <div
      aria-hidden="true"
      data-testid="falling-leaves-overlay"
      data-leaves-active={enabled ? 'true' : 'false'}
      className={`pointer-events-none fixed inset-0 z-[25] overflow-hidden transition-opacity duration-300 ${
        enabled ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <canvas
        ref={canvasRef}
        data-testid="falling-leaves-canvas"
        className="block h-full w-full"
      />
    </div>
  );
};
