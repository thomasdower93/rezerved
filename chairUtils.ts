import { ChairData, V2LayoutObject } from './types';

function uid(): string {
  return `ch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// ── Distribution helpers ────────────────────────────────────────────────────

function distributeAcrossSides(
  num: number,
  isLandscape: boolean,
): { top: number; bottom: number; left: number; right: number } {
  if (num <= 0) return { top: 0, bottom: 0, left: 0, right: 0 };
  if (num <= 2) return isLandscape
    ? { top: 1, bottom: 1, left: 0, right: 0 }
    : { top: 0, bottom: 0, left: 1, right: 1 };
  if (num === 3) return isLandscape
    ? { top: 2, bottom: 1, left: 0, right: 0 }
    : { top: 0, bottom: 0, left: 2, right: 1 };
  if (num === 4) return { top: 1, bottom: 1, left: 1, right: 1 };
  if (num === 5) return isLandscape
    ? { top: 2, bottom: 2, left: 1, right: 0 }
    : { top: 1, bottom: 0, left: 2, right: 2 };
  if (num === 6) return isLandscape
    ? { top: 2, bottom: 2, left: 1, right: 1 }
    : { top: 1, bottom: 1, left: 2, right: 2 };
  if (num === 7) return isLandscape
    ? { top: 3, bottom: 3, left: 1, right: 0 }
    : { top: 1, bottom: 0, left: 3, right: 3 };
  // 8+
  return isLandscape
    ? { top: 3, bottom: 3, left: 1, right: 1 }
    : { top: 1, bottom: 1, left: 3, right: 3 };
}

// ── Default chair dimensions ────────────────────────────────────────────────
// These are in world-space pixels, proportional to the table.

function chairDimsFor(tableW: number, tableH: number, count: number, side: 'top' | 'bottom' | 'left' | 'right'): { w: number; h: number } {
  const isH = side === 'top' || side === 'bottom';
  const edgeLen = isH ? tableW : tableH;
  const otherLen = isH ? tableH : tableW;
  const w = Math.max(10, Math.min(32, (edgeLen * 0.62) / Math.max(1, count)));
  const h = Math.max(8, otherLen * 0.13);
  return { w, h };
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Generate a default chair layout for a table object.
 * Returns a fresh array of ChairData objects, all in table-local coordinates.
 */
export function generateDefaultChairs(obj: V2LayoutObject): ChairData[] {
  const { width: tw, height: th, shape, capacity } = obj;
  const num = Math.min(Math.max(capacity || 4, 0), 8);
  if (num === 0) return [];

  const chairs: ChairData[] = [];

  if (shape === 'circle' || !shape) {
    // Evenly around the circle
    const GAP = Math.max(2, tw * 0.06);
    const chairH = Math.max(8, tw * 0.14);
    const chairW = Math.max(10, tw * 0.28);
    const r = tw / 2 + GAP + chairH / 2;
    for (let i = 0; i < num; i++) {
      const angleDeg = (i * 360) / num - 90;
      const angleRad = (angleDeg * Math.PI) / 180;
      chairs.push({
        id: uid(),
        x: Math.round(Math.cos(angleRad) * r),
        y: Math.round(Math.sin(angleRad) * r),
        rotation: angleDeg + 90,
        width: Math.round(chairW),
        height: Math.round(chairH),
        shape: 'rounded-rect',
      });
    }
    return chairs;
  }

  // Rectangle / square
  const isLandscape = tw >= th;
  const dist = distributeAcrossSides(num, isLandscape);
  const GAP = Math.max(2, Math.min(tw, th) * 0.04);

  const placeSide = (side: 'top' | 'bottom' | 'left' | 'right', count: number) => {
    if (count === 0) return;
    const isH = side === 'top' || side === 'bottom';
    const edgeLen = isH ? tw : th;
    const { w: cw, h: ch } = chairDimsFor(tw, th, count, side);
    const fixedDist = (isH ? th / 2 : tw / 2) + GAP + ch / 2;
    const angleDeg = side === 'top' ? 0 : side === 'bottom' ? 180 : side === 'left' ? 270 : 90;

    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : (i / (count - 1) - 0.5) * edgeLen * 0.72;
      chairs.push({
        id: uid(),
        x: Math.round(isH ? t : (side === 'left' ? -fixedDist : fixedDist)),
        y: Math.round(isH ? (side === 'top' ? -fixedDist : fixedDist) : t),
        rotation: angleDeg,
        width: Math.round(cw),
        height: Math.round(ch),
        shape: 'rounded-rect',
      });
    }
  };

  placeSide('top', dist.top);
  placeSide('bottom', dist.bottom);
  placeSide('left', dist.left);
  placeSide('right', dist.right);

  return chairs;
}

/**
 * Add a single default chair to an existing chair array for the given table.
 * Placed at a slight offset so it is visible immediately.
 */
export function addDefaultChair(obj: V2LayoutObject): ChairData {
  const { width: tw, height: th } = obj;
  const offset = tw / 2 + Math.max(6, tw * 0.1);
  return {
    id: uid(),
    x: 0,
    y: -(offset),
    rotation: 0,
    width: Math.round(Math.max(10, tw * 0.28)),
    height: Math.round(Math.max(8, th * 0.14)),
    shape: 'rounded-rect',
  };
}

/**
 * Get the effective chairs for a table object.
 * If the object has no chairs array, generates defaults based on capacity.
 * If it has an explicit empty array `[]`, returns nothing (staff cleared them).
 */
export function getEffectiveChairs(obj: V2LayoutObject): ChairData[] {
  if (obj.type !== 'table' && obj.type !== 'booth') return [];
  if (obj.chairs !== undefined) return obj.chairs;
  // No chairs property at all → auto-generate for backwards compat
  return generateDefaultChairs(obj);
}
