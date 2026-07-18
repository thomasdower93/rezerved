import React from 'react';

interface SeatBubblesProps {
  capacity: number;
  shape: 'circle' | 'square' | 'rectangle';
  scaleX?: number;
  scaleY?: number;
  isMobile?: boolean;
  isHighlighted?: boolean;
  renderMode?: 'editor' | 'customer';
}

interface ChairPos {
  x: number;   // offset from table centre (px)
  y: number;
  angle: number; // degrees — 0 = chair top faces upward, pointing outward from table
}

// How many seats go on each side for rect/square tables
function distributeSeats(
  num: number,
  shape: 'circle' | 'square' | 'rectangle',
  tableW: number,
  tableH: number,
): { top: number; bottom: number; left: number; right: number } {
  const isLandscape = tableW >= tableH;

  // For 2-seat: opposite ends only
  if (num <= 2) {
    if (shape === 'circle') return { top: 0, bottom: 0, left: 0, right: 0 };
    return isLandscape
      ? { top: 1, bottom: 1, left: 0, right: 0 }
      : { top: 0, bottom: 0, left: 1, right: 1 };
  }

  // For 4-seat: 1 per side
  if (num === 4) return { top: 1, bottom: 1, left: 1, right: 1 };

  // For 6-seat: prioritise long sides
  if (num === 6) {
    return isLandscape
      ? { top: 2, bottom: 2, left: 1, right: 1 }
      : { top: 1, bottom: 1, left: 2, right: 2 };
  }

  // For 8-seat: fill long sides with 3, short with 1
  if (num >= 8) {
    return isLandscape
      ? { top: 3, bottom: 3, left: 1, right: 1 }
      : { top: 1, bottom: 1, left: 3, right: 3 };
  }

  // 3 seats: 2 on long + 1 on short
  if (num === 3) {
    return isLandscape
      ? { top: 2, bottom: 1, left: 0, right: 0 }
      : { top: 0, bottom: 0, left: 2, right: 1 };
  }

  // 5 seats
  if (num === 5) {
    return isLandscape
      ? { top: 2, bottom: 2, left: 1, right: 0 }
      : { top: 1, bottom: 0, left: 2, right: 2 };
  }

  // 7 seats
  return isLandscape
    ? { top: 3, bottom: 3, left: 1, right: 0 }
    : { top: 1, bottom: 0, left: 3, right: 3 };
}

function getChairPositions(
  numChairs: number,
  shape: 'circle' | 'square' | 'rectangle',
  tableW: number,
  tableH: number,
): ChairPos[] {
  if (numChairs <= 0) return [];

  // Chair pad distance from table edge (px, visual)
  const GAP = 2.5;
  // Chair dimensions: wide, shallow — like a seat top viewed from above
  const CHAIR_H = 6;  // depth (radial direction)

  const positions: ChairPos[] = [];

  if (shape === 'circle') {
    const r = tableW / 2 + GAP + CHAIR_H / 2;
    for (let i = 0; i < numChairs; i++) {
      const angleDeg = (i * 360) / numChairs - 90;
      const angleRad = (angleDeg * Math.PI) / 180;
      positions.push({
        x: Math.cos(angleRad) * r,
        y: Math.sin(angleRad) * r,
        angle: angleDeg + 90,
      });
    }
    return positions;
  }

  const dist = distributeSeats(numChairs, shape, tableW, tableH);

  const placeRow = (
    side: 'top' | 'bottom' | 'left' | 'right',
    count: number,
    range: number,
    fixedDist: number,
    angleDeg: number,
  ) => {
    const isH = side === 'top' || side === 'bottom';
    for (let i = 0; i < count; i++) {
      // Spread across 70% of the table edge to leave clean margins
      const t = count === 1 ? 0 : (i / (count - 1) - 0.5) * range * 0.72;
      positions.push({
        x: isH ? t : (side === 'left' ? -fixedDist : fixedDist),
        y: isH ? (side === 'top' ? -fixedDist : fixedDist) : t,
        angle: angleDeg,
      });
    }
  };

  const hw = tableW / 2 + GAP + CHAIR_H / 2;
  const hh = tableH / 2 + GAP + CHAIR_H / 2;

  placeRow('top',    dist.top,    tableW, hh, 0);
  placeRow('bottom', dist.bottom, tableW, hh, 180);
  placeRow('left',   dist.left,   tableH, hw, 270);
  placeRow('right',  dist.right,  tableH, hw, 90);

  return positions;
}

// Width of a single chair, proportional to how many share that edge
function getChairWidth(
  side: number,  // count on this side
  tableEdge: number,  // edge length
): number {
  if (side <= 0) return 14;
  // Chair occupies up to ~58% of the edge divided by count, min 8 max 22
  return Math.max(8, Math.min(22, (tableEdge * 0.58) / side));
}

export function SeatBubbles({
  capacity,
  shape,
  scaleX = 1,
  scaleY = 1,
  isMobile = false,
  isHighlighted = false,
  renderMode = 'editor',
}: SeatBubblesProps) {
  const mobileScale = isMobile ? 0.75 : 1;

  // Table visual dimensions — must mirror TableMarker's getBaseDimensions + scale
  const baseW = shape === 'rectangle' ? 80 : 64;
  const baseH = shape === 'rectangle' ? 56 : 64;
  const uniformScale = shape === 'circle' || shape === 'square' ? scaleX : 1;
  const tableW = baseW * (shape === 'rectangle' ? scaleX : uniformScale) * mobileScale;
  const tableH = baseH * (shape === 'rectangle' ? scaleY : uniformScale) * mobileScale;

  const numChairs = Math.min(Math.max(capacity || 4, 0), 8);
  if (numChairs === 0) return null;

  // Hide when table is tiny
  if (tableW < 24 || tableH < 24) return null;

  const chairs = getChairPositions(numChairs, shape, tableW, tableH);

  // Per-chair width depends on how many share a side
  const dist = shape !== 'circle'
    ? distributeSeats(numChairs, shape, tableW, tableH)
    : { top: 0, bottom: 0, left: 0, right: 0 };

  const CHAIR_H = 6 * mobileScale;
  const CHAIR_R = 2 * mobileScale;

  // Map angle → side to get the right chair width
  const getWidth = (angle: number): number => {
    if (shape === 'circle') return Math.max(8, tableW * 0.22) * mobileScale;
    const norm = ((angle % 360) + 360) % 360;
    if (norm < 45 || norm >= 315) return getChairWidth(dist.top, tableW) * mobileScale;
    if (norm >= 135 && norm < 225) return getChairWidth(dist.bottom, tableW) * mobileScale;
    if (norm >= 225 && norm < 315) return getChairWidth(dist.left, tableH) * mobileScale;
    return getChairWidth(dist.right, tableH) * mobileScale;
  };

  const opacity = renderMode === 'customer'
    ? (isHighlighted ? 0.82 : 0.55)
    : 0.75;

  return (
    <>
      {chairs.map((pos, i) => {
        const cw = getWidth(pos.angle);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `calc(50% + ${pos.x}px)`,
              top: `calc(50% + ${pos.y}px)`,
              width: `${cw}px`,
              height: `${CHAIR_H}px`,
              borderRadius: `${CHAIR_R}px`,
              transform: `translate(-50%, -50%) rotate(${pos.angle}deg)`,
              // Warm amber-bronze gradient matching the advert's gold table palette
              background: 'linear-gradient(180deg, #7a5828 0%, #5a3e18 35%, #3a2810 70%, #2a1e0c 100%)',
              border: '0.5px solid rgba(210,165,70,0.45)',
              boxShadow: '0 1px 2px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,220,130,0.14)',
              opacity,
              pointerEvents: 'none',
            }}
          />
        );
      })}
    </>
  );
}
