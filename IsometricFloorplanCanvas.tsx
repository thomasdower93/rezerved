import React, { useRef, useEffect, useCallback, useState } from 'react';
import { V2LayoutData, V2LayoutObject, RoomPolygon } from '../lib/types';

interface IsometricFloorplanCanvasProps {
  layout: V2LayoutData;
  rooms: RoomPolygon[];
  tableStatusMap?: Record<string, 'green' | 'yellow' | 'red'>;
  recommendedObjectId?: string | null;
  windowSeatIds?: Set<string>;
  tagsMap?: Record<string, string[]>;
  selectedAreaId?: string | null;
  onObjectSelect?: (id: string | null) => void;
}

const WALL_HEIGHT = 60;
const TABLE_HEIGHT = 18;
const FLOOR_HEIGHT = 4;

type ToScreenFn = (wx: number, wy: number, wz: number) => [number, number];


function getFloorColor(style: RoomPolygon['floorStyle']): { base: string; dark: string; light: string } {
  switch (style) {
    case 'solid_wood': return { base: '#8B6534', dark: '#6B4A22', light: '#B8874A' };
    case 'wood': return { base: '#5c3d18', dark: '#3d2810', light: '#7a5428' };
    case 'herringbone': return { base: '#6b4a22', dark: '#4a3212', light: '#8B6434' };
    case 'tile': return { base: '#c8c0b4', dark: '#a8a098', light: '#e0d8cc' };
    case 'carpet': return { base: '#5c3d6e', dark: '#3e2852', light: '#7a5490' };
    case 'concrete': return { base: '#a8a4a0', dark: '#888480', light: '#c8c4c0' };
    case 'gravel': return { base: '#9c9490', dark: '#7c7470', light: '#bcb4b0' };
    case 'grass': return { base: '#3a5e30', dark: '#2a4220', light: '#4e7a42' };
    case 'decking': return { base: '#9B7520', dark: '#7B5510', light: '#bB9530' };
    case 'paving': return { base: '#b8b0a8', dark: '#989088', light: '#d8d0c8' };
    case 'car_park': return { base: '#4a4a4a', dark: '#2a2a2a', light: '#6a6a6a' };
    default: return { base: '#6b4a22', dark: '#4a3212', light: '#8B6434' };
  }
}

function lighten(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.min(255, r + (255 - r) * amount)},${Math.min(255, g + (255 - g) * amount)},${Math.min(255, b + (255 - b) * amount)})`;
}

function darken(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.max(0, r * (1 - amount))},${Math.max(0, g * (1 - amount))},${Math.max(0, b * (1 - amount))})`;
}

function drawIsoRoom(
  ctx: CanvasRenderingContext2D,
  vertices: Array<{ x: number; y: number }>,
  floorStyle: RoomPolygon['floorStyle'],
  toScreen: ToScreenFn
) {
  if (vertices.length < 3) return;
  const colors = getFloorColor(floorStyle);

  ctx.beginPath();
  const [sx0, sy0] = toScreen(vertices[0].x, vertices[0].y, 0);
  ctx.moveTo(sx0, sy0);
  for (let i = 1; i < vertices.length; i++) {
    const [sx, sy] = toScreen(vertices[i].x, vertices[i].y, 0);
    ctx.lineTo(sx, sy);
  }
  ctx.closePath();

  const grad = ctx.createLinearGradient(sx0 - 50, sy0 - 50, sx0 + 100, sy0 + 100);
  grad.addColorStop(0, colors.light);
  grad.addColorStop(0.5, colors.base);
  grad.addColorStop(1, colors.dark);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const isExterior = ['gravel', 'grass', 'car_park', 'decking', 'paving'].includes(floorStyle);
  if (!isExterior) {
    const plankCount = 8;
    const minX = Math.min(...vertices.map(v => v.x));
    const maxX = Math.max(...vertices.map(v => v.x));
    const step = (maxX - minX) / plankCount;
    ctx.save();
    ctx.beginPath();
    const [sx00, sy00] = toScreen(vertices[0].x, vertices[0].y, 0);
    ctx.moveTo(sx00, sy00);
    for (let i = 1; i < vertices.length; i++) {
      const [sx, sy] = toScreen(vertices[i].x, vertices[i].y, 0);
      ctx.lineTo(sx, sy);
    }
    ctx.closePath();
    ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 0.8;
    for (let x = minX; x <= maxX; x += step) {
      const minY = Math.min(...vertices.map(v => v.y));
      const maxY = Math.max(...vertices.map(v => v.y));
      const [ax, ay] = toScreen(x, minY - 50, 0);
      const [bx, by] = toScreen(x, maxY + 50, 0);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawIsoWalls(
  ctx: CanvasRenderingContext2D,
  vertices: Array<{ x: number; y: number }>,
  floorStyle: RoomPolygon['floorStyle'],
  toScreen: ToScreenFn,
  windowObjects: V2LayoutObject[]
) {
  if (vertices.length < 2) return;
  const isExterior = ['gravel', 'grass', 'car_park', 'decking', 'paving'].includes(floorStyle);
  if (isExterior) return;

  const wallH = WALL_HEIGHT;

  for (let i = 0; i < vertices.length; i++) {
    const v0 = vertices[i];
    const v1 = vertices[(i + 1) % vertices.length];

    const dx = v1.x - v0.x;
    const dy = v1.y - v0.y;
    const norm = Math.sqrt(dx * dx + dy * dy);
    if (norm < 0.01) continue;
    const nx = dy / norm;
    const ny = -dx / norm;
    const outward = nx + ny;
    if (outward <= 0) continue;

    const [sx0, sy0] = toScreen(v0.x, v0.y, 0);
    const [sx1, sy1] = toScreen(v1.x, v1.y, 0);
    const [sx0t, sy0t] = toScreen(v0.x, v0.y, wallH);
    const [sx1t, sy1t] = toScreen(v1.x, v1.y, wallH);

    ctx.beginPath();
    ctx.moveTo(sx0, sy0);
    ctx.lineTo(sx1, sy1);
    ctx.lineTo(sx1t, sy1t);
    ctx.lineTo(sx0t, sy0t);
    ctx.closePath();

    const wallGrad = ctx.createLinearGradient(sx0, sy0, sx1t, sy1t);
    wallGrad.addColorStop(0, 'rgba(240,228,210,0.95)');
    wallGrad.addColorStop(0.4, 'rgba(228,216,196,0.92)');
    wallGrad.addColorStop(1, 'rgba(200,188,168,0.88)');
    ctx.fillStyle = wallGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    drawWindowsOnWall(ctx, v0, v1, wallH, windowObjects, toScreen);
  }
}

function drawWindowsOnWall(
  ctx: CanvasRenderingContext2D,
  v0: { x: number; y: number },
  v1: { x: number; y: number },
  wallH: number,
  windowObjects: V2LayoutObject[],
  toScreen: ToScreenFn
) {
  const wallLen = Math.hypot(v1.x - v0.x, v1.y - v0.y);
  if (wallLen < 0.01) return;

  const wdx = (v1.x - v0.x) / wallLen;
  const wdy = (v1.y - v0.y) / wallLen;

  for (const win of windowObjects) {
    const px = win.worldX - v0.x;
    const py = win.worldY - v0.y;
    const proj = px * wdx + py * wdy;
    const perp = Math.abs(px * (-wdy) + py * wdx);

    if (perp > 30 || proj < 0 || proj > wallLen) continue;

    const winHalfW = Math.max(win.width, win.height) / 2 * 0.9;
    const t0 = proj - winHalfW;
    const t1 = proj + winHalfW;
    const winBase = wallH * 0.25;
    const winTop = wallH * 0.80;

    const p0 = { x: v0.x + wdx * t0, y: v0.y + wdy * t0 };
    const p1 = { x: v0.x + wdx * t1, y: v0.y + wdy * t1 };

    const [x0b, y0b] = toScreen(p0.x, p0.y, winBase);
    const [x1b, y1b] = toScreen(p1.x, p1.y, winBase);
    const [x0t, y0t] = toScreen(p0.x, p0.y, winTop);
    const [x1t, y1t] = toScreen(p1.x, p1.y, winTop);

    ctx.beginPath();
    ctx.moveTo(x0b, y0b);
    ctx.lineTo(x1b, y1b);
    ctx.lineTo(x1t, y1t);
    ctx.lineTo(x0t, y0t);
    ctx.closePath();
    const glassGrad = ctx.createLinearGradient(x0t, y0t, x1b, y1b);
    glassGrad.addColorStop(0, 'rgba(160,210,240,0.55)');
    glassGrad.addColorStop(0.4, 'rgba(200,235,255,0.38)');
    glassGrad.addColorStop(1, 'rgba(100,170,210,0.45)');
    ctx.fillStyle = glassGrad;
    ctx.fill();

    ctx.strokeStyle = 'rgba(180,220,255,0.70)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const xMidB = (x0b + x1b) / 2;
    const yMidB = (y0b + y1b) / 2;
    const xMidT = (x0t + x1t) / 2;
    const yMidT = (y0t + y1t) / 2;

    ctx.beginPath();
    ctx.moveTo(xMidB, yMidB);
    ctx.lineTo(xMidT, yMidT);
    ctx.strokeStyle = 'rgba(180,220,255,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const xMidL = (x0b + x0t) / 2;
    const yMidL = (y0b + y0t) / 2;
    const xMidR = (x1b + x1t) / 2;
    const yMidR = (y1b + y1t) / 2;
    ctx.beginPath();
    ctx.moveTo(xMidL, yMidL);
    ctx.lineTo(xMidR, yMidR);
    ctx.strokeStyle = 'rgba(180,220,255,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x0b, y0b);
    ctx.lineTo(x0t, y0t);
    ctx.lineTo(x1t, y1t);
    ctx.lineTo(x1b, y1b);
    ctx.strokeStyle = 'rgba(220,190,140,0.85)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    const highlight = ctx.createLinearGradient(x0t, y0t, x1t, y1t);
    highlight.addColorStop(0, 'rgba(255,255,255,0.0)');
    highlight.addColorStop(0.3, 'rgba(255,255,255,0.35)');
    highlight.addColorStop(0.7, 'rgba(255,255,255,0.15)');
    highlight.addColorStop(1, 'rgba(255,255,255,0.0)');
    ctx.beginPath();
    ctx.moveTo(x0t, y0t);
    ctx.lineTo(x1t, y1t);
    ctx.strokeStyle = highlight;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

type TableStatus = 'green' | 'yellow' | 'red' | undefined;

function getTableColors(status: TableStatus, isRecommended: boolean) {
  if (isRecommended) return { top: '#2a6a44', side: '#1a4a2e', rim: '#4acc84', glow: 'rgba(74,200,120,0.4)' };
  if (status === 'green') return { top: '#1e4a34', side: '#143020', rim: '#3aaa64', glow: 'rgba(52,211,153,0.25)' };
  if (status === 'yellow') return { top: '#4a3a18', side: '#332808', rim: '#c09030', glow: 'rgba(200,160,60,0.25)' };
  if (status === 'red') return { top: '#3a1818', side: '#280808', rim: '#882222', glow: 'rgba(0,0,0,0)' };
  return { top: '#3a3a4a', side: '#252530', rim: '#5a5a72', glow: 'rgba(0,0,0,0)' };
}

function drawIsoBox(
  ctx: CanvasRenderingContext2D,
  corners: Array<{ x: number; y: number }>,
  baseZ: number,
  boxH: number,
  sideColor: string,
  topGrad: CanvasGradient | string,
  rimColor: string,
  toScreen: ToScreenFn,
  alpha = 1.0
) {
  ctx.globalAlpha = alpha;
  for (let i = 0; i < corners.length; i++) {
    const c0 = corners[i];
    const c1 = corners[(i + 1) % corners.length];
    const dx = c1.x - c0.x;
    const dy = c1.y - c0.y;
    if (dy + dx < 0) continue;
    const [sx0, sy0] = toScreen(c0.x, c0.y, baseZ);
    const [sx1, sy1] = toScreen(c1.x, c1.y, baseZ);
    const [sx0t, sy0t] = toScreen(c0.x, c0.y, baseZ + boxH);
    const [sx1t, sy1t] = toScreen(c1.x, c1.y, baseZ + boxH);
    ctx.beginPath();
    ctx.moveTo(sx0, sy0); ctx.lineTo(sx1, sy1); ctx.lineTo(sx1t, sy1t); ctx.lineTo(sx0t, sy0t);
    ctx.closePath();
    ctx.fillStyle = sideColor;
    ctx.fill();
    ctx.strokeStyle = rimColor;
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  ctx.beginPath();
  const [t0x, t0y] = toScreen(corners[0].x, corners[0].y, baseZ + boxH);
  ctx.moveTo(t0x, t0y);
  for (let i = 1; i < corners.length; i++) {
    const [tx, ty] = toScreen(corners[i].x, corners[i].y, baseZ + boxH);
    ctx.lineTo(tx, ty);
  }
  ctx.closePath();
  ctx.fillStyle = topGrad;
  ctx.fill();
  ctx.strokeStyle = rimColor;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = 1.0;
}

function drawIsoTable(
  ctx: CanvasRenderingContext2D,
  obj: V2LayoutObject,
  status: TableStatus,
  isRecommended: boolean,
  isHovered: boolean,
  toScreen: ToScreenFn
) {
  const { worldX, worldY, width, height, shape } = obj;
  const hw = width / 2;
  const hh = height / 2;
  const th = TABLE_HEIGHT * (isHovered ? 1.15 : 1);
  const colors = getTableColors(status, isRecommended);

  if (status !== 'red' && (isRecommended || status === 'green' || status === 'yellow')) {
    const [cx, cy] = toScreen(worldX, worldY, th / 2);
    const screenCornersForGlow = [
      toScreen(worldX - hw, worldY - hh, 0),
      toScreen(worldX + hw, worldY + hh, 0),
    ];
    const glowR = Math.max(
      Math.abs(screenCornersForGlow[1][0] - screenCornersForGlow[0][0]),
      Math.abs(screenCornersForGlow[1][1] - screenCornersForGlow[0][1])
    ) * 0.7;
    const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
    glowGrad.addColorStop(0, colors.glow);
    glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.ellipse(cx, cy, glowR * 1.8, glowR * 0.9, 0, 0, Math.PI * 2);
    ctx.fillStyle = glowGrad;
    ctx.fill();
  }

  const corners = shape === 'circle'
    ? (() => {
        const segs = 16;
        return Array.from({ length: segs }, (_, i) => {
          const a = (i / segs) * Math.PI * 2;
          return { x: worldX + Math.cos(a) * hw, y: worldY + Math.sin(a) * hh };
        });
      })()
    : [
        { x: worldX - hw, y: worldY - hh },
        { x: worldX + hw, y: worldY - hh },
        { x: worldX + hw, y: worldY + hh },
        { x: worldX - hw, y: worldY + hh },
      ];

  for (let i = 0; i < corners.length; i++) {
    const c0 = corners[i];
    const c1 = corners[(i + 1) % corners.length];
    const dx = c1.x - c0.x;
    const dy = c1.y - c0.y;
    const nx = dy;
    const ny = -dx;
    if (nx + ny < 0) continue;
    const [sx0, sy0] = toScreen(c0.x, c0.y, FLOOR_HEIGHT);
    const [sx1, sy1] = toScreen(c1.x, c1.y, FLOOR_HEIGHT);
    const [sx0t, sy0t] = toScreen(c0.x, c0.y, FLOOR_HEIGHT + th);
    const [sx1t, sy1t] = toScreen(c1.x, c1.y, FLOOR_HEIGHT + th);
    ctx.beginPath();
    ctx.moveTo(sx0, sy0); ctx.lineTo(sx1, sy1); ctx.lineTo(sx1t, sy1t); ctx.lineTo(sx0t, sy0t);
    ctx.closePath();
    ctx.fillStyle = colors.side;
    ctx.fill();
    ctx.strokeStyle = colors.rim;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  ctx.beginPath();
  const [fsx0, fsy0] = toScreen(corners[0].x, corners[0].y, FLOOR_HEIGHT + th);
  ctx.moveTo(fsx0, fsy0);
  for (let i = 1; i < corners.length; i++) {
    const [fsx, fsy] = toScreen(corners[i].x, corners[i].y, FLOOR_HEIGHT + th);
    ctx.lineTo(fsx, fsy);
  }
  ctx.closePath();

  const [tcx, tcy] = toScreen(worldX - hw * 0.3, worldY - hh * 0.3, FLOOR_HEIGHT + th);
  const [tcx2, tcy2] = toScreen(worldX, worldY, FLOOR_HEIGHT + th);
  const screenHw = Math.abs(toScreen(worldX + hw, worldY, FLOOR_HEIGHT + th)[0] - toScreen(worldX - hw, worldY, FLOOR_HEIGHT + th)[0]);
  const topGrad = ctx.createRadialGradient(tcx - 4, tcy - 4, 0, tcx2, tcy2, screenHw);
  topGrad.addColorStop(0, lighten(colors.top, 0.25));
  topGrad.addColorStop(0.6, colors.top);
  topGrad.addColorStop(1, darken(colors.top, 0.2));
  ctx.fillStyle = topGrad;
  ctx.fill();
  ctx.strokeStyle = colors.rim;
  ctx.lineWidth = status === 'red' ? 0.5 : 1.2;
  ctx.globalAlpha = status === 'red' ? 0.4 : 1;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawIsoBar(
  ctx: CanvasRenderingContext2D,
  obj: V2LayoutObject,
  toScreen: ToScreenFn
) {
  const { worldX, worldY, width, height } = obj;
  const hw = width / 2;
  const hh = height / 2;
  const barH = 28;

  const corners = [
    { x: worldX - hw, y: worldY - hh },
    { x: worldX + hw, y: worldY - hh },
    { x: worldX + hw, y: worldY + hh },
    { x: worldX - hw, y: worldY + hh },
  ];

  for (let i = 0; i < corners.length; i++) {
    const c0 = corners[i];
    const c1 = corners[(i + 1) % corners.length];
    const dx = c1.x - c0.x;
    const dy = c1.y - c0.y;
    if (dy + dx < 0) continue;
    const [sx0, sy0] = toScreen(c0.x, c0.y, 0);
    const [sx1, sy1] = toScreen(c1.x, c1.y, 0);
    const [sx0t, sy0t] = toScreen(c0.x, c0.y, barH);
    const [sx1t, sy1t] = toScreen(c1.x, c1.y, barH);
    ctx.beginPath();
    ctx.moveTo(sx0, sy0); ctx.lineTo(sx1, sy1); ctx.lineTo(sx1t, sy1t); ctx.lineTo(sx0t, sy0t);
    ctx.closePath();
    ctx.fillStyle = '#5a3d1a';
    ctx.fill();
    ctx.strokeStyle = '#8a6030';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  ctx.beginPath();
  const [tx0, ty0] = toScreen(corners[0].x, corners[0].y, barH);
  ctx.moveTo(tx0, ty0);
  for (let i = 1; i < corners.length; i++) {
    const [tx, ty] = toScreen(corners[i].x, corners[i].y, barH);
    ctx.lineTo(tx, ty);
  }
  ctx.closePath();
  const tg = ctx.createLinearGradient(tx0, ty0, tx0 + 30, ty0 + 15);
  tg.addColorStop(0, '#8a6535');
  tg.addColorStop(1, '#6a4520');
  ctx.fillStyle = tg;
  ctx.fill();
  ctx.strokeStyle = '#aa8050';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawIsoKitchen(
  ctx: CanvasRenderingContext2D,
  obj: V2LayoutObject,
  toScreen: ToScreenFn
) {
  const { worldX, worldY, width, height } = obj;
  const hw = width / 2;
  const hh = height / 2;
  const counterH = 32;
  const applianceH = 48;

  const mainCorners = [
    { x: worldX - hw, y: worldY - hh },
    { x: worldX + hw, y: worldY - hh },
    { x: worldX + hw, y: worldY + hh },
    { x: worldX - hw, y: worldY + hh },
  ];

  for (let i = 0; i < mainCorners.length; i++) {
    const c0 = mainCorners[i];
    const c1 = mainCorners[(i + 1) % mainCorners.length];
    const dx = c1.x - c0.x; const dy = c1.y - c0.y;
    if (dy + dx < 0) continue;
    const [sx0, sy0] = toScreen(c0.x, c0.y, 0);
    const [sx1, sy1] = toScreen(c1.x, c1.y, 0);
    const [sx0t, sy0t] = toScreen(c0.x, c0.y, counterH);
    const [sx1t, sy1t] = toScreen(c1.x, c1.y, counterH);
    ctx.beginPath();
    ctx.moveTo(sx0, sy0); ctx.lineTo(sx1, sy1); ctx.lineTo(sx1t, sy1t); ctx.lineTo(sx0t, sy0t);
    ctx.closePath();
    ctx.fillStyle = '#2a2a2a';
    ctx.fill();
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  ctx.beginPath();
  const [tc0x, tc0y] = toScreen(mainCorners[0].x, mainCorners[0].y, counterH);
  ctx.moveTo(tc0x, tc0y);
  for (let i = 1; i < mainCorners.length; i++) {
    const [tx, ty] = toScreen(mainCorners[i].x, mainCorners[i].y, counterH);
    ctx.lineTo(tx, ty);
  }
  ctx.closePath();
  const topG = ctx.createLinearGradient(tc0x, tc0y, tc0x + 40, tc0y + 20);
  topG.addColorStop(0, '#555');
  topG.addColorStop(0.5, '#3a3a3a');
  topG.addColorStop(1, '#2a2a2a');
  ctx.fillStyle = topG;
  ctx.fill();
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 1;
  ctx.stroke();

  const sinkPad = Math.min(hw, hh) * 0.25;
  const sinkCorners = [
    { x: worldX - hw + sinkPad, y: worldY - hh + sinkPad },
    { x: worldX - sinkPad, y: worldY - hh + sinkPad },
    { x: worldX - sinkPad, y: worldY + sinkPad },
    { x: worldX - hw + sinkPad, y: worldY + sinkPad },
  ];
  ctx.beginPath();
  const [s0x, s0y] = toScreen(sinkCorners[0].x, sinkCorners[0].y, counterH + 1);
  ctx.moveTo(s0x, s0y);
  for (let i = 1; i < sinkCorners.length; i++) {
    const [sx, sy] = toScreen(sinkCorners[i].x, sinkCorners[i].y, counterH + 1);
    ctx.lineTo(sx, sy);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(120,160,180,0.6)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(160,200,220,0.8)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const appW = Math.min(hw * 0.5, 25);
  const appHalf = appW * 0.6;
  const appX = worldX + hw * 0.4;
  const appY = worldY;
  const appCorners = [
    { x: appX - appHalf, y: appY - appHalf },
    { x: appX + appHalf, y: appY - appHalf },
    { x: appX + appHalf, y: appY + appHalf },
    { x: appX - appHalf, y: appY + appHalf },
  ];

  for (let i = 0; i < appCorners.length; i++) {
    const c0 = appCorners[i];
    const c1 = appCorners[(i + 1) % appCorners.length];
    const dx = c1.x - c0.x; const dy = c1.y - c0.y;
    if (dy + dx < 0) continue;
    const [sx0, sy0] = toScreen(c0.x, c0.y, counterH);
    const [sx1, sy1] = toScreen(c1.x, c1.y, counterH);
    const [sx0t, sy0t] = toScreen(c0.x, c0.y, applianceH);
    const [sx1t, sy1t] = toScreen(c1.x, c1.y, applianceH);
    ctx.beginPath();
    ctx.moveTo(sx0, sy0); ctx.lineTo(sx1, sy1); ctx.lineTo(sx1t, sy1t); ctx.lineTo(sx0t, sy0t);
    ctx.closePath();
    ctx.fillStyle = '#1a1a1a';
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  ctx.beginPath();
  const [ta0x, ta0y] = toScreen(appCorners[0].x, appCorners[0].y, applianceH);
  ctx.moveTo(ta0x, ta0y);
  for (let i = 1; i < appCorners.length; i++) {
    const [tx, ty] = toScreen(appCorners[i].x, appCorners[i].y, applianceH);
    ctx.lineTo(tx, ty);
  }
  ctx.closePath();
  ctx.fillStyle = '#2a2a2a';
  ctx.fill();
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;
  ctx.stroke();

  const burnerOffsets = [
    { dx: -appHalf * 0.45, dy: -appHalf * 0.4 },
    { dx: appHalf * 0.45, dy: -appHalf * 0.4 },
    { dx: -appHalf * 0.45, dy: appHalf * 0.35 },
    { dx: appHalf * 0.45, dy: appHalf * 0.35 },
  ];
  for (const b of burnerOffsets) {
    const [bx, by] = toScreen(appX + b.dx, appY + b.dy, applianceH + 1);
    ctx.beginPath();
    ctx.arc(bx, by, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#555';
    ctx.fill();
    ctx.strokeStyle = '#777';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
}

function drawIsoWC(
  ctx: CanvasRenderingContext2D,
  obj: V2LayoutObject,
  toScreen: ToScreenFn
) {
  const { worldX, worldY, width, height } = obj;
  const hw = width / 2;
  const hh = height / 2;
  const wallH = WALL_HEIGHT * 0.85;
  const wallThick = Math.min(hw, hh) * 0.12;

  const outerCorners = [
    { x: worldX - hw, y: worldY - hh },
    { x: worldX + hw, y: worldY - hh },
    { x: worldX + hw, y: worldY + hh },
    { x: worldX - hw, y: worldY + hh },
  ];

  ctx.beginPath();
  const [f0x, f0y] = toScreen(outerCorners[0].x, outerCorners[0].y, 0);
  ctx.moveTo(f0x, f0y);
  for (let i = 1; i < outerCorners.length; i++) {
    const [fx, fy] = toScreen(outerCorners[i].x, outerCorners[i].y, 0);
    ctx.lineTo(fx, fy);
  }
  ctx.closePath();
  ctx.fillStyle = '#d0ccc8';
  ctx.fill();

  const wallSegments = [
    [outerCorners[0], outerCorners[1]],
    [outerCorners[1], outerCorners[2]],
    [outerCorners[2], outerCorners[3]],
    [outerCorners[3], outerCorners[0]],
  ];

  for (const [v0, v1] of wallSegments) {
    const dx = v1.x - v0.x; const dy = v1.y - v0.y;
    const outward = dy + dx;
    if (outward <= 0) continue;

    const [sx0, sy0] = toScreen(v0.x, v0.y, 0);
    const [sx1, sy1] = toScreen(v1.x, v1.y, 0);
    const [sx0t, sy0t] = toScreen(v0.x, v0.y, wallH);
    const [sx1t, sy1t] = toScreen(v1.x, v1.y, wallH);

    ctx.beginPath();
    ctx.moveTo(sx0, sy0); ctx.lineTo(sx1, sy1); ctx.lineTo(sx1t, sy1t); ctx.lineTo(sx0t, sy0t);
    ctx.closePath();
    const wg = ctx.createLinearGradient(sx0, sy0, sx1t, sy1t);
    wg.addColorStop(0, 'rgba(230,225,218,0.95)');
    wg.addColorStop(1, 'rgba(195,188,178,0.90)');
    ctx.fillStyle = wg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  const doorW = Math.min(hw, hh) * 0.6;
  const doorH = wallH * 0.85;
  const doorX = worldX + hw - wallThick;
  const doorY = worldY;
  const d0 = { x: doorX, y: doorY - doorW };
  const d1 = { x: doorX, y: doorY + doorW };
  const [dsx0, dsy0] = toScreen(d0.x, d0.y, 0);
  const [dsx1, dsy1] = toScreen(d1.x, d1.y, 0);
  const [dsx0t, dsy0t] = toScreen(d0.x, d0.y, doorH);
  const [dsx1t, dsy1t] = toScreen(d1.x, d1.y, doorH);
  ctx.beginPath();
  ctx.moveTo(dsx0, dsy0); ctx.lineTo(dsx1, dsy1); ctx.lineTo(dsx1t, dsy1t); ctx.lineTo(dsx0t, dsy0t);
  ctx.closePath();
  ctx.fillStyle = 'rgba(180,160,130,0.85)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(140,120,90,0.9)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const toiletCorners = [
    { x: worldX - hw + wallThick + 4, y: worldY - hh + wallThick + 4 },
    { x: worldX + hw - wallThick - doorW - 4, y: worldY - hh + wallThick + 4 },
    { x: worldX + hw - wallThick - doorW - 4, y: worldY + hh - wallThick - 4 },
    { x: worldX - hw + wallThick + 4, y: worldY + hh - wallThick - 4 },
  ];
  const tpW = (toiletCorners[1].x - toiletCorners[0].x);
  const tpH = (toiletCorners[2].y - toiletCorners[1].y);
  if (tpW > 8 && tpH > 8) {
    const toiletH = 12;
    drawIsoBox(ctx, toiletCorners, 0, toiletH, '#4a5a6a', '#5a6a7a', '#8aaabb', toScreen);
    const seatCorners = toiletCorners.map(c => ({
      x: c.x + (c.x > worldX ? -3 : 3),
      y: c.y + (c.y > worldY ? -3 : 3),
    }));
    ctx.beginPath();
    const [sc0x, sc0y] = toScreen(seatCorners[0].x, seatCorners[0].y, toiletH + 1);
    ctx.moveTo(sc0x, sc0y);
    for (let i = 1; i < seatCorners.length; i++) {
      const [scx, scy] = toScreen(seatCorners[i].x, seatCorners[i].y, toiletH + 1);
      ctx.lineTo(scx, scy);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(220,215,208,0.85)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,155,148,0.9)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  const tankW = Math.min(tpW * 0.65, 16);
  const tankH2 = 22;
  const tankCorners = [
    { x: worldX - hw + wallThick + 2, y: worldY - hh + wallThick + 2 },
    { x: worldX - hw + wallThick + 2 + tankW, y: worldY - hh + wallThick + 2 },
    { x: worldX - hw + wallThick + 2 + tankW, y: worldY - hh + wallThick + 2 + tankW * 0.5 },
    { x: worldX - hw + wallThick + 2, y: worldY - hh + wallThick + 2 + tankW * 0.5 },
  ];
  drawIsoBox(ctx, tankCorners, 0, tankH2, '#5a6a78', '#6a7a88', '#8aaabb', toScreen);
}

function drawIsoFixture(
  ctx: CanvasRenderingContext2D,
  obj: V2LayoutObject,
  toScreen: ToScreenFn
) {
  const { worldX, worldY, width, height, type } = obj;
  const hw = width / 2;
  const hh = height / 2;

  if (type === 'plant') {
    const [cx, cy] = toScreen(worldX, worldY, 0);
    const r = hw * 0.8;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(30,60,20,0.7)';
    ctx.fill();
    const trunkH = 22;
    const [tx, ty] = toScreen(worldX, worldY, trunkH);
    ctx.beginPath();
    ctx.ellipse(tx, ty, r * 0.9, r * 0.45, 0, 0, Math.PI * 2);
    const plantGrad = ctx.createRadialGradient(tx - r * 0.2, ty - r * 0.1, 0, tx, ty, r);
    plantGrad.addColorStop(0, '#5a9a30');
    plantGrad.addColorStop(0.6, '#3a7020');
    plantGrad.addColorStop(1, '#204810');
    ctx.fillStyle = plantGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,50,10,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
    return;
  }

  if (type === 'host_stand') {
    const hStand = 30;
    const corners = [
      { x: worldX - hw, y: worldY - hh },
      { x: worldX + hw, y: worldY - hh },
      { x: worldX + hw, y: worldY + hh },
      { x: worldX - hw, y: worldY + hh },
    ];
    for (let i = 0; i < corners.length; i++) {
      const c0 = corners[i]; const c1 = corners[(i + 1) % corners.length];
      const dx = c1.x - c0.x; const dy = c1.y - c0.y;
      if (dy + dx < 0) continue;
      const [s0x, s0y] = toScreen(c0.x, c0.y, 0);
      const [s1x, s1y] = toScreen(c1.x, c1.y, 0);
      const [s0tx, s0ty] = toScreen(c0.x, c0.y, hStand);
      const [s1tx, s1ty] = toScreen(c1.x, c1.y, hStand);
      ctx.beginPath();
      ctx.moveTo(s0x, s0y); ctx.lineTo(s1x, s1y); ctx.lineTo(s1tx, s1ty); ctx.lineTo(s0tx, s0ty);
      ctx.closePath();
      ctx.fillStyle = '#2a4a6a';
      ctx.fill();
      ctx.strokeStyle = '#4a7aaa';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    const [tx0, ty0] = toScreen(corners[0].x, corners[0].y, hStand);
    ctx.beginPath();
    ctx.moveTo(tx0, ty0);
    for (let i = 1; i < corners.length; i++) {
      const [tx, ty] = toScreen(corners[i].x, corners[i].y, hStand);
      ctx.lineTo(tx, ty);
    }
    ctx.closePath();
    ctx.fillStyle = '#3a6a9a';
    ctx.fill();
    ctx.strokeStyle = '#5a9acc';
    ctx.lineWidth = 1;
    ctx.stroke();
    return;
  }

  if (type === 'stairs') {
    const steps = 4;
    const stepH = 8;
    const stepDepth = hh / steps;
    for (let s = 0; s < steps; s++) {
      const y0 = worldY - hh + s * stepDepth * 2;
      const y1 = y0 + stepDepth * 2;
      const z0 = s * stepH;
      const z1 = (s + 1) * stepH;
      const corners2 = [
        { x: worldX - hw, y: y0 }, { x: worldX + hw, y: y0 },
        { x: worldX + hw, y: y1 }, { x: worldX - hw, y: y1 },
      ];
      const riser0 = corners2[0]; const riser1 = corners2[1];
      const [r0x, r0y] = toScreen(riser0.x, riser0.y, z0);
      const [r1x, r1y] = toScreen(riser1.x, riser1.y, z0);
      const [r0tx, r0ty] = toScreen(riser0.x, riser0.y, z1);
      const [r1tx, r1ty] = toScreen(riser1.x, riser1.y, z1);
      ctx.beginPath();
      ctx.moveTo(r0x, r0y); ctx.lineTo(r1x, r1y); ctx.lineTo(r1tx, r1ty); ctx.lineTo(r0tx, r0ty);
      ctx.closePath();
      ctx.fillStyle = `rgba(200,190,180,${0.7 + s * 0.05})`;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      const [tx0c, ty0c] = toScreen(corners2[0].x, corners2[0].y, z1);
      ctx.beginPath();
      ctx.moveTo(tx0c, ty0c);
      for (let i = 1; i < corners2.length; i++) {
        const [tx, ty] = toScreen(corners2[i].x, corners2[i].y, z1);
        ctx.lineTo(tx, ty);
      }
      ctx.closePath();
      ctx.fillStyle = `rgba(220,212,204,${0.75 + s * 0.05})`;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
    return;
  }
}

function drawInfoPill(
  ctx: CanvasRenderingContext2D,
  obj: V2LayoutObject,
  status: TableStatus,
  isRecommended: boolean,
  toScreen: ToScreenFn,
  tags: string[] | undefined
) {
  const { worldX, worldY, width, height } = obj;
  const hw = width / 2;
  const capacity = obj.capacity || obj.properties?.capacity || 0;
  const label = obj.properties?.tableNumber || obj.name || '';

  const pillTop = FLOOR_HEIGHT + TABLE_HEIGHT + 14;
  const [px, py] = toScreen(worldX, worldY - hw * 0.1, pillTop);

  const lines: string[] = [];
  if (label) lines.push(label);
  if (capacity) lines.push(`Seats ${capacity}`);
  if (tags && tags.length > 0) lines.push(tags.slice(0, 2).join('  ·  '));

  if (lines.length === 0) return;

  const mainLine = lines[0];
  const subLine = lines.slice(1).join('  ·  ');

  const mainFont = 700;
  const mainSize = 13;
  const subSize = 11;
  const padH = 10;
  const padV = 7;
  const gap = subLine ? 4 : 0;

  ctx.font = `${mainFont} ${mainSize}px system-ui, sans-serif`;
  const mainW = ctx.measureText(mainLine).width;
  ctx.font = `400 ${subSize}px system-ui, sans-serif`;
  const subW = subLine ? ctx.measureText(subLine).width : 0;

  const contentW = Math.max(mainW, subW);
  const pillW = contentW + padH * 2;
  const pillH = mainSize + (subLine ? subSize + gap : 0) + padV * 2;
  const pillR = pillH / 2;

  const bx = px - pillW / 2;
  const by = py - pillH;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;

  const bg = ctx.createLinearGradient(bx, by, bx, by + pillH);
  if (isRecommended) {
    bg.addColorStop(0, 'rgba(20,50,30,0.97)');
    bg.addColorStop(1, 'rgba(12,30,18,0.97)');
  } else if (status === 'green') {
    bg.addColorStop(0, 'rgba(14,26,20,0.97)');
    bg.addColorStop(1, 'rgba(8,18,12,0.97)');
  } else {
    bg.addColorStop(0, 'rgba(26,18,6,0.97)');
    bg.addColorStop(1, 'rgba(16,10,3,0.97)');
  }
  ctx.beginPath();
  ctx.roundRect(bx, by, pillW, pillH, pillR);
  ctx.fillStyle = bg;
  ctx.fill();

  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  const border = ctx.createLinearGradient(bx, by, bx + pillW, by + pillH);
  if (isRecommended) {
    border.addColorStop(0, 'rgba(74,200,120,0.90)');
    border.addColorStop(1, 'rgba(42,150,80,0.55)');
  } else if (status === 'green') {
    border.addColorStop(0, 'rgba(148,210,175,0.80)');
    border.addColorStop(1, 'rgba(100,165,130,0.45)');
  } else {
    border.addColorStop(0, 'rgba(225,185,80,0.82)');
    border.addColorStop(1, 'rgba(165,120,38,0.45)');
  }
  ctx.beginPath();
  ctx.roundRect(bx + 0.75, by + 0.75, pillW - 1.5, pillH - 1.5, pillR - 0.75);
  ctx.strokeStyle = border;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const textStartY = by + padV;
  ctx.font = `700 ${mainSize}px system-ui, sans-serif`;
  ctx.fillStyle = isRecommended
    ? 'rgba(180,245,210,1.0)'
    : status === 'green' ? 'rgba(185,228,208,1.0)' : 'rgba(252,225,165,1.0)';
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 3;
  ctx.fillText(mainLine, px, textStartY);
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;

  if (subLine) {
    ctx.font = `400 ${subSize}px system-ui, sans-serif`;
    ctx.fillStyle = isRecommended
      ? 'rgba(120,200,155,0.85)'
      : status === 'green' ? 'rgba(140,190,165,0.82)' : 'rgba(210,180,115,0.82)';
    ctx.fillText(subLine, px, textStartY + mainSize + gap);
  }

  const lineX = px;
  const lineY1 = by + pillH;
  const [tableTopX, tableTopY] = toScreen(worldX, worldY, FLOOR_HEIGHT + TABLE_HEIGHT);
  ctx.beginPath();
  ctx.moveTo(lineX, lineY1);
  ctx.lineTo(tableTopX, tableTopY - 2);
  const lineGrad = ctx.createLinearGradient(lineX, lineY1, tableTopX, tableTopY);
  if (isRecommended) lineGrad.addColorStop(0, 'rgba(74,200,120,0.7)');
  else if (status === 'green') lineGrad.addColorStop(0, 'rgba(148,210,175,0.6)');
  else lineGrad.addColorStop(0, 'rgba(225,185,80,0.6)');
  lineGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.strokeStyle = lineGrad;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();
}

function computeIsoTransform(
  objects: V2LayoutObject[],
  rooms: RoomPolygon[],
  canvasW: number,
  canvasH: number,
  angleX: number,
  angleY: number
): { scale: number; offsetX: number; offsetY: number } {
  const allPoints: Array<{ x: number; y: number }> = [];
  objects.forEach(o => {
    allPoints.push({ x: o.worldX - o.width / 2, y: o.worldY - o.height / 2 });
    allPoints.push({ x: o.worldX + o.width / 2, y: o.worldY + o.height / 2 });
  });
  rooms.forEach(r => r.vertices.forEach(v => allPoints.push(v)));

  if (allPoints.length === 0) return { scale: 0.5, offsetX: canvasW / 2, offsetY: canvasH / 4 };

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  allPoints.forEach(p => {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  });

  const pad = 40;

  let iMinX = Infinity, iMaxX = -Infinity, iMinY = Infinity, iMaxY = -Infinity;
  [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]].forEach(([wx, wy]) => {
    const ix = (wx - wy) * angleX;
    const iy = (wx + wy) * angleY;
    iMinX = Math.min(iMinX, ix); iMaxX = Math.max(iMaxX, ix);
    iMinY = Math.min(iMinY, iy); iMaxY = Math.max(iMaxY, iy);
  });

  const isoW = iMaxX - iMinX;
  const isoH = iMaxY - iMinY + WALL_HEIGHT * angleY * 2;

  const scaleX = (canvasW - pad * 2) / (isoW || 1);
  const scaleY = (canvasH - pad * 2) / (isoH || 1);
  const bestScale = Math.min(scaleX, scaleY, 2.0);

  let sMinX = Infinity, sMaxX = -Infinity, sMinY = Infinity, sMaxY = -Infinity;
  [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]].forEach(([wx, wy]) => {
    const ix = ((wx - wy) * angleX) * bestScale;
    const iy = ((wx + wy) * angleY) * bestScale;
    sMinX = Math.min(sMinX, ix); sMaxX = Math.max(sMaxX, ix);
    sMinY = Math.min(sMinY, iy); sMaxY = Math.max(sMaxY, iy);
  });

  const centerX = (sMinX + sMaxX) / 2;
  const centerY = (sMinY + sMaxY) / 2 - WALL_HEIGHT * angleY * bestScale * 0.3;

  return {
    scale: bestScale,
    offsetX: canvasW / 2 - centerX,
    offsetY: canvasH * 0.5 - centerY,
  };
}

export function IsometricFloorplanCanvas({
  layout,
  rooms,
  tableStatusMap = {},
  recommendedObjectId,
  windowSeatIds,
  tagsMap,
  selectedAreaId,
  onObjectSelect,
}: IsometricFloorplanCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const spinAngleRef = useRef(0);
  const spinAnimRef = useRef<number>();
  const scaleRef = useRef({ scale: 0.5, offsetX: 0, offsetY: 0 });
  const angleXRef = useRef(0.5);
  const angleYRef = useRef(0.25);
  const animFrameRef = useRef<number>();

  const getTableStatus = useCallback((obj: V2LayoutObject): TableStatus => {
    const tableId = obj.properties?.tableId;
    if (!tableId) return undefined;
    return tableStatusMap[tableId];
  }, [tableStatusMap]);

  const hitTest = useCallback((canvasX: number, canvasY: number): string | null => {
    const { scale, offsetX, offsetY } = scaleRef.current;
    const aX = angleXRef.current;
    const aY = angleYRef.current;
    const toScreen: ToScreenFn = (wx, wy, wz) => {
      const ix = (wx - wy) * aX;
      const iy = (wx + wy) * aY - wz;
      return [ix * scale + offsetX, iy * scale + offsetY];
    };

    const tables = layout.objects.filter(o =>
      (o.type === 'table' || o.type === 'booth') &&
      (!selectedAreaId || o.areaId === selectedAreaId)
    );

    for (let i = tables.length - 1; i >= 0; i--) {
      const obj = tables[i];
      const { worldX, worldY, width, height, shape } = obj;
      const hw = width / 2;
      const hh = height / 2;
      const topZ = FLOOR_HEIGHT + TABLE_HEIGHT;

      const corners = shape === 'circle'
        ? (() => {
            const segs = 16;
            return Array.from({ length: segs }, (_, k) => {
              const a = (k / segs) * Math.PI * 2;
              return { x: worldX + Math.cos(a) * hw, y: worldY + Math.sin(a) * hh };
            });
          })()
        : [
            { x: worldX - hw, y: worldY - hh },
            { x: worldX + hw, y: worldY - hh },
            { x: worldX + hw, y: worldY + hh },
            { x: worldX - hw, y: worldY + hh },
          ];

      const screenCorners = corners.map(c => toScreen(c.x, c.y, topZ));
      let inside = false;
      for (let j = 0, k = screenCorners.length - 1; j < screenCorners.length; k = j++) {
        const [xi, yi] = screenCorners[j];
        const [xj, yj] = screenCorners[k];
        if (((yi > canvasY) !== (yj > canvasY)) && (canvasX < (xj - xi) * (canvasY - yi) / (yj - yi) + xi)) {
          inside = !inside;
        }
      }
      if (inside) return obj.id;
      const [cx, cy] = toScreen(worldX, worldY, topZ);
      const dist = Math.hypot(canvasX - cx, canvasY - cy);
      if (dist < Math.max(hw, hh) * scale * 0.9) return obj.id;
    }
    return null;
  }, [layout.objects, selectedAreaId]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const aX = angleXRef.current;
    const aY = angleYRef.current;

    const visObjects = selectedAreaId
      ? layout.objects.filter(o => o.areaId === selectedAreaId || !o.areaId)
      : layout.objects;
    const visRooms = selectedAreaId
      ? rooms.filter(r => r.areaId === selectedAreaId || !r.areaId)
      : rooms;

    const { scale, offsetX, offsetY } = computeIsoTransform(visObjects, visRooms, W, H, aX, aY);
    scaleRef.current = { scale, offsetX, offsetY };

    const toScreen: ToScreenFn = (wx, wy, wz) => {
      const ix = (wx - wy) * aX;
      const iy = (wx + wy) * aY - wz;
      return [ix * scale + offsetX, iy * scale + offsetY];
    };

    ctx.clearRect(0, 0, W, H);
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, '#0f0f16');
    bgGrad.addColorStop(1, '#080810');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    const windowObjects = visObjects.filter(o => o.type === 'window');

    const exteriorRooms = visRooms.filter(r => r.exterior || ['gravel', 'grass', 'car_park', 'decking', 'paving'].includes(r.floorStyle));
    const interiorRooms = visRooms.filter(r => !exteriorRooms.includes(r));

    exteriorRooms.forEach(room => drawIsoRoom(ctx, room.vertices, room.floorStyle, toScreen));
    interiorRooms.forEach(room => drawIsoRoom(ctx, room.vertices, room.floorStyle, toScreen));
    interiorRooms.forEach(room => drawIsoWalls(ctx, room.vertices, room.floorStyle, toScreen, windowObjects));

    const sortedObjects = [...visObjects].sort((a, b) => (a.worldX + a.worldY) - (b.worldX + b.worldY));

    sortedObjects.forEach(obj => {
      if (obj.type === 'bar_counter') {
        drawIsoBar(ctx, obj, toScreen);
      } else if (obj.type === 'kitchen') {
        drawIsoKitchen(ctx, obj, toScreen);
      } else if (obj.type === 'wc') {
        drawIsoWC(ctx, obj, toScreen);
      } else if (obj.type === 'plant' || obj.type === 'host_stand' || obj.type === 'stairs') {
        drawIsoFixture(ctx, obj, toScreen);
      } else if (obj.type === 'table' || obj.type === 'booth') {
        const status = getTableStatus(obj);
        const isRecommended = obj.id === recommendedObjectId;
        const isHovered = obj.id === hoveredId;
        drawIsoTable(ctx, obj, status, isRecommended, isHovered, toScreen);
      }
    });

    sortedObjects.forEach(obj => {
      if (obj.type === 'table' || obj.type === 'booth') {
        const isHovered = obj.id === hoveredId;
        const isRecommended = obj.id === recommendedObjectId;
        if (isHovered || isRecommended) {
          const status = getTableStatus(obj);
          const tags = tagsMap?.[obj.properties?.tableId || ''];
          drawInfoPill(ctx, obj, status, isRecommended, toScreen, tags);
        }
      }
    });
  }, [layout, rooms, selectedAreaId, tableStatusMap, recommendedObjectId, hoveredId, getTableStatus, tagsMap]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
    };
    const observer = new ResizeObserver(() => { resizeCanvas(); render(); });
    observer.observe(canvas);
    resizeCanvas();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(render);
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [render]);

  useEffect(() => {
    if (!isSpinning) {
      if (spinAnimRef.current) cancelAnimationFrame(spinAnimRef.current);
      return;
    }
    const BASE_AX = 0.5;
    const BASE_AY = 0.25;
    const RADIUS_AX = 0.18;
    const RADIUS_AY = 0.09;
    const SPEED = 0.004;

    const animate = () => {
      spinAngleRef.current += SPEED;
      const t = spinAngleRef.current;
      angleXRef.current = BASE_AX + Math.cos(t) * RADIUS_AX;
      angleYRef.current = BASE_AY + Math.sin(t) * RADIUS_AY;
      render();
      spinAnimRef.current = requestAnimationFrame(animate);
    };
    spinAnimRef.current = requestAnimationFrame(animate);
    return () => { if (spinAnimRef.current) cancelAnimationFrame(spinAnimRef.current); };
  }, [isSpinning, render]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const id = hitTest(e.clientX - rect.left, e.clientY - rect.top);
    if (id !== hoveredId) setHoveredId(id);
  }, [hitTest, hoveredId]);

  const handlePointerLeave = useCallback(() => setHoveredId(null), []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const id = hitTest(e.clientX - rect.left, e.clientY - rect.top);
    if (id) {
      const obj = layout.objects.find(o => o.id === id);
      if (obj && getTableStatus(obj) !== 'red') {
        onObjectSelect?.(id);
      }
    }
  }, [hitTest, layout.objects, getTableStatus, onObjectSelect]);

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ cursor: hoveredId ? 'pointer' : 'default' }}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onClick={handleClick}
      />
      <button
        onClick={() => setIsSpinning(s => !s)}
        className="absolute bottom-4 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
        style={{
          background: isSpinning ? 'rgba(185,148,50,0.25)' : 'rgba(30,25,15,0.85)',
          border: isSpinning ? '1px solid rgba(220,185,80,0.75)' : '1px solid rgba(120,100,60,0.45)',
          color: isSpinning ? 'rgba(252,220,140,1.0)' : 'rgba(200,175,120,0.85)',
          backdropFilter: 'blur(8px)',
        }}
        title={isSpinning ? 'Stop rotation' : 'Spin view'}
      >
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          style={{
            animation: isSpinning ? 'spin 2s linear infinite' : 'none',
          }}
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        {isSpinning ? 'Stop' : 'Spin'}
      </button>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
