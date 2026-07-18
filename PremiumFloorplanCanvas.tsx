import React, { useRef, useState, useEffect, useCallback, useImperativeHandle } from 'react';
import { V2LayoutData, V2LayoutObject, V2Camera, RoomPolygon, ChairData } from '../lib/types';
import { getEffectiveChairs } from '../lib/chairUtils';

export type EditorTool =
  | 'select'
  | 'pan'
  | 'draw_room'
  | 'draw_outdoor'
  | 'add_table_round'
  | 'add_table_square'
  | 'add_table_rect'
  | 'add_bar_stool'
  | 'add_booth'
  | 'wall'
  | 'door'
  | 'window'
  | 'wc'
  | 'kitchen'
  | 'bar_counter'
  | 'host_stand'
  | 'stairs'
  | 'plant';

export interface PremiumFloorplanCanvasHandle {
  reCenter: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

interface PremiumFloorplanCanvasProps {
  layout: V2LayoutData;
  rooms: RoomPolygon[];
  renderMode: 'editor' | 'customer';
  activeTool?: EditorTool;
  selectedObjectId?: string | null;
  selectedRoomId?: string | null;
  selectedAreaId?: string | null;
  tableStatusMap?: Record<string, 'green' | 'yellow' | 'red'>;
  tableUnavailableReasonMap?: Record<string, string>;
  tableUnavailableTypeMap?: Record<string, 'booked' | 'size' | 'time' | 'held' | 'other'>;
  /** Tables that are red but have available joined combinations — renders them with an amber ring and "N+" label */
  tableJoinableIds?: Set<string>;
  partySize?: number;
  recommendedObjectId?: string | null;
  windowSeatIds?: Set<string>;
  windowViewDescriptionMap?: Record<string, string>;
  tagsMap?: Record<string, string[]>;
  gridSnapping?: boolean;
  gridSize?: number;
  wallStartPoint?: { worldX: number; worldY: number } | null;
  roomInProgress?: Array<{ x: number; y: number }>;
  suppressRecommendationBadge?: boolean;
  fitToContentOnLoad?: boolean;
  showCustomerViewport?: boolean;
  customerViewportSize?: { width: number; height: number };
  customerViewportBounds?: { minX: number; minY: number; maxX: number; maxY: number } | null;
  canvasRef?: React.Ref<PremiumFloorplanCanvasHandle>;
  /** When set, enables chair-edit handles for the named table object */
  editingChairsObjectId?: string | null;
  onObjectSelect?: (id: string | null) => void;
  onRoomSelect?: (id: string | null) => void;
  onObjectMove?: (id: string, worldX: number, worldY: number) => void;
  onObjectUpdate?: (id: string, updates: Partial<V2LayoutObject>) => void;
  onRoomVertexMove?: (roomId: string, vertexIndex: number, x: number, y: number) => void;
  onCameraChange?: (camera: V2Camera) => void;
  onCanvasClick?: (worldX: number, worldY: number) => void;
  onRoomVertexClick?: (worldX: number, worldY: number) => void;
  /** Called when user drags a chair handle to a new local position */
  onChairsUpdate?: (objectId: string, chairs: ChairData[]) => void;
  /** Called when user resizes the customer viewport overlay */
  onCustomerViewportBoundsChange?: (bounds: { minX: number; minY: number; maxX: number; maxY: number }) => void;
}

const ZOOM_MIN = 0.08;
const ZOOM_MAX = 5;

type ChairHandle = 'nw' | 'ne' | 'se' | 'sw' | 'rotate';
type ViewportHandle = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'se' | 'sw' | 'move';
const VERTEX_HIT_RADIUS = 12;

function clampCamera(c: V2Camera): V2Camera {
  return {
    panX: isFinite(c.panX) ? c.panX : 0,
    panY: isFinite(c.panY) ? c.panY : 0,
    zoom: isFinite(c.zoom) && c.zoom > ZOOM_MIN && c.zoom < ZOOM_MAX ? c.zoom : 1,
  };
}

function computeContentBoundsFromData(objects: V2LayoutObject[], rooms: RoomPolygon[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  objects.forEach(obj => {
    const hw = obj.width / 2, hh = obj.height / 2;
    minX = Math.min(minX, obj.worldX - hw);
    maxX = Math.max(maxX, obj.worldX + hw);
    minY = Math.min(minY, obj.worldY - hh);
    maxY = Math.max(maxY, obj.worldY + hh);
  });
  rooms.forEach(room => {
    room.vertices.forEach(v => {
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
    });
  });
  if (!isFinite(minX)) return null;
  const pad = 40;
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

function clampCustomerPan(panX: number, panY: number, zoom: number, W: number, H: number, bounds: { minX: number; minY: number; maxX: number; maxY: number }): { panX: number; panY: number } {
  const viewW = W / zoom;
  const viewH = H / zoom;
  const contentW = bounds.maxX - bounds.minX;
  const contentH = bounds.maxY - bounds.minY;
  // When content fits inside viewport, centre it rather than clamping to an edge.
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const clampedPanX = contentW <= viewW
    ? cx - viewW / 2
    : Math.max(bounds.minX, Math.min(bounds.maxX - viewW, panX));
  const clampedPanY = contentH <= viewH
    ? cy - viewH / 2
    : Math.max(bounds.minY, Math.min(bounds.maxY - viewH, panY));
  return { panX: clampedPanX, panY: clampedPanY };
}

function fitToObjects(
  objects: V2LayoutObject[],
  rooms: RoomPolygon[],
  w: number,
  h: number,
  areaId?: string | null,
  renderMode: 'editor' | 'customer' = 'editor',
  viewportBounds?: { minX: number; minY: number; maxX: number; maxY: number } | null
): V2Camera {
  let minX: number, maxX: number, minY: number, maxY: number;

  if (viewportBounds && renderMode === 'customer') {
    minX = viewportBounds.minX;
    maxX = viewportBounds.maxX;
    minY = viewportBounds.minY;
    maxY = viewportBounds.maxY;
  } else {
    const visObjects = areaId ? objects.filter(o => o.areaId === areaId) : objects;
    const visRooms = areaId ? rooms.filter(r => r.areaId === areaId) : rooms;

    minX = Infinity; maxX = -Infinity; minY = Infinity; maxY = -Infinity;

    visObjects.forEach(obj => {
      const hw = obj.width / 2, hh = obj.height / 2;
      minX = Math.min(minX, obj.worldX - hw);
      maxX = Math.max(maxX, obj.worldX + hw);
      minY = Math.min(minY, obj.worldY - hh);
      maxY = Math.max(maxY, obj.worldY + hh);
    });

    visRooms.forEach(room => {
      room.vertices.forEach(v => {
        minX = Math.min(minX, v.x);
        maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y);
        maxY = Math.max(maxY, v.y);
      });
    });
  }

  if (!isFinite(minX)) return { panX: 0, panY: 0, zoom: 1 };

  const cw = maxX - minX, ch = maxY - minY;
  if (cw === 0 || ch === 0) return { panX: 0, panY: 0, zoom: 1 };
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const pad = renderMode === 'customer' ? (w <= 480 ? 12 : 36) : 100;
  const zoom = Math.min(Math.max(Math.min((w - pad) / cw, (h - pad) / ch), 0.15), 2.8);

  if (renderMode === 'customer') {
    return { panX: cx - w / zoom / 2, panY: cy - h / zoom / 2, zoom };
  }
  return { panX: cx, panY: cy, zoom };
}

function pointInPolygon(px: number, py: number, vertices: Array<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x, yi = vertices[i].y;
    const xj = vertices[j].x, yj = vertices[j].y;
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// Appends a rounded-rect sub-path to the current ctx path (no beginPath call).
// Used when the rounded rect is part of a larger compound path (e.g. badge + callout tip).
function manualRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rv = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + rv, y);
  ctx.lineTo(x + w - rv, y);
  ctx.arcTo(x + w, y, x + w, y + rv, rv);
  ctx.lineTo(x + w, y + h - rv);
  ctx.arcTo(x + w, y + h, x + w - rv, y + h, rv);
  ctx.lineTo(x + rv, y + h);
  ctx.arcTo(x, y + h, x, y + h - rv, rv);
  ctx.lineTo(x, y + rv);
  ctx.arcTo(x, y, x + rv, y, rv);
  ctx.closePath();
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawFloorTextureCustomer(
  ctx: CanvasRenderingContext2D,
  style: RoomPolygon['floorStyle'],
  vertices: Array<{ x: number; y: number }>
) {
  if (vertices.length < 3) return;
  const xs = vertices.map(v => v.x);
  const ys = vertices.map(v => v.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(vertices[0].x, vertices[0].y);
  for (let i = 1; i < vertices.length; i++) ctx.lineTo(vertices[i].x, vertices[i].y);
  ctx.closePath();
  ctx.clip();

  const FLOOR_COLORS: Record<string, [string, string]> = {
    solid_wood:  ['#4e3018', '#5a3a1e'],
    wood:        ['#352010', '#3e2812'],
    herringbone: ['#3e2812', '#482e14'],
    tile:        ['#a09a92', '#b0aaa2'],
    carpet:      ['#222d3a', '#1a2430'],
    concrete:    ['#7a7670', '#8a8680'],
    gravel:      ['#6a6460', '#7a7470'],
    grass:       ['#1e3618', '#24401e'],
    decking:     ['#5c400e', '#6a4c12'],
    paving:      ['#98908a', '#a8a09a'],
    car_park:    ['#303030', '#3c3c3c'],
  };
  const [c0, c1] = FLOOR_COLORS[style] || ['#3e2810', '#4a3014'];

  const grad = ctx.createLinearGradient(minX, minY, maxX, maxY);
  grad.addColorStop(0, c0);
  grad.addColorStop(0.5, c1);
  grad.addColorStop(1, c0);
  ctx.fillStyle = grad;
  ctx.fillRect(minX, minY, maxX - minX, maxY - minY);

  const isExterior = ['gravel', 'grass', 'car_park', 'paving', 'decking'].includes(style);
  if (!isExterior) {
    const sheen = ctx.createRadialGradient(
      (minX + maxX) * 0.38, (minY + maxY) * 0.35, 0,
      (minX + maxX) * 0.5, (minY + maxY) * 0.5,
      Math.max(maxX - minX, maxY - minY) * 0.65
    );
    sheen.addColorStop(0, 'rgba(255,240,210,0.045)');
    sheen.addColorStop(0.6, 'rgba(255,230,190,0.012)');
    sheen.addColorStop(1, 'rgba(0,0,0,0.08)');
    ctx.fillStyle = sheen;
    ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
  }

  ctx.restore();
}

function drawFloorTexture(
  ctx: CanvasRenderingContext2D,
  style: RoomPolygon['floorStyle'],
  vertices: Array<{ x: number; y: number }>,
  zoom: number,
  renderMode: 'editor' | 'customer' = 'editor'
) {
  if (vertices.length < 3) return;

  drawFloorTextureCustomer(ctx, style, vertices);
}

const EXTERIOR_STYLES = new Set(['gravel', 'grass', 'car_park', 'decking', 'paving']);

function drawRoomOutline(ctx: CanvasRenderingContext2D, vertices: Array<{ x: number; y: number }>, isSelected: boolean, zoom: number, isExterior = false) {
  if (vertices.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(vertices[0].x, vertices[0].y);
  for (let i = 1; i < vertices.length; i++) ctx.lineTo(vertices[i].x, vertices[i].y);
  ctx.closePath();
  if (isExterior) {
    ctx.shadowColor = isSelected ? 'rgba(59,130,246,0.4)' : 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 6 / zoom;
    ctx.strokeStyle = isSelected ? '#3b82f6' : 'rgba(18,10,4,0.9)';
    ctx.lineWidth = isSelected ? 3 / zoom : 2.5 / zoom;
    ctx.setLineDash([8 / zoom, 4 / zoom]);
  } else {
    ctx.shadowColor = isSelected ? 'rgba(59,130,246,0.4)' : 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = (isSelected ? 10 : 12) / zoom;
    ctx.shadowOffsetY = 3 / zoom;
    ctx.strokeStyle = isSelected ? '#3b82f6' : 'rgba(14,8,2,0.98)';
    ctx.lineWidth = isSelected ? 3.5 / zoom : 5.5 / zoom;
  }
  ctx.stroke();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.setLineDash([]);
  if (!isExterior && !isSelected) {
    ctx.beginPath();
    ctx.moveTo(vertices[0].x, vertices[0].y);
    for (let i = 1; i < vertices.length; i++) ctx.lineTo(vertices[i].x, vertices[i].y);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(180,140,80,0.08)';
    ctx.lineWidth = 1.5 / zoom;
    ctx.stroke();
  }
}

function drawResizeHandles(ctx: CanvasRenderingContext2D, obj: V2LayoutObject, zoom: number) {
  const hw = obj.width / 2, hh = obj.height / 2;
  const hs = 6 / zoom;
  const positions = [
    [-hw, -hh], [0, -hh], [hw, -hh],
    [hw, 0],
    [hw, hh], [0, hh], [-hw, hh],
    [-hw, 0],
  ];
  ctx.save();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5 / zoom;
  for (const [lx, ly] of positions) {
    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    ctx.rect(lx - hs, ly - hs, hs * 2, hs * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(59,130,246,0.5)';
  ctx.lineWidth = 1 / zoom;
  ctx.setLineDash([4 / zoom, 3 / zoom]);
  ctx.strokeRect(-hw, -hh, obj.width, obj.height);
  ctx.setLineDash([]);
  ctx.restore();
}

function drawRoomVertexHandles(
  ctx: CanvasRenderingContext2D,
  vertices: Array<{ x: number; y: number }>,
  zoom: number,
  dragVertexIndex: number | null
) {
  const r = VERTEX_HIT_RADIUS / zoom;
  vertices.forEach((v, i) => {
    const isDragging = dragVertexIndex === i;
    ctx.beginPath();
    ctx.arc(v.x, v.y, r, 0, Math.PI * 2);
    ctx.fillStyle = isDragging ? '#f59e0b' : '#ffffff';
    ctx.fill();
    ctx.strokeStyle = isDragging ? '#d97706' : '#3b82f6';
    ctx.lineWidth = 2 / zoom;
    ctx.stroke();

    ctx.fillStyle = isDragging ? '#d97706' : '#3b82f6';
    ctx.beginPath();
    ctx.arc(v.x, v.y, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawTakenX(ctx: CanvasRenderingContext2D, size: number, zoom: number) {
  const arm = size * 0.18;
  const sw = Math.max(1, 1.5 / zoom);
  ctx.save();
  ctx.strokeStyle = 'rgba(140,120,105,0.35)';
  ctx.lineWidth = sw;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-arm, -arm); ctx.lineTo(arm, arm); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(arm, -arm); ctx.lineTo(-arm, arm); ctx.stroke();
  ctx.restore();
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function easeOut(t: number) { return 1 - (1 - t) * (1 - t); }

// ── Chair rendering ─────────────────────────────────────────────────────────
// Chairs are stored as ChairData[] on the V2LayoutObject (in obj.chairs).
// Coords are table-local (relative to table centre). The canvas is already
// translated+rotated to the table centre before drawTable is called, so
// chairs automatically move and rotate with the table.
//
// For backwards-compat, getEffectiveChairs() auto-generates chairs for tables
// that have no chairs property yet.

function drawSingleChair(
  ctx: CanvasRenderingContext2D,
  chair: ChairData,
  zoom: number,
  isEditHandle = false,
  isHovered = false,
) {
  const { x, y, rotation, width: cw, height: ch, shape: cs } = chair;
  const cr = Math.max(0.8, Math.min(cw, ch) * 0.35);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((rotation * Math.PI) / 180);

  if (cs === 'circle' || cs === 'stool') {
    const r = Math.min(cw, ch) / 2;
    const grad = ctx.createRadialGradient(-r * 0.2, -r * 0.25, 0, 0, 0, r);
    grad.addColorStop(0,   isEditHandle ? '#a07040' : '#7a5828');
    grad.addColorStop(0.5, isEditHandle ? '#704e28' : '#4a3010');
    grad.addColorStop(1,   isEditHandle ? '#4a3018' : '#281a08');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = isHovered ? 'rgba(255,210,80,0.90)' : 'rgba(210,165,70,0.55)';
    ctx.lineWidth = Math.max(0.5, (isEditHandle ? 1.5 : 1.0) / zoom);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  } else {
    // rounded-rect (standard chair) and bench
    const grad = ctx.createLinearGradient(0, -ch / 2, 0, ch / 2);
    grad.addColorStop(0,    isEditHandle ? '#9a6830' : '#7a5828');
    grad.addColorStop(0.35, isEditHandle ? '#7a4e20' : '#5a3e18');
    grad.addColorStop(0.72, isEditHandle ? '#4e3010' : '#3a2810');
    grad.addColorStop(1,    isEditHandle ? '#362208' : '#28200c');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(-cw / 2, -ch / 2, cw, ch, cr);
    ctx.fill();

    ctx.strokeStyle = isHovered ? 'rgba(255,210,80,0.90)' : 'rgba(210,165,70,0.55)';
    ctx.lineWidth = Math.max(0.4, (isEditHandle ? 1.5 : 1.0) / zoom);
    ctx.beginPath();
    ctx.roundRect(-cw / 2, -ch / 2, cw, ch, cr);
    ctx.stroke();

    // Subtle top sheen
    const sheen = ctx.createLinearGradient(0, -ch / 2, 0, 0);
    sheen.addColorStop(0, 'rgba(255,225,140,0.16)');
    sheen.addColorStop(1, 'rgba(255,215,120,0.00)');
    ctx.fillStyle = sheen;
    ctx.beginPath();
    ctx.roundRect(-cw / 2, -ch / 2, cw, ch, cr);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Draw all chairs for a table. Called in the table's local coordinate space.
 * In edit mode, chairs render brighter as interactive handles.
 */
function drawChairs(
  ctx: CanvasRenderingContext2D,
  obj: V2LayoutObject,
  zoom: number,
  isTaken: boolean,
  editMode = false,
  hoveredChairId: string | null = null,
) {
  const screenW = obj.width * zoom;
  const screenH = obj.height * zoom;
  if (screenW < 10 || screenH < 10) return;

  const chairs = getEffectiveChairs(obj);
  if (chairs.length === 0) return;

  const zoomFade = Math.min(1, Math.max(0, (Math.min(screenW, screenH) - 10) / 16));
  const baseAlpha = editMode ? 0.92 : (isTaken ? 0.22 : 0.68);
  const alpha = baseAlpha * zoomFade;
  if (alpha < 0.04) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  for (const chair of chairs) {
    drawSingleChair(ctx, chair, zoom, editMode, editMode && hoveredChairId === chair.id);
  }
  ctx.restore();
}

/**
 * Draw interactive drag handles for each chair in edit mode.
 * Called AFTER restoring from the table's local context (i.e., in world space).
 */
function drawChairEditHandles(
  ctx: CanvasRenderingContext2D,
  obj: V2LayoutObject,
  zoom: number,
  hoveredChairId: string | null,
  selectedChairId: string | null,
) {
  const chairs = getEffectiveChairs(obj);
  if (chairs.length === 0) return;

  const tRad = (obj.rotation * Math.PI) / 180;
  const tCos = Math.cos(tRad), tSin = Math.sin(tRad);

  const HR = Math.max(7, 9 / zoom); // move-handle radius (larger for easier grab)
  const RH = Math.max(5, 7 / zoom); // resize-handle half-size
  const ROTATE_OFFSET = Math.max(16, 20 / zoom); // distance of rotate handle above chair

  for (const chair of chairs) {
    // Chair centre in world space
    const cwx = obj.worldX + chair.x * tCos - chair.y * tSin;
    const cwy = obj.worldY + chair.x * tSin + chair.y * tCos;

    const isHov = hoveredChairId === chair.id;
    const isSel = selectedChairId === chair.id;

    ctx.save();

    // ── Move handle (centre circle) ──────────────────────────────────────────
    ctx.globalAlpha = isSel ? 1.0 : isHov ? 0.95 : 0.80;
    ctx.shadowColor = isSel ? 'rgba(250,200,50,0.6)' : 'rgba(210,165,70,0.4)';
    ctx.shadowBlur = (isSel ? 10 : 6) / zoom;
    ctx.strokeStyle = isSel ? 'rgba(250,200,50,0.95)' : isHov ? 'rgba(255,215,80,0.85)' : 'rgba(210,165,70,0.65)';
    ctx.lineWidth = (isSel ? 2.0 : 1.5) / zoom;
    ctx.fillStyle = isSel ? 'rgba(80,60,20,0.85)' : 'rgba(40,30,12,0.75)';
    ctx.beginPath();
    ctx.arc(cwx, cwy, HR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';

    // ── Selected-only: bounding box, resize corners, rotate handle ───────────
    if (isSel) {
      // Total rotation of the chair in world space
      const totalRad = ((chair.rotation + obj.rotation) * Math.PI) / 180;
      const cR = Math.cos(totalRad), sR = Math.sin(totalRad);
      const hw = chair.width / 2, hh = chair.height / 2;

      // Four corners of the chair bbox in world space
      const corners: [number, number][] = [
        [-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh],
      ];
      const worldCorners = corners.map(([lx, ly]) => [
        cwx + lx * cR - ly * sR,
        cwy + lx * sR + ly * cR,
      ] as [number, number]);

      // Dashed bounding box
      ctx.save();
      ctx.strokeStyle = 'rgba(250,200,50,0.55)';
      ctx.lineWidth = 1 / zoom;
      ctx.setLineDash([3 / zoom, 2.5 / zoom]);
      ctx.beginPath();
      ctx.moveTo(worldCorners[0][0], worldCorners[0][1]);
      for (let i = 1; i < 4; i++) ctx.lineTo(worldCorners[i][0], worldCorners[i][1]);
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Resize handles at four corners
      const cornerLabels: [number, number][] = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
      for (const [lx, ly] of cornerLabels) {
        const hx = cwx + lx * cR - ly * sR;
        const hy = cwy + lx * sR + ly * cR;
        ctx.save();
        ctx.translate(hx, hy);
        ctx.rotate(totalRad);
        ctx.fillStyle = '#2a1e0c';
        ctx.strokeStyle = 'rgba(250,200,50,0.90)';
        ctx.lineWidth = 1.5 / zoom;
        ctx.shadowColor = 'rgba(250,200,50,0.5)';
        ctx.shadowBlur = 5 / zoom;
        ctx.fillRect(-RH, -RH, RH * 2, RH * 2);
        ctx.strokeRect(-RH, -RH, RH * 2, RH * 2);
        ctx.shadowBlur = 0;
        ctx.restore();
      }

      // Rotate handle — above the chair (local top = -hh direction)
      const rotHx = cwx + (-hh - ROTATE_OFFSET) * (-sR); // top direction is -local-y
      const rotHy = cwy + (-hh - ROTATE_OFFSET) * cR;
      // Line from top edge to rotate handle
      const topEdgeMidX = cwx + (-hh) * (-sR);
      const topEdgeMidY = cwy + (-hh) * cR;
      ctx.save();
      ctx.strokeStyle = 'rgba(250,200,50,0.50)';
      ctx.lineWidth = 1 / zoom;
      ctx.beginPath();
      ctx.moveTo(topEdgeMidX, topEdgeMidY);
      ctx.lineTo(rotHx, rotHy);
      ctx.stroke();
      // Rotate handle circle
      ctx.fillStyle = '#2a1e0c';
      ctx.strokeStyle = 'rgba(140,210,255,0.90)';
      ctx.lineWidth = 1.5 / zoom;
      ctx.shadowColor = 'rgba(140,210,255,0.5)';
      ctx.shadowBlur = 5 / zoom;
      ctx.beginPath();
      ctx.arc(rotHx, rotHy, RH + 1 / zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Arc arrow on rotate handle
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(140,210,255,0.80)';
      ctx.lineWidth = 1.2 / zoom;
      ctx.beginPath();
      ctx.arc(rotHx, rotHy, RH * 0.55, -Math.PI * 0.7, Math.PI * 0.7);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }
}

// ── End chair rendering ──────────────────────────────────────────────────────

function drawTableBase(ctx: CanvasRenderingContext2D, shape: string | undefined, w: number, h: number, zoom: number, hoverT: number, isSelected: boolean) {
  const r = Math.min(shape === 'circle' ? w / 2 : 10 / zoom, w / 4, h / 4);
  const et = easeOut(hoverT);

  ctx.shadowColor = isSelected ? 'rgba(195,158,52,0.45)' : `rgba(0,0,0,${lerp(0.90, 0.70, et).toFixed(2)})`;
  ctx.shadowBlur = (isSelected ? 28 : lerp(14, 22, et)) / zoom;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = (isSelected ? 0 : lerp(7, 3, et)) / zoom;

  const topColour = isSelected ? '#3a3628' : (et > 0 ? `rgb(${Math.round(lerp(46, 54, et))},${Math.round(lerp(42, 48, et))},${Math.round(lerp(30, 36, et))})` : '#2e2a1e');
  const grad = ctx.createRadialGradient(-w * 0.22, -h * 0.25, 0, 0, 0, Math.max(w, h) * 0.80);
  grad.addColorStop(0,    isSelected ? '#3a3628' : topColour);
  grad.addColorStop(0.40, isSelected ? '#2c2820' : '#25221a');
  grad.addColorStop(0.75, isSelected ? '#201e16' : '#1c1a12');
  grad.addColorStop(1,    isSelected ? '#18160e' : '#12100a');
  ctx.fillStyle = grad;

  if (shape === 'circle' || !shape) {
    ctx.beginPath(); ctx.arc(0, 0, w / 2, 0, Math.PI * 2); ctx.fill();
  } else {
    drawRoundedRect(ctx, -w / 2, -h / 2, w, h, r); ctx.fill();
  }
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;

  // Gold rim: full strength when selected, pulled back on available tables so the green ring reads clearly
  const rimAlpha0 = isSelected ? 0.92 : lerp(0.36, 0.52, et);
  const rimAlpha1 = isSelected ? 0.68 : lerp(0.22, 0.36, et);
  const rimAlpha2 = isSelected ? 0.42 : lerp(0.10, 0.18, et);
  const rimGrad = ctx.createLinearGradient(-w * 0.5, -h * 0.5, w * 0.5, h * 0.5);
  rimGrad.addColorStop(0,   isSelected ? 'rgba(232,200,92,0.92)' : `rgba(205,168,72,${rimAlpha0.toFixed(2)})`);
  rimGrad.addColorStop(0.45,isSelected ? 'rgba(218,182,72,0.68)' : `rgba(182,144,52,${rimAlpha1.toFixed(2)})`);
  rimGrad.addColorStop(1,   isSelected ? 'rgba(188,148,44,0.42)' : `rgba(118,86,24,${rimAlpha2.toFixed(2)})`);
  ctx.strokeStyle = rimGrad;
  ctx.lineWidth = (isSelected ? 2.5 : lerp(1.2, 1.8, et)) / zoom;
  if (shape === 'circle' || !shape) {
    ctx.beginPath(); ctx.arc(0, 0, w / 2 - 0.9 / zoom, 0, Math.PI * 2); ctx.stroke();
  } else {
    drawRoundedRect(ctx, -w / 2 + 0.9 / zoom, -h / 2 + 0.9 / zoom, w - 1.8 / zoom, h - 1.8 / zoom, Math.max(0, r - 0.9 / zoom)); ctx.stroke();
  }

  const specBase = lerp(0.26, 0.34, et);
  const specR = Math.min(w, h) * 0.40;
  const spec = ctx.createRadialGradient(-w * 0.18, -h * 0.22, 0, -w * 0.18, -h * 0.22, specR);
  spec.addColorStop(0,   `rgba(255,248,228,${specBase.toFixed(2)})`);
  spec.addColorStop(0.4, `rgba(255,238,205,${(specBase * 0.38).toFixed(2)})`);
  spec.addColorStop(1,   'rgba(255,235,195,0)');
  ctx.fillStyle = spec;
  if (shape === 'circle' || !shape) {
    ctx.beginPath(); ctx.arc(0, 0, w / 2, 0, Math.PI * 2); ctx.fill();
  } else {
    drawRoundedRect(ctx, -w / 2, -h / 2, w, h, r); ctx.fill();
  }

  const topHL = ctx.createLinearGradient(0, -h / 2, 0, h * 0.1);
  topHL.addColorStop(0, `rgba(255,255,255,${lerp(0.07, 0.11, et).toFixed(2)})`);
  topHL.addColorStop(0.5,'rgba(255,255,255,0.02)');
  topHL.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = topHL;
  if (shape === 'circle' || !shape) {
    ctx.beginPath(); ctx.arc(0, 0, w / 2, 0, Math.PI * 2); ctx.fill();
  } else {
    drawRoundedRect(ctx, -w / 2, -h / 2, w, h, r); ctx.fill();
  }
}

function drawTable(ctx: CanvasRenderingContext2D, obj: V2LayoutObject, isSelected: boolean, isHovered: boolean, status: 'green' | 'yellow' | 'red' | undefined, renderMode: 'editor' | 'customer', zoom: number, isRecommended = false, hoverT = 0, isJoinable = false) {
  const { width, height, shape } = obj;
  const capacity = obj.capacity || 2;
  const r = Math.min(shape === 'circle' ? width / 2 : (renderMode === 'customer' ? 10 / zoom : 4 / zoom), width / 4, height / 4);
  const et = easeOut(hoverT);

  if (renderMode === 'editor') {
    // Draw chairs first so the table body renders on top
    drawChairs(ctx, obj, zoom, false);

    let fill: string, stroke: string;
    if (status === 'green') { fill = '#10b981'; stroke = '#059669'; }
    else if (status === 'yellow') { fill = '#f59e0b'; stroke = '#d97706'; }
    else if (status === 'red') { fill = '#94a3b8'; stroke = '#64748b'; }
    else { fill = isSelected ? '#3b82f6' : (isHovered ? '#60a5fa' : '#64748b'); stroke = isSelected ? '#2563eb' : '#374151'; }

    ctx.shadowColor = isSelected ? 'rgba(59,130,246,0.35)' : 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = isSelected ? 12 / zoom : 4 / zoom;
    ctx.shadowOffsetY = isSelected ? 0 : 2 / zoom;
    ctx.fillStyle = fill;
    ctx.strokeStyle = isSelected ? '#60a5fa' : stroke;
    ctx.lineWidth = isSelected ? 2.5 / zoom : 1.5 / zoom;

    if (shape === 'circle' || !shape) {
      ctx.beginPath(); ctx.arc(0, 0, width / 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else {
      drawRoundedRect(ctx, -width / 2, -height / 2, width, height, r); ctx.fill(); ctx.stroke();
    }
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;

    const fontSize = Math.min(Math.max(13 / zoom, 9), 15);
    ctx.fillStyle = 'rgba(255,255,255,0.97)';
    ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(obj.name || '', 0, 0);
    return;
  }

  // Status already reflects combo availability from the server — no override needed.
  // isJoinable only controls the "+" suffix on the capacity label.
  const effectiveStatus = status;
  const isTaken = status === 'red' || !status;
  const alpha = isTaken ? 0.55 : 1;

  // Draw chairs before anything else so the table and glow render on top
  drawChairs(ctx, obj, zoom, isTaken);

  ctx.globalAlpha = alpha;

  // Smooth scale lift: 1.0 → 1.038
  const scale = isTaken ? 1 : lerp(1, 1.038, et);
  if (scale !== 1) ctx.scale(scale, scale);

  if (!isTaken) {
    const glowR = Math.max(width, height || width) * 1.15;
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, glowR);
    if (effectiveStatus === 'green') {
      // Recommended: blended emerald + warm-gold bloom for premium lift
      const emeraldBase = isRecommended ? lerp(0.09, 0.16, easeOut(hoverT)) : lerp(0.07, 0.14, easeOut(hoverT));
      glow.addColorStop(0,   `rgba(52,200,130,${emeraldBase.toFixed(3)})`);
      glow.addColorStop(0.55,`rgba(40,170,105,${(emeraldBase * 0.45).toFixed(3)})`);
      glow.addColorStop(1,   'rgba(0,0,0,0)');
      if (isRecommended) {
        // Second pass: warm gold halo layered over the emerald bloom
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(0, 0, glowR, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        const goldGlowR = Math.max(width, height || width) * 1.22;
        const goldGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, goldGlowR);
        const gA = lerp(0.06, 0.12, easeOut(hoverT));
        goldGlow.addColorStop(0,   `rgba(215,175,68,${gA.toFixed(3)})`);
        goldGlow.addColorStop(0.5, `rgba(195,155,50,${(gA * 0.4).toFixed(3)})`);
        goldGlow.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.fillStyle = goldGlow;
        ctx.beginPath(); ctx.arc(0, 0, goldGlowR, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else {
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(0, 0, glowR, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    } else {
      // Amber tables: only show on hover
      glow.addColorStop(0,   `rgba(255,220,160,${(0.10 * easeOut(hoverT)).toFixed(3)})`);
      glow.addColorStop(0.6, `rgba(240,200,130,${(0.03 * easeOut(hoverT)).toFixed(3)})`);
      glow.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(0, 0, glowR, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  drawTableBase(ctx, shape, width, height, zoom, isTaken ? 0 : hoverT, isSelected);

  if (!isTaken) {
    const ringR = (shape === 'circle' || !shape) ? width / 2 + (isSelected ? 5 : 3.5) / zoom : -1;
    const ringInset = isSelected ? 5 / zoom : 3.5 / zoom;

    if (isSelected) {
      ctx.shadowColor = 'rgba(205,172,58,0.38)';
      ctx.shadowBlur = 18 / zoom;
      ctx.strokeStyle = '#c8a836';
      ctx.lineWidth = 2 / zoom;
      ctx.globalAlpha = 1.0;
    } else if (isRecommended) {
      // Green ring (same as available) — keeps the "available" language
      ctx.shadowColor = `rgba(52,200,130,${lerp(0.36, 0.55, et).toFixed(2)})`;
      ctx.shadowBlur = lerp(12, 22, et) / zoom;
      ctx.strokeStyle = `rgba(68,210,140,${lerp(0.86, 0.98, et).toFixed(2)})`;
      ctx.lineWidth = lerp(2.2, 2.8, et) / zoom;
      ctx.globalAlpha = lerp(0.92, 1.0, et);
      if (shape === 'circle' || !shape) {
        ctx.beginPath(); ctx.arc(0, 0, ringR, 0, Math.PI * 2); ctx.stroke();
      } else {
        drawRoundedRect(ctx, -width / 2 - ringInset, -height / 2 - ringInset, width + ringInset * 2, height + ringInset * 2, r + ringInset); ctx.stroke();
      }
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
      // Thin champagne-gold outer halo — recommendation accent, sits just outside the green ring
      const haloInset = ringInset + 3.5 / zoom;
      const haloRingR = (shape === 'circle' || !shape) ? width / 2 + haloInset : -1;
      ctx.shadowColor = `rgba(210,172,62,${lerp(0.20, 0.36, et).toFixed(2)})`;
      ctx.shadowBlur = lerp(8, 14, et) / zoom;
      ctx.strokeStyle = `rgba(215,178,72,${lerp(0.38, 0.58, et).toFixed(2)})`;
      ctx.lineWidth = lerp(1.0, 1.4, et) / zoom;
      ctx.globalAlpha = lerp(0.72, 0.90, et);
      if (shape === 'circle' || !shape) {
        ctx.beginPath(); ctx.arc(0, 0, haloRingR, 0, Math.PI * 2); ctx.stroke();
      } else {
        drawRoundedRect(ctx, -width / 2 - haloInset, -height / 2 - haloInset, width + haloInset * 2, height + haloInset * 2, r + haloInset); ctx.stroke();
      }
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      ctx.globalAlpha = alpha;
      // Faint dual-tone inner wash: emerald + hint of gold
      const innerGlow = (shape === 'circle' || !shape)
        ? ctx.createRadialGradient(0, 0, 0, 0, 0, width / 2)
        : ctx.createLinearGradient(0, -height / 2, 0, height / 2);
      innerGlow.addColorStop(0, `rgba(52,200,130,${lerp(0.04, 0.08, et).toFixed(3)})`);
      innerGlow.addColorStop(0.6, `rgba(215,178,72,${lerp(0.015, 0.03, et).toFixed(3)})`);
      innerGlow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = innerGlow;
      if (shape === 'circle' || !shape) { ctx.beginPath(); ctx.arc(0, 0, width / 2, 0, Math.PI * 2); ctx.fill(); }
      else { drawRoundedRect(ctx, -width / 2, -height / 2, width, height, r); ctx.fill(); }
      // Skip the shared stroke/inner-glow block below
    } else if (effectiveStatus === 'green') {
      // Emerald ring: clearly visible at rest, brightens on hover
      ctx.shadowColor = `rgba(52,200,130,${lerp(0.32, 0.52, et).toFixed(2)})`;
      ctx.shadowBlur = lerp(10, 20, et) / zoom;
      const sA = lerp(0.82, 0.98, et).toFixed(2);
      ctx.strokeStyle = `rgba(68,210,140,${sA})`;
      ctx.lineWidth = lerp(2.2, 2.8, et) / zoom;
      ctx.globalAlpha = lerp(0.90, 1.0, et);
    } else {
      ctx.shadowColor = `rgba(175,140,55,${lerp(0.15, 0.28, et).toFixed(2)})`;
      ctx.shadowBlur = lerp(7, 16, et) / zoom;
      const sA = lerp(0.52, 0.82, et).toFixed(2);
      ctx.strokeStyle = `rgba(200,162,72,${sA})`;
      ctx.lineWidth = lerp(1.5, 2.2, et) / zoom;
      ctx.globalAlpha = lerp(0.74, 0.98, et);
    }

    if (!isRecommended) {
    if (shape === 'circle' || !shape) {
      ctx.beginPath(); ctx.arc(0, 0, ringR, 0, Math.PI * 2); ctx.stroke();
    } else {
      drawRoundedRect(ctx, -width / 2 - ringInset, -height / 2 - ringInset, width + ringInset * 2, height + ringInset * 2, r + ringInset); ctx.stroke();
    }
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.globalAlpha = alpha;

    if (isSelected) {
      const innerGlow = (shape === 'circle' || !shape)
        ? ctx.createRadialGradient(0, 0, width * 0.1, 0, 0, width / 2)
        : ctx.createLinearGradient(0, -height / 2, 0, height / 2);
      innerGlow.addColorStop(0, 'rgba(185,150,42,0.04)');
      innerGlow.addColorStop(1, 'rgba(185,150,42,0.0)');
      ctx.fillStyle = innerGlow;
      if (shape === 'circle' || !shape) { ctx.beginPath(); ctx.arc(0, 0, width / 2, 0, Math.PI * 2); ctx.fill(); }
      else { drawRoundedRect(ctx, -width / 2, -height / 2, width, height, r); ctx.fill(); }
    } else if (effectiveStatus === 'green') {
      // Very faint emerald inner wash to separate available tables from the floor
      const innerGlow = (shape === 'circle' || !shape)
        ? ctx.createRadialGradient(0, 0, 0, 0, 0, width / 2)
        : ctx.createLinearGradient(0, -height / 2, 0, height / 2);
      innerGlow.addColorStop(0, `rgba(52,200,130,${lerp(0.03, 0.06, et).toFixed(3)})`);
      innerGlow.addColorStop(1, 'rgba(52,200,130,0)');
      ctx.fillStyle = innerGlow;
      if (shape === 'circle' || !shape) { ctx.beginPath(); ctx.arc(0, 0, width / 2, 0, Math.PI * 2); ctx.fill(); }
      else { drawRoundedRect(ctx, -width / 2, -height / 2, width, height, r); ctx.fill(); }
    }
    } // end !isRecommended
  }

  if (scale !== 1) ctx.scale(1 / scale, 1 / scale);

  ctx.globalAlpha = isTaken ? 0.28 : alpha;

  const capStr = isJoinable ? `${capacity}+` : String(capacity);
  const capFontSize = Math.min(Math.max(30 / zoom, 17), 36);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

  if (!isTaken) {
    const totalH = capFontSize * 1.2;

    const badgePad = Math.max(12 / zoom, 6);
    ctx.font = `700 ${capFontSize}px system-ui, sans-serif`;
    const capW = ctx.measureText(capStr).width;
    const badgeW = capW + badgePad * 2;
    const badgeH = totalH + badgePad * 1.4;
    const badgeR = Math.min(badgeW / 2, badgeH / 2, 12 / zoom);
    const bx = -badgeW / 2;
    const by = -badgeH / 2;

    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 8 / zoom;
    ctx.shadowOffsetY = 3 / zoom;

    const bg = ctx.createLinearGradient(bx, by, bx, by + badgeH);
    if (isSelected) {
      bg.addColorStop(0, 'rgba(40,30,12,0.97)');
      bg.addColorStop(1, 'rgba(26,18,6,0.97)');
    } else if (effectiveStatus === 'green') {
      bg.addColorStop(0, 'rgba(14,26,20,0.95)');
      bg.addColorStop(1, 'rgba(8,18,12,0.95)');
    } else {
      bg.addColorStop(0, 'rgba(32,24,10,0.95)');
      bg.addColorStop(1, 'rgba(20,14,5,0.95)');
    }
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.roundRect(bx, by, badgeW, badgeH, badgeR); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    const border = ctx.createLinearGradient(bx, by, bx + badgeW, by + badgeH);
    if (isSelected) {
      border.addColorStop(0, 'rgba(232,198,90,0.95)');
      border.addColorStop(1, 'rgba(185,148,50,0.60)');
    } else if (effectiveStatus === 'green') {
      const bA0 = lerp(0.80, 0.92, et).toFixed(2);
      const bA1 = lerp(0.45, 0.60, et).toFixed(2);
      border.addColorStop(0, `rgba(148,205,172,${bA0})`);
      border.addColorStop(1, `rgba(105,162,132,${bA1})`);
    } else {
      const bA0 = lerp(0.78, 0.92, et).toFixed(2);
      const bA1 = lerp(0.42, 0.58, et).toFixed(2);
      border.addColorStop(0, `rgba(215,178,82,${bA0})`);
      border.addColorStop(1, `rgba(158,120,40,${bA1})`);
    }
    ctx.strokeStyle = border;
    ctx.lineWidth = 1.5 / zoom;
    ctx.beginPath(); ctx.roundRect(bx + 0.75 / zoom, by + 0.75 / zoom, badgeW - 1.5 / zoom, badgeH - 1.5 / zoom, badgeR - 0.75 / zoom); ctx.stroke();

    ctx.font = `700 ${capFontSize}px system-ui, sans-serif`;
    if (isSelected) { ctx.fillStyle = 'rgba(252,235,185,1.0)'; }
    else if (effectiveStatus === 'green') {
      const g = Math.round(lerp(195, 218, et));
      ctx.fillStyle = `rgba(${Math.round(lerp(195,218,et))},${Math.round(lerp(232,248,et))},${Math.round(lerp(215,232,et))},1.0)`;
      void g;
    }
    else {
      ctx.fillStyle = `rgba(${Math.round(lerp(245,255,et))},${Math.round(lerp(218,232,et))},${Math.round(lerp(165,178,et))},1.0)`;
    }
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 3 / zoom;
    ctx.fillText(capStr, 0, 0);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
  } else {
    const capFontSize2 = Math.min(Math.max(22 / zoom, 14), 26);
    ctx.font = `700 ${capFontSize2}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(110,100,90,0.40)';
    ctx.fillText(capStr, 0, 0);
  }

  ctx.globalAlpha = 1;
}

function drawWall(ctx: CanvasRenderingContext2D, obj: V2LayoutObject, isSelected: boolean, renderMode: 'editor' | 'customer', zoom: number) {
  ctx.shadowColor = renderMode === 'customer' ? 'rgba(0,0,0,0.5)' : 'transparent';
  ctx.shadowBlur = renderMode === 'customer' ? 8 / zoom : 0;
  ctx.shadowOffsetY = renderMode === 'customer' ? 3 / zoom : 0;
  ctx.strokeStyle = renderMode === 'customer' ? 'rgba(38,30,22,0.95)' : (isSelected ? '#3b82f6' : '#334155');
  ctx.lineWidth = obj.height / zoom; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-obj.width / 2, 0); ctx.lineTo(obj.width / 2, 0); ctx.stroke();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  if (isSelected && renderMode === 'editor') {
    const hs = 8 / zoom;
    ctx.fillStyle = '#3b82f6'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 / zoom;
    [obj.width / 2, -obj.width / 2].forEach(px => { ctx.beginPath(); ctx.arc(px, 0, hs, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
    ctx.fillStyle = '#10b981';
    ctx.beginPath(); ctx.arc(0, -obj.width / 4, hs, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
}

function drawDoor(ctx: CanvasRenderingContext2D, obj: V2LayoutObject, isSelected: boolean, renderMode: 'editor' | 'customer', zoom: number) {
  const w = obj.width, h = obj.height;
  const dir = (obj.properties?.doorDirection as number) ?? 1;

  if (renderMode === 'customer') {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = isSelected ? '#3b82f6' : 'rgba(195,155,95,0.95)';
    ctx.lineWidth = h / zoom; ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(210,165,90,0.5)';
    ctx.shadowBlur = 6 / zoom;
    ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(w / 2, 0); ctx.stroke();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;

    ctx.strokeStyle = isSelected ? '#3b82f6' : 'rgba(215,175,105,0.82)';
    ctx.lineWidth = 1.8 / zoom;
    ctx.setLineDash([4 / zoom, 3 / zoom]);
    ctx.beginPath(); ctx.moveTo(-w / 2 + w, 0); ctx.lineTo(-w / 2 + w, dir * w); ctx.stroke();
    ctx.beginPath(); ctx.arc(-w / 2, 0, w, 0, dir * Math.PI / 2, dir < 0); ctx.stroke();
    ctx.setLineDash([]);

    ctx.globalAlpha = 0.35;
    ctx.shadowColor = 'rgba(210,165,90,0.4)';
    ctx.shadowBlur = 10 / zoom;
    ctx.strokeStyle = isSelected ? '#3b82f6' : 'rgba(210,165,90,0.55)';
    ctx.lineWidth = h / zoom + 2 / zoom; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(w / 2, 0); ctx.stroke();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  } else {
    ctx.strokeStyle = isSelected ? '#3b82f6' : '#92400e';
    ctx.lineWidth = h / zoom; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(w / 2, 0); ctx.stroke();
    ctx.strokeStyle = isSelected ? '#3b82f6' : '#78350f';
    ctx.lineWidth = 1.5 / zoom;
    ctx.setLineDash([4 / zoom, 3 / zoom]);
    ctx.beginPath(); ctx.moveTo(-w / 2 + w, 0); ctx.lineTo(-w / 2 + w, dir * w); ctx.stroke();
    ctx.beginPath(); ctx.arc(-w / 2, 0, w, 0, dir * Math.PI / 2, dir < 0); ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawWindow(ctx: CanvasRenderingContext2D, obj: V2LayoutObject, isSelected: boolean, renderMode: 'editor' | 'customer', zoom: number) {
  const w = obj.width, h = obj.height;
  const isCustomer = renderMode === 'customer';

  ctx.globalAlpha = 1;

  const frameThick = Math.max(3 / zoom, isCustomer ? 4 / zoom : 3 / zoom);
  const frameColor = isSelected ? '#3b82f6' : (isCustomer ? 'rgba(148,196,225,0.97)' : '#1e6fa8');
  const sillDepth = Math.min(6 / zoom, Math.min(w, h) * 0.18);

  if (isCustomer) {
    // Very subtle directional light spill from window onto adjacent floor
    const spillLen = Math.max(w, h) * 2.8;
    const isHoriz = w >= h;
    const spillGrad = isHoriz
      ? ctx.createLinearGradient(0, h / 2, 0, h / 2 + spillLen)
      : ctx.createLinearGradient(w / 2, 0, w / 2 + spillLen, 0);
    spillGrad.addColorStop(0, 'rgba(185,225,248,0.030)');
    spillGrad.addColorStop(0.35, 'rgba(165,210,238,0.010)');
    spillGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = spillGrad;
    if (isHoriz) {
      ctx.fillRect(-w / 2, h / 2, w, spillLen);
    } else {
      ctx.fillRect(w / 2, -h / 2, spillLen, h);
    }

    // Minimal edge halo — only enough to distinguish the window from the wall
    const glowGrad = ctx.createLinearGradient(-w / 2 - 4 / zoom, 0, w / 2 + 4 / zoom, 0);
    glowGrad.addColorStop(0, 'rgba(148,200,228,0.0)');
    glowGrad.addColorStop(0.15, 'rgba(148,200,228,0.07)');
    glowGrad.addColorStop(0.5, 'rgba(168,215,240,0.12)');
    glowGrad.addColorStop(0.85, 'rgba(148,200,228,0.07)');
    glowGrad.addColorStop(1, 'rgba(148,200,228,0.0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(-w / 2 - 4 / zoom, -h / 2 - 2 / zoom, w + 8 / zoom, h + 4 / zoom);
  }

  const glassFill = isCustomer
    ? ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2)
    : null;
  if (glassFill && isCustomer) {
    (glassFill as CanvasGradient).addColorStop(0, 'rgba(175,212,235,0.28)');
    (glassFill as CanvasGradient).addColorStop(0.4, 'rgba(158,198,228,0.16)');
    (glassFill as CanvasGradient).addColorStop(1, 'rgba(125,175,210,0.08)');
    ctx.fillStyle = glassFill;
  } else {
    ctx.fillStyle = 'rgba(186,230,253,0.55)';
  }
  ctx.fillRect(-w / 2, -h / 2, w, h);

  if (isCustomer) {
    const glare = ctx.createLinearGradient(-w / 2, -h / 2, w * 0.3, h * 0.4);
    glare.addColorStop(0, 'rgba(255,255,255,0.18)');
    glare.addColorStop(0.5, 'rgba(255,255,255,0.05)');
    glare.addColorStop(1, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = glare;
    ctx.fillRect(-w / 2, -h / 2, w, h);
  }

  ctx.fillStyle = isCustomer ? 'rgba(138,188,218,0.32)' : 'rgba(160,195,220,0.7)';
  ctx.fillRect(-w / 2, -h / 2, w, sillDepth);
  ctx.fillRect(-w / 2, h / 2 - sillDepth, w, sillDepth);
  ctx.fillRect(-w / 2, -h / 2, sillDepth, h);
  ctx.fillRect(w / 2 - sillDepth, -h / 2, sillDepth, h);

  ctx.strokeStyle = frameColor;
  ctx.lineWidth = frameThick;
  if (isCustomer) {
    ctx.shadowColor = isSelected ? 'rgba(59,130,246,0.45)' : 'rgba(138,188,218,0.28)';
    ctx.shadowBlur = isSelected ? 7 / zoom : 4 / zoom;
  } else {
    ctx.shadowColor = isSelected ? 'rgba(59,130,246,0.5)' : 'rgba(30,111,168,0.3)';
    ctx.shadowBlur = isSelected ? 8 / zoom : 4 / zoom;
  }
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;

  const fi = sillDepth;
  const innerW = w - fi * 2;
  const innerH = h - fi * 2;

  ctx.strokeStyle = isCustomer ? 'rgba(138,188,218,0.48)' : 'rgba(30,111,168,0.75)';
  ctx.lineWidth = (isCustomer ? 1.2 : 1.5) / zoom;
  ctx.strokeRect(-w / 2 + fi, -h / 2 + fi, innerW, innerH);

  const panes = innerW > innerH ? 2 : (innerH / innerW > 1.8 ? 3 : 2);
  ctx.strokeStyle = isCustomer ? 'rgba(138,188,218,0.40)' : 'rgba(30,111,168,0.75)';
  ctx.lineWidth = (isCustomer ? 1.5 : 1.5) / zoom;
  if (panes === 2) {
    const mx = -w / 2 + fi + innerW / 2;
    ctx.beginPath(); ctx.moveTo(mx, -h / 2 + fi); ctx.lineTo(mx, h / 2 - fi); ctx.stroke();
  } else {
    for (let i = 1; i < panes; i++) {
      const my = -h / 2 + fi + (innerH / panes) * i;
      ctx.beginPath(); ctx.moveTo(-w / 2 + fi, my); ctx.lineTo(w / 2 - fi, my); ctx.stroke();
    }
  }

  if (isCustomer) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(-w / 2 + fi, -h / 2 + fi, innerW, innerH);
    ctx.clip();
    const glareGrad = ctx.createLinearGradient(-w / 2 + fi, -h / 2 + fi, -w / 2 + fi + innerW * 0.55, -h / 2 + fi + innerH * 0.7);
    glareGrad.addColorStop(0, 'rgba(235,248,255,0.14)');
    glareGrad.addColorStop(0.5, 'rgba(210,238,252,0.04)');
    glareGrad.addColorStop(1, 'rgba(185,225,248,0.0)');
    ctx.fillStyle = glareGrad;
    ctx.fillRect(-w / 2 + fi, -h / 2 + fi, innerW, innerH);
    ctx.restore();
  }

  ctx.globalAlpha = 1;
}

function drawWC(ctx: CanvasRenderingContext2D, obj: V2LayoutObject, isSelected: boolean, renderMode: 'editor' | 'customer', zoom: number) {
  const w = obj.width, h = obj.height;
  const isCustomer = renderMode === 'customer';

  ctx.globalAlpha = 1;

  if (isCustomer) {
    const wcR = Math.min(8 / zoom, w / 3, h / 3);
    ctx.globalAlpha = 1;

    ctx.shadowColor = 'rgba(0,0,0,0.50)';
    ctx.shadowBlur = 7 / zoom;
    ctx.shadowOffsetY = 2 / zoom;
    // Muted slate-teal — reads as "washroom/tile" against the warm wooden floor
    const grad = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    grad.addColorStop(0, isSelected ? 'rgba(56,90,110,0.97)' : 'rgba(34,50,58,0.97)');
    grad.addColorStop(1, isSelected ? 'rgba(40,68,84,0.97)' : 'rgba(24,38,46,0.97)');
    ctx.fillStyle = grad;
    drawRoundedRect(ctx, -w / 2, -h / 2, w, h, wcR);
    ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    // Subtle top-edge highlight for depth
    const wcSheen = ctx.createLinearGradient(0, -h / 2, 0, -h / 4);
    wcSheen.addColorStop(0, 'rgba(160,210,230,0.06)');
    wcSheen.addColorStop(1, 'rgba(160,210,230,0)');
    ctx.fillStyle = wcSheen;
    drawRoundedRect(ctx, -w / 2, -h / 2, w, h, wcR);
    ctx.fill();

    ctx.strokeStyle = isSelected ? 'rgba(100,170,210,0.65)' : 'rgba(80,120,145,0.50)';
    ctx.lineWidth = 1.5 / zoom;
    drawRoundedRect(ctx, -w / 2 + 0.75 / zoom, -h / 2 + 0.75 / zoom, w - 1.5 / zoom, h - 1.5 / zoom, Math.max(0, wcR - 0.75 / zoom));
    ctx.stroke();

    const labelSize = Math.max(10 / zoom, 8);
    ctx.fillStyle = isSelected ? 'rgba(170,215,240,0.88)' : 'rgba(130,175,200,0.72)';
    ctx.font = `500 ${labelSize}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('WC', 0, 0);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
  } else {
    ctx.shadowColor = isSelected ? 'rgba(59,130,246,0.35)' : 'rgba(0,0,0,0.22)';
    ctx.shadowBlur = isSelected ? 10 / zoom : 8 / zoom;
    ctx.shadowOffsetY = isSelected ? 0 : 3 / zoom;
    const editorGrad = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    editorGrad.addColorStop(0, isSelected ? 'rgba(59,130,246,0.35)' : '#4a4540');
    editorGrad.addColorStop(1, isSelected ? 'rgba(59,130,246,0.18)' : '#38342f');
    ctx.fillStyle = editorGrad;
    ctx.strokeStyle = isSelected ? '#3b82f6' : 'rgba(88,80,70,0.75)';
    ctx.lineWidth = 2 / zoom;
    drawRoundedRect(ctx, -w / 2, -h / 2, w, h, Math.min(8 / zoom, w / 4, h / 4));
    ctx.fill(); ctx.stroke();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    const wcLabelSize = Math.min(Math.max(11 / zoom, 8), 14);
    ctx.fillStyle = isSelected ? 'rgba(186,210,255,0.9)' : 'rgba(185,175,158,0.88)';
    ctx.font = `600 ${wcLabelSize}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('WC', 0, 0);
  }
  ctx.globalAlpha = 1;
}

function drawKitchen(ctx: CanvasRenderingContext2D, obj: V2LayoutObject, isSelected: boolean, renderMode: 'editor' | 'customer', zoom: number) {
  const w = obj.width, h = obj.height;
  const isCustomer = renderMode === 'customer';

  ctx.globalAlpha = 1;

  if (isCustomer) {
    const kr = Math.min(6 / zoom, w / 6, h / 6);
    // Multi-layer premium kitchen block: dark base + inner hatching overlay + subdued label
    ctx.globalAlpha = 1;

    // Warm terracotta-charcoal — reads as "heat/cooking zone" against the wooden floor
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 8 / zoom;
    ctx.shadowOffsetY = 3 / zoom;
    const grad = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    grad.addColorStop(0, isSelected ? 'rgba(82,52,36,0.97)' : 'rgba(52,32,20,0.97)');
    grad.addColorStop(1, isSelected ? 'rgba(60,36,24,0.97)' : 'rgba(38,22,13,0.97)');
    ctx.fillStyle = grad;
    drawRoundedRect(ctx, -w / 2, -h / 2, w, h, kr);
    ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    // Warm top-edge sheen suggesting heat/steel surfaces
    const sheen = ctx.createLinearGradient(0, -h / 2, 0, -h / 4);
    sheen.addColorStop(0, 'rgba(255,180,100,0.06)');
    sheen.addColorStop(1, 'rgba(255,160,80,0)');
    ctx.fillStyle = sheen;
    drawRoundedRect(ctx, -w / 2, -h / 2, w, h, kr);
    ctx.fill();

    // Border — warm burnt-orange tint, more readable than neutral grey
    ctx.strokeStyle = isSelected ? 'rgba(200,120,60,0.70)' : 'rgba(140,80,40,0.52)';
    ctx.lineWidth = 1.5 / zoom;
    drawRoundedRect(ctx, -w / 2 + 0.75 / zoom, -h / 2 + 0.75 / zoom, w - 1.5 / zoom, h - 1.5 / zoom, Math.max(0, kr - 0.75 / zoom));
    ctx.stroke();

    // Label
    const labelSize2 = Math.max(10 / zoom, 8);
    ctx.fillStyle = isSelected ? 'rgba(240,165,95,0.88)' : 'rgba(195,130,75,0.72)';
    ctx.font = `500 ${labelSize2}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '0.08em';
    ctx.fillText('KITCHEN', 0, 0);
    ctx.letterSpacing = '0';
  } else {
    ctx.shadowColor = isSelected ? 'rgba(59,130,246,0.35)' : 'rgba(0,0,0,0.22)';
    ctx.shadowBlur = isSelected ? 10 / zoom : 8 / zoom;
    ctx.shadowOffsetY = isSelected ? 0 : 3 / zoom;
    const kitchenGrad = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    kitchenGrad.addColorStop(0, isSelected ? 'rgba(249,115,22,0.35)' : '#3e3a35');
    kitchenGrad.addColorStop(1, isSelected ? 'rgba(249,115,22,0.18)' : '#2e2b27');
    ctx.fillStyle = kitchenGrad;
    ctx.strokeStyle = isSelected ? '#f97316' : 'rgba(82,76,68,0.75)';
    ctx.lineWidth = 2 / zoom;
    drawRoundedRect(ctx, -w / 2, -h / 2, w, h, Math.min(6 / zoom, w / 5, h / 5));
    ctx.fill(); ctx.stroke();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    const kitchenLabelSize = Math.min(Math.max(11 / zoom, 8), 14);
    ctx.fillStyle = isSelected ? 'rgba(253,186,116,0.9)' : 'rgba(175,165,148,0.88)';
    ctx.font = `600 ${kitchenLabelSize}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('KITCHEN', 0, 0);
  }
  ctx.globalAlpha = 1;
}

function drawBarCounter(ctx: CanvasRenderingContext2D, obj: V2LayoutObject, isSelected: boolean, renderMode: 'editor' | 'customer', zoom: number) {
  const w = obj.width, h = obj.height;
  const isCustomer = renderMode === 'customer';
  ctx.globalAlpha = isCustomer ? 0.68 : 1;
  const r = Math.min(6 / zoom, h / 3);

  if (isCustomer) {
    const barFill = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    barFill.addColorStop(0, isSelected ? '#1d4ed8' : '#4a4238');
    barFill.addColorStop(1, isSelected ? '#1e40af' : '#38332c');
    ctx.fillStyle = barFill;
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 10 / zoom;
    ctx.shadowOffsetY = 3 / zoom;
    drawRoundedRect(ctx, -w / 2, -h / 2, w, h, r); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = isSelected ? '#3b82f6' : 'rgba(88,80,68,0.65)';
    ctx.lineWidth = 1.5 / zoom;
    drawRoundedRect(ctx, -w / 2, -h / 2, w, h, r); ctx.stroke();
  } else {
    ctx.shadowColor = isSelected ? 'rgba(59,130,246,0.4)' : 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = isSelected ? 10 / zoom : 12 / zoom;
    ctx.shadowOffsetY = isSelected ? 0 : 4 / zoom;
    const barEditorFill = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    barEditorFill.addColorStop(0, isSelected ? '#1d4ed8' : '#4a4238');
    barEditorFill.addColorStop(1, isSelected ? '#1e40af' : '#38332c');
    ctx.fillStyle = barEditorFill;
    drawRoundedRect(ctx, -w / 2, -h / 2, w, h, r); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = isSelected ? '#3b82f6' : 'rgba(92,84,72,0.80)'; ctx.lineWidth = 2 / zoom;
    drawRoundedRect(ctx, -w / 2, -h / 2, w, h, r); ctx.stroke();
  }

  ctx.fillStyle = isCustomer ? 'rgba(210,200,182,0.95)' : (isSelected ? 'rgba(186,210,255,0.92)' : 'rgba(185,175,158,0.88)');
  ctx.font = `700 ${Math.min(isCustomer ? Math.max(10 / zoom, 8) : Math.max(12 / zoom, 9), isCustomer ? 13 : 15)}px system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('BAR', 0, 0);
  ctx.globalAlpha = 1;
}

function drawBarStool(ctx: CanvasRenderingContext2D, obj: V2LayoutObject, isSelected: boolean, renderMode: 'editor' | 'customer', zoom: number) {
  const r = obj.width / 2;
  ctx.globalAlpha = renderMode === 'customer' ? 0.38 : 1;
  ctx.shadowColor = isSelected && renderMode === 'editor' ? 'rgba(59,130,246,0.35)' : 'rgba(0,0,0,0.2)';
  ctx.shadowBlur = isSelected && renderMode === 'editor' ? 10 / zoom : 8 / zoom; ctx.shadowOffsetY = isSelected && renderMode === 'editor' ? 0 : 3 / zoom;
  ctx.fillStyle = isSelected ? '#3b82f6' : (renderMode === 'customer' ? '#3e3830' : '#92400e'); ctx.strokeStyle = isSelected ? '#2563eb' : (renderMode === 'customer' ? '#5a5248' : '#78350f'); ctx.lineWidth = 1.5 / zoom;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.5 / zoom;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawBooth(ctx: CanvasRenderingContext2D, obj: V2LayoutObject, isSelected: boolean, isHovered: boolean, status: 'green' | 'yellow' | 'red' | undefined, renderMode: 'editor' | 'customer', zoom: number, isRecommended = false, rotation = 0, hoverT = 0) {
  const w = obj.width, h = obj.height;
  const capacity = obj.capacity || 4;
  const et = easeOut(hoverT);

  if (renderMode === 'editor') {
    const bodyFill = isSelected ? '#1d4ed8' : '#44403c';
    const tableFill = isSelected ? 'rgba(219,234,254,0.6)' : '#d6d3d1';
    const strokeColor = isSelected ? '#60a5fa' : '#1c1917';
    ctx.shadowColor = isSelected ? 'rgba(59,130,246,0.35)' : 'rgba(0,0,0,0.2)';
    ctx.shadowBlur = 10 / zoom; ctx.shadowOffsetY = isSelected ? 0 : 4 / zoom;
    const rO = Math.min(10 / zoom, h / 4);
    ctx.fillStyle = bodyFill;
    drawRoundedRect(ctx, -w / 2, -h / 2, w, h, rO); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    const tw = w * 0.55, th = h * 0.35;
    ctx.fillStyle = tableFill;
    drawRoundedRect(ctx, -tw / 2, -th / 2, tw, th, Math.min(4 / zoom, th / 3)); ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = isSelected ? 2.5 / zoom : 1.5 / zoom;
    drawRoundedRect(ctx, -w / 2, -h / 2, w, h, rO); ctx.stroke();
    const editorFontSize = Math.min(Math.max(11 / zoom, 8), 13);
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.font = `600 ${editorFontSize}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(obj.name || 'BOOTH', 0, 0);
    return;
  }

  const isTaken = status === 'red' || !status;
  const alpha = isTaken ? 0.55 : 1;
  ctx.globalAlpha = alpha;

  // Smooth scale lift: 1.0 → 1.032
  const scale = isTaken ? 1 : lerp(1, 1.032, et);
  if (scale !== 1) ctx.scale(scale, scale);

  if (!isTaken) {
    const boothGlowR = Math.max(w, h) * 1.15;
    const boothGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, boothGlowR);
    if (status === 'green') {
      const emeraldBase = isRecommended ? lerp(0.09, 0.16, easeOut(hoverT)) : lerp(0.07, 0.14, easeOut(hoverT));
      boothGlow.addColorStop(0,   `rgba(52,200,130,${emeraldBase.toFixed(3)})`);
      boothGlow.addColorStop(0.55,`rgba(40,170,105,${(emeraldBase * 0.45).toFixed(3)})`);
      boothGlow.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.save(); ctx.globalAlpha = 1; ctx.fillStyle = boothGlow;
      ctx.beginPath(); ctx.arc(0, 0, boothGlowR, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      if (isRecommended) {
        const goldGlowR = Math.max(w, h) * 1.22;
        const goldGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, goldGlowR);
        const gA = lerp(0.06, 0.12, easeOut(hoverT));
        goldGlow.addColorStop(0,   `rgba(215,175,68,${gA.toFixed(3)})`);
        goldGlow.addColorStop(0.5, `rgba(195,155,50,${(gA * 0.4).toFixed(3)})`);
        goldGlow.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.save(); ctx.globalAlpha = 1; ctx.fillStyle = goldGlow;
        ctx.beginPath(); ctx.arc(0, 0, goldGlowR, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
    } else {
      boothGlow.addColorStop(0,   `rgba(255,220,160,${(0.10 * easeOut(hoverT)).toFixed(3)})`);
      boothGlow.addColorStop(0.6, `rgba(240,200,130,${(0.03 * easeOut(hoverT)).toFixed(3)})`);
      boothGlow.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.save(); ctx.globalAlpha = 1; ctx.fillStyle = boothGlow;
      ctx.beginPath(); ctx.arc(0, 0, boothGlowR, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }

  const stackVar = ((Math.round(obj.worldY / 10) * 7 + Math.round(obj.worldX / 10) * 3) % 5) / 5;
  const shadowAlpha = (0.38 + stackVar * 0.08).toFixed(2);

  const rO = Math.min(10 / zoom, h / 4);
  const boothBaseL0 = Math.round(30 + stackVar * 6);
  const boothBaseL1 = Math.round(22 + stackVar * 4);
  const hL0 = Math.round(lerp(boothBaseL0, boothBaseL0 + 8, et));
  const hL0b = Math.round(lerp(boothBaseL0 - 1, boothBaseL0 + 7, et));
  const hL0c = Math.round(lerp(boothBaseL0 + 8, boothBaseL0 + 14, et));
  const bodyGrad = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  bodyGrad.addColorStop(0, isSelected ? '#2a2838' : `rgb(${hL0},${hL0b},${hL0c})`);
  bodyGrad.addColorStop(1, isSelected ? '#1c1a28' : `rgb(${boothBaseL1},${boothBaseL1 - 1},${boothBaseL1 + 5})`);
  ctx.fillStyle = bodyGrad;
  ctx.shadowColor = `rgba(0,0,0,${shadowAlpha})`;
  ctx.shadowBlur = (isSelected ? 14 : lerp(6 + stackVar * 2, 12, et)) / zoom;
  ctx.shadowOffsetY = (isSelected ? 0 : lerp(3, 1, et)) / zoom;
  drawRoundedRect(ctx, -w / 2, -h / 2, w, h, rO); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;

  const topHLAlpha = lerp(0.025 + stackVar * 0.015, 0.055 + stackVar * 0.015, et);
  const topHL = ctx.createLinearGradient(0, -h / 2, 0, -h / 4);
  topHL.addColorStop(0, `rgba(255,255,255,${topHLAlpha.toFixed(3)})`);
  topHL.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = topHL;
  drawRoundedRect(ctx, -w / 2, -h / 2, w, h, rO); ctx.fill();

  const tw = w * 0.52, th = h * 0.32;
  const tableGrad = ctx.createLinearGradient(0, -th / 2, 0, th / 2);
  tableGrad.addColorStop(0, isTaken ? '#1b1b1f' : '#22222e');
  tableGrad.addColorStop(1, isTaken ? '#161616' : '#1a1a26');
  ctx.fillStyle = tableGrad;
  drawRoundedRect(ctx, -tw / 2, -th / 2, tw, th, Math.min(5 / zoom, th / 3)); ctx.fill();

  if (!isTaken) {
    const ringInset = isSelected ? 5 / zoom : 3.5 / zoom;
    if (isSelected) {
      ctx.shadowColor = 'rgba(188,155,48,0.28)';
      ctx.shadowBlur = 16 / zoom;
      ctx.strokeStyle = '#b89830';
      ctx.lineWidth = 1.8 / zoom;
      ctx.globalAlpha = 0.82;
      drawRoundedRect(ctx, -w / 2 - ringInset, -h / 2 - ringInset, w + ringInset * 2, h + ringInset * 2, rO + ringInset); ctx.stroke();
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      ctx.globalAlpha = alpha;
      const innerGlow = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
      innerGlow.addColorStop(0, 'rgba(185,150,42,0.04)');
      innerGlow.addColorStop(1, 'rgba(185,150,42,0.0)');
      ctx.fillStyle = innerGlow;
      drawRoundedRect(ctx, -w / 2, -h / 2, w, h, rO); ctx.fill();
    } else if (isRecommended) {
      // Green ring — keeps the "available" meaning
      ctx.shadowColor = `rgba(52,200,130,${lerp(0.36, 0.55, et).toFixed(2)})`;
      ctx.shadowBlur = lerp(12, 22, et) / zoom;
      ctx.strokeStyle = `rgba(68,210,140,${lerp(0.86, 0.98, et).toFixed(2)})`;
      ctx.lineWidth = lerp(2.2, 2.8, et) / zoom;
      ctx.globalAlpha = lerp(0.92, 1.0, et);
      drawRoundedRect(ctx, -w / 2 - ringInset, -h / 2 - ringInset, w + ringInset * 2, h + ringInset * 2, rO + ringInset); ctx.stroke();
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
      // Thin champagne-gold outer halo
      const haloInset = ringInset + 3.5 / zoom;
      ctx.shadowColor = `rgba(210,172,62,${lerp(0.20, 0.36, et).toFixed(2)})`;
      ctx.shadowBlur = lerp(8, 14, et) / zoom;
      ctx.strokeStyle = `rgba(215,178,72,${lerp(0.38, 0.58, et).toFixed(2)})`;
      ctx.lineWidth = lerp(1.0, 1.4, et) / zoom;
      ctx.globalAlpha = lerp(0.72, 0.90, et);
      drawRoundedRect(ctx, -w / 2 - haloInset, -h / 2 - haloInset, w + haloInset * 2, h + haloInset * 2, rO + haloInset); ctx.stroke();
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      ctx.globalAlpha = alpha;
      const innerGlow = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
      innerGlow.addColorStop(0, `rgba(52,200,130,${lerp(0.04, 0.08, et).toFixed(3)})`);
      innerGlow.addColorStop(0.6, `rgba(215,178,72,${lerp(0.015, 0.03, et).toFixed(3)})`);
      innerGlow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = innerGlow;
      drawRoundedRect(ctx, -w / 2, -h / 2, w, h, rO); ctx.fill();
    } else if (status === 'green') {
      ctx.shadowColor = `rgba(52,200,130,${lerp(0.32, 0.52, et).toFixed(2)})`;
      ctx.shadowBlur = lerp(10, 20, et) / zoom;
      const sA = lerp(0.82, 0.98, et).toFixed(2);
      ctx.strokeStyle = `rgba(68,210,140,${sA})`;
      ctx.lineWidth = lerp(2.2, 2.8, et) / zoom;
      ctx.globalAlpha = lerp(0.90, 1.0, et);
      drawRoundedRect(ctx, -w / 2 - ringInset, -h / 2 - ringInset, w + ringInset * 2, h + ringInset * 2, rO + ringInset); ctx.stroke();
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      ctx.globalAlpha = alpha;
      const innerGlow = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
      innerGlow.addColorStop(0, `rgba(52,200,130,${lerp(0.03, 0.06, et).toFixed(3)})`);
      innerGlow.addColorStop(1, 'rgba(52,200,130,0)');
      ctx.fillStyle = innerGlow;
      drawRoundedRect(ctx, -w / 2, -h / 2, w, h, rO); ctx.fill();
    } else {
      ctx.shadowColor = `rgba(155,125,52,${lerp(0.12, 0.24, et).toFixed(2)})`;
      ctx.shadowBlur = lerp(6, 12, et) / zoom;
      const sA = lerp(0.36, 0.65, et).toFixed(2);
      ctx.strokeStyle = `rgba(172,140,62,${sA})`;
      ctx.lineWidth = lerp(1.3, 2.0, et) / zoom;
      ctx.globalAlpha = lerp(0.60, 0.88, et);
      drawRoundedRect(ctx, -w / 2 - ringInset, -h / 2 - ringInset, w + ringInset * 2, h + ringInset * 2, rO + ringInset); ctx.stroke();
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      ctx.globalAlpha = alpha;
    }
  } else {
    ctx.strokeStyle = 'rgba(70,70,78,0.25)';
    ctx.lineWidth = 1 / zoom;
    drawRoundedRect(ctx, -w / 2, -h / 2, w, h, rO); ctx.stroke();
  }

  if (scale !== 1) ctx.scale(1 / scale, 1 / scale);

  ctx.save();
  ctx.rotate(-rotation * Math.PI / 180);

  const fontSize = Math.min(Math.max(30 / zoom, 17), 34);
  ctx.globalAlpha = isTaken ? 0.3 : alpha;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

  const capStr2 = String(capacity);

  if (isTaken) {
    ctx.fillStyle = 'rgba(110,100,90,0.42)';
    ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
    ctx.fillText(capStr2, 0, 0);
  } else {
    let capColor: string;
    if (isSelected) { capColor = 'rgba(252,235,188,1.0)'; }
    else if (status === 'green') { capColor = `rgba(${Math.round(lerp(188,215,et))},${Math.round(lerp(225,245,et))},${Math.round(lerp(205,228,et))},1.0)`; }
    else { capColor = `rgba(${Math.round(lerp(242,252,et))},${Math.round(lerp(212,228,et))},${Math.round(lerp(155,175,et))},1.0)`; }

    ctx.fillStyle = capColor;
    ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
    ctx.fillText(capStr2, 0, 0);
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawHostStand(ctx: CanvasRenderingContext2D, obj: V2LayoutObject, isSelected: boolean, renderMode: 'editor' | 'customer', zoom: number) {
  const w = obj.width, h = obj.height;
  ctx.globalAlpha = 1;
  if (renderMode === 'customer') {
    const hsR = Math.min(6 / zoom, w / 4, h / 4);
    ctx.shadowColor = 'rgba(0,0,0,0.40)';
    ctx.shadowBlur = 6 / zoom;
    ctx.shadowOffsetY = 2 / zoom;
    const grad = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    grad.addColorStop(0, isSelected ? 'rgba(38,56,80,0.96)' : 'rgba(36,32,26,0.94)');
    grad.addColorStop(1, isSelected ? 'rgba(28,44,62,0.96)' : 'rgba(26,22,18,0.94)');
    ctx.fillStyle = grad;
    drawRoundedRect(ctx, -w / 2, -h / 2, w, h, hsR); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = isSelected ? 'rgba(80,120,180,0.55)' : 'rgba(88,80,68,0.42)'; ctx.lineWidth = 1.5 / zoom;
    drawRoundedRect(ctx, -w / 2 + 0.75 / zoom, -h / 2 + 0.75 / zoom, w - 1.5 / zoom, h - 1.5 / zoom, Math.max(0, hsR - 0.75 / zoom)); ctx.stroke();
    ctx.fillStyle = isSelected ? 'rgba(148,188,230,0.72)' : 'rgba(155,148,132,0.52)';
    ctx.font = `500 ${Math.max(10 / zoom, 8)}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('HOST', 0, 0);
  } else {
    ctx.shadowColor = isSelected ? 'rgba(59,130,246,0.35)' : 'rgba(0,0,0,0.22)';
    ctx.shadowBlur = 8 / zoom; ctx.shadowOffsetY = isSelected ? 0 : 3 / zoom;
    const hostGrad = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    hostGrad.addColorStop(0, isSelected ? '#1d4ed8' : '#3c3830');
    hostGrad.addColorStop(1, isSelected ? '#1e40af' : '#2e2c28');
    ctx.fillStyle = hostGrad;
    drawRoundedRect(ctx, -w / 2, -h / 2, w, h, Math.min(6 / zoom, w / 4, h / 4)); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = isSelected ? '#3b82f6' : 'rgba(80,74,64,0.80)'; ctx.lineWidth = 2 / zoom;
    drawRoundedRect(ctx, -w / 2, -h / 2, w, h, Math.min(6 / zoom, w / 4, h / 4)); ctx.stroke();
    const hostLabelSize = Math.min(Math.max(11 / zoom, 8), 14);
    ctx.fillStyle = isSelected ? 'rgba(186,210,255,0.9)' : 'rgba(185,175,158,0.88)';
    ctx.font = `600 ${hostLabelSize}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('HOST', 0, 0);
  }
  ctx.globalAlpha = 1;
}

function drawStairs(ctx: CanvasRenderingContext2D, obj: V2LayoutObject, isSelected: boolean, renderMode: 'editor' | 'customer', zoom: number) {
  const w = obj.width, h = obj.height;

  // Warm bronze/gold palette — visually subordinate to tables
  const isCustomer = renderMode === 'customer';
  const baseAlpha  = isCustomer ? 0.30 : 0.70;

  ctx.globalAlpha = baseAlpha;

  // ── Stairwell boundary ───────────────────────────────────────────────────
  ctx.fillStyle   = isCustomer ? 'rgba(185,168,140,0.12)' : 'rgba(160,140,110,0.18)';
  ctx.strokeStyle = isSelected ? '#3b82f6' : (isCustomer ? 'rgba(180,160,120,0.45)' : 'rgba(180,155,100,0.80)');
  ctx.lineWidth   = (isSelected ? 2 : 1.5) / zoom;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.strokeRect(-w / 2, -h / 2, w, h);

  // ── Stair tread lines (stepped offset = proper staircase look) ───────────
  // Each tread is progressively indented from the bottom to give depth
  const TREAD_COUNT = 6;
  const treadH      = h / TREAD_COUNT;
  const maxIndent   = w * 0.28; // maximum horizontal indent at the bottom
  const treadColor  = isSelected ? '#3b82f6' : (isCustomer ? 'rgba(150,130,90,0.50)' : 'rgba(170,145,90,0.90)');
  ctx.strokeStyle   = treadColor;
  ctx.lineWidth     = 1 / zoom;

  for (let i = 0; i < TREAD_COUNT; i++) {
    const y       = -h / 2 + treadH * i;
    // Each successive tread is inset from both sides (steps get narrower going up)
    const indent  = maxIndent * (i / (TREAD_COUNT - 1));
    const x0      = -w / 2 + indent;
    const x1      =  w / 2 - indent;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
  }
  // Bottom closing line of last tread
  ctx.beginPath();
  ctx.moveTo(-w / 2 + maxIndent, h / 2);
  ctx.lineTo( w / 2 - maxIndent, h / 2);
  ctx.stroke();

  // ── Directional arrow (pointing up — towards the ascent) ─────────────────
  const arrowColor = isSelected ? '#3b82f6' : (isCustomer ? 'rgba(180,155,100,0.60)' : 'rgba(190,160,90,1)');
  ctx.strokeStyle  = arrowColor;
  ctx.fillStyle    = arrowColor;
  ctx.lineWidth    = (1.5) / zoom;
  const arrowX     = w * 0.30;
  const arrowTop   = -h / 2 + h * 0.12;
  const arrowBot   = h / 2  - h * 0.15;
  const arrowHead  = 5 / zoom;

  // Shaft
  ctx.beginPath();
  ctx.moveTo(arrowX, arrowBot);
  ctx.lineTo(arrowX, arrowTop);
  ctx.stroke();

  // Arrowhead
  ctx.beginPath();
  ctx.moveTo(arrowX, arrowTop);
  ctx.lineTo(arrowX - arrowHead, arrowTop + arrowHead * 1.5);
  ctx.lineTo(arrowX + arrowHead, arrowTop + arrowHead * 1.5);
  ctx.closePath();
  ctx.fill();

  // ── "UP" label ────────────────────────────────────────────────────────────
  const labelColor = isSelected ? '#3b82f6' : (isCustomer ? 'rgba(160,140,100,0.55)' : 'rgba(185,158,95,1)');
  ctx.fillStyle    = labelColor;
  const fontSize   = Math.max(7 / zoom, 6);
  ctx.font         = `700 ${fontSize}px system-ui, sans-serif`;
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('UP', arrowX - w * 0.13, arrowTop + (arrowBot - arrowTop) / 2);

  ctx.globalAlpha = 1;
}

function drawPlant(ctx: CanvasRenderingContext2D, obj: V2LayoutObject, isSelected: boolean, renderMode: 'editor' | 'customer', zoom: number) {
  const r = Math.min(obj.width, obj.height) / 2;
  ctx.globalAlpha = renderMode === 'customer' ? 0.45 : 1;
  ctx.shadowColor = 'rgba(0,0,0,0.15)'; ctx.shadowBlur = 8 / zoom; ctx.shadowOffsetY = 3 / zoom;
  ctx.fillStyle = isSelected ? '#3b82f6' : '#166534';
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  ctx.fillStyle = isSelected ? '#60a5fa' : '#16a34a';
  ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.15, r * 0.55, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(r * 0.3, -r * 0.15, r * 0.55, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(0, -r * 0.4, r * 0.55, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = isSelected ? '#2563eb' : '#14532d'; ctx.lineWidth = 2 / zoom;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
}

export function PremiumFloorplanCanvas({
  layout,
  rooms,
  renderMode,
  activeTool = 'select',
  selectedObjectId,
  selectedRoomId,
  selectedAreaId,
  tableStatusMap,
  tableUnavailableReasonMap,
  tableUnavailableTypeMap,
  tableJoinableIds,
  partySize,
  recommendedObjectId,
  windowSeatIds,
  windowViewDescriptionMap,
  tagsMap,
  suppressRecommendationBadge = false,
  gridSnapping = false,
  gridSize = 20,
  wallStartPoint,
  roomInProgress,
  fitToContentOnLoad = false,
  showCustomerViewport = false,
  customerViewportSize,
  customerViewportBounds,
  canvasRef: externalCanvasRef,
  editingChairsObjectId,
  onObjectSelect,
  onRoomSelect,
  onObjectMove,
  onObjectUpdate,
  onRoomVertexMove,
  onCameraChange,
  onCanvasClick,
  onRoomVertexClick,
  onChairsUpdate,
  onCustomerViewportBoundsChange,
}: PremiumFloorplanCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const customerBaseCamRef = useRef<V2Camera | null>(null);
  const pinchRef = useRef<{ dist: number; midX: number; midY: number } | null>(null);
  const userHasInteractedRef = useRef(false);
  // Smooth hover lift: maps objectId → progress [0,1]
  const hoverProgressRef = useRef<Map<string, number>>(new Map());
  const hoverRafRef = useRef<number | null>(null);
  const lastHoverFrameRef = useRef<number>(0);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [camera, setCamera] = useState<V2Camera>(() => {
    if (fitToContentOnLoad) {
      const cam = fitToObjects(layout.objects, rooms, 800, 600, selectedAreaId, renderMode, customerViewportBounds);
      if (renderMode === 'customer') customerBaseCamRef.current = cam;
      return cam;
    }
    return layout.camera ? clampCamera(layout.camera) : { panX: 0, panY: 0, zoom: 1 };
  });
  const [isDragging, setIsDragging] = useState(false);
  const [pointerDown, setPointerDown] = useState<{ x: number; y: number } | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  // RMB pan state — desktop only, independent of activeTool
  const [isRmbDown, setIsRmbDown] = useState(false);
  const [rmbDragStart, setRmbDragStart] = useState({ x: 0, y: 0 });
  const [dragObjectId, setDragObjectId] = useState<string | null>(null);
  const [dragObjectStart, setDragObjectStart] = useState({ worldX: 0, worldY: 0 });
  const [wallHandleMode, setWallHandleMode] = useState<'none' | 'resize-start' | 'resize-end' | 'rotate'>('none');
  const [wallOrigProps, setWallOrigProps] = useState<{ width: number; rotation: number; worldX: number; worldY: number } | null>(null);
  const [resizeHandle, setResizeHandle] = useState<'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw' | null>(null);
  const [resizeOrigProps, setResizeOrigProps] = useState<{ worldX: number; worldY: number; width: number; height: number; rotation: number } | null>(null);
  const [resizeDragStart, setResizeDragStart] = useState({ wx: 0, wy: 0 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoverAnimTick, setHoverAnimTick] = useState(0);
  const [dragVertexRoomId, setDragVertexRoomId] = useState<string | null>(null);
  const [dragVertexIndex, setDragVertexIndex] = useState<number | null>(null);
  const [dragVertexStart, setDragVertexStart] = useState({ wx: 0, wy: 0 });
  const [cursorWorld, setCursorWorld] = useState<{ x: number; y: number } | null>(null);
  // Chair edit mode state
  const [chairDragId, setChairDragId] = useState<string | null>(null);
  const [chairDragObjectId, setChairDragObjectId] = useState<string | null>(null);
  const [chairDragStart, setChairDragStart] = useState<{ wx: number; wy: number; cx: number; cy: number }>({ wx: 0, wy: 0, cx: 0, cy: 0 });
  const [hoveredChairId, setHoveredChairId] = useState<string | null>(null);
  const [selectedChairId, setSelectedChairId] = useState<string | null>(null);
  const [chairHandleMode, setChairHandleMode] = useState<ChairHandle | null>(null);
  const [chairHandleObjectId, setChairHandleObjectId] = useState<string | null>(null);
  const [chairHandleStart, setChairHandleStart] = useState<{
    wx: number; wy: number;
    cx: number; cy: number;   // chair local origin
    cw: number; ch: number;   // chair original dimensions
    crot: number;              // chair original rotation
    trot: number;              // table rotation (radians)
  }>({ wx: 0, wy: 0, cx: 0, cy: 0, cw: 0, ch: 0, crot: 0, trot: 0 });

  // Clear selected chair when leaving chair edit mode
  useEffect(() => {
    if (!editingChairsObjectId) setSelectedChairId(null);
  }, [editingChairsObjectId]);

  // Customer viewport resize state
  const [vpDragHandle, setVpDragHandle] = useState<ViewportHandle | null>(null);
  const [vpDragStart, setVpDragStart] = useState<{ wx: number; wy: number; bounds: { minX: number; minY: number; maxX: number; maxY: number } }>({ wx: 0, wy: 0, bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } });

  // Drive smooth hover lift animation (customer mode only, ~180ms ease-out)
  useEffect(() => {
    if (renderMode !== 'customer') return;
    const DURATION = 180;
    const animate = (now: number) => {
      const dt = now - lastHoverFrameRef.current;
      lastHoverFrameRef.current = now;
      let needsFrame = false;
      hoverProgressRef.current.forEach((t, id) => {
        const target = hoveredId === id ? 1 : 0;
        if (t === target) return;
        const step = dt / DURATION;
        // ease-out: advance faster when close to 0, slow near target
        const newT = target === 1
          ? Math.min(1, t + step)
          : Math.max(0, t - step);
        hoverProgressRef.current.set(id, newT);
        needsFrame = true;
      });
      if (hoveredId) {
        const cur = hoverProgressRef.current.get(hoveredId) ?? 0;
        if (cur < 1) {
          hoverProgressRef.current.set(hoveredId, Math.min(1, cur + dt / DURATION));
          needsFrame = true;
        }
      }
      if (needsFrame) {
        setHoverAnimTick(n => n + 1);
        hoverRafRef.current = requestAnimationFrame(animate);
      } else {
        hoverRafRef.current = null;
      }
    };
    if (hoverRafRef.current === null) {
      lastHoverFrameRef.current = performance.now();
      hoverRafRef.current = requestAnimationFrame(animate);
    }
    return () => {
      if (hoverRafRef.current !== null) {
        cancelAnimationFrame(hoverRafRef.current);
        hoverRafRef.current = null;
      }
    };
  }, [hoveredId, renderMode]);

  const reCenterCamera = useCallback(() => {
    if (!containerRef.current) return;
    const r = containerRef.current.getBoundingClientRect();
    const cam = fitToObjects(layout.objects, rooms, r.width, r.height, selectedAreaId, renderMode, customerViewportBounds);
    userHasInteractedRef.current = false;
    setCamera(cam);
    if (renderMode === 'customer') customerBaseCamRef.current = cam;
    onCameraChange?.(cam);
  }, [layout.objects, rooms, selectedAreaId, renderMode, onCameraChange, customerViewportBounds]);

  const zoomInCamera = useCallback(() => {
    setCamera(prev => clampCamera({ ...prev, zoom: Math.min(ZOOM_MAX, prev.zoom * 1.25) }));
  }, []);

  const zoomOutCamera = useCallback(() => {
    setCamera(prev => clampCamera({ ...prev, zoom: Math.max(ZOOM_MIN, prev.zoom / 1.25) }));
  }, []);

  useImperativeHandle(externalCanvasRef, () => ({ reCenter: reCenterCamera, zoomIn: zoomInCamera, zoomOut: zoomOutCamera }), [reCenterCamera, zoomInCamera, zoomOutCamera]);

  const snapToGrid = useCallback((v: number) => gridSnapping ? Math.round(v / gridSize) * gridSize : v, [gridSnapping, gridSize]);

  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        const r = containerRef.current.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        setCanvasSize({ width: r.width, height: r.height });
        if (fitToContentOnLoad && !userHasInteractedRef.current) {
          const cam = fitToObjects(layout.objects, rooms, r.width, r.height, selectedAreaId, renderMode, customerViewportBounds);
          setCamera(cam);
          if (renderMode === 'customer') customerBaseCamRef.current = cam;
        }
      }
    };
    update();
    window.addEventListener('resize', update);
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      ro = new ResizeObserver(update);
      ro.observe(containerRef.current);
    }
    return () => {
      window.removeEventListener('resize', update);
      ro?.disconnect();
    };
  }, [fitToContentOnLoad, renderMode, layout.objects, rooms, selectedAreaId, customerViewportBounds]);

  const objCount = layout.objects.length;
  const roomCount = rooms.length;
  useEffect(() => {
    if (fitToContentOnLoad && canvasSize.width > 0 && !userHasInteractedRef.current) {
      const nc = fitToObjects(layout.objects, rooms, canvasSize.width, canvasSize.height, selectedAreaId, renderMode, customerViewportBounds);
      setCamera(nc);
      onCameraChange?.(nc);
    }
  }, [objCount, roomCount, selectedAreaId, canvasSize.width, canvasSize.height, renderMode, customerViewportBounds]);

  const screenToWorld = useCallback((sx: number, sy: number) => {
    if (renderMode === 'customer') return { worldX: sx / camera.zoom + camera.panX, worldY: sy / camera.zoom + camera.panY };
    const cx = canvasSize.width / 2, cy = canvasSize.height / 2;
    return { worldX: (sx - cx) / camera.zoom - camera.panX, worldY: (sy - cy) / camera.zoom - camera.panY };
  }, [camera, renderMode, canvasSize]);

  const getFilteredObjects = useCallback(() =>
    selectedAreaId ? layout.objects.filter(o => o.areaId === selectedAreaId) : layout.objects,
    [layout.objects, selectedAreaId]
  );

  const getObjectAtPoint = useCallback((wx: number, wy: number): V2LayoutObject | null => {
    const objs = getFilteredObjects();
    const minHitPx = 44;
    for (let i = objs.length - 1; i >= 0; i--) {
      const obj = objs[i];
      const cos = Math.cos((obj.rotation * Math.PI) / 180);
      const sin = Math.sin((obj.rotation * Math.PI) / 180);
      const dx = wx - obj.worldX, dy = wy - obj.worldY;
      const lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos;
      if (renderMode === 'customer' && (obj.type === 'table' || obj.type === 'booth')) {
        const hitW = Math.max(obj.width / 2, minHitPx / camera.zoom / 2);
        const hitH = Math.max(obj.height / 2, minHitPx / camera.zoom / 2);
        if (Math.abs(lx) <= hitW && Math.abs(ly) <= hitH) return obj;
      } else {
        const hitH = obj.type === 'wall' ? Math.max(obj.height, 12) / 2 : obj.height / 2;
        if (Math.abs(lx) <= obj.width / 2 && Math.abs(ly) <= hitH) return obj;
      }
    }
    return null;
  }, [getFilteredObjects, renderMode, camera.zoom]);

  const getRoomAtPoint = useCallback((wx: number, wy: number): RoomPolygon | null => {
    const filteredRooms = selectedAreaId ? rooms.filter(r => r.areaId === selectedAreaId) : rooms;
    for (let i = filteredRooms.length - 1; i >= 0; i--) {
      const room = filteredRooms[i];
      if (room.vertices.length >= 3 && pointInPolygon(wx, wy, room.vertices)) {
        return room;
      }
    }
    return null;
  }, [rooms, selectedAreaId]);

  const getVertexAtPoint = useCallback((roomId: string, wx: number, wy: number): number => {
    const room = rooms.find(r => r.id === roomId);
    if (!room) return -1;
    const hitR = VERTEX_HIT_RADIUS / camera.zoom;
    for (let i = 0; i < room.vertices.length; i++) {
      const v = room.vertices[i];
      if (Math.sqrt((wx - v.x) ** 2 + (wy - v.y) ** 2) <= hitR) return i;
    }
    return -1;
  }, [rooms, camera.zoom]);

  const getWallHandle = useCallback((wall: V2LayoutObject, wx: number, wy: number) => {
    const r = (wall.rotation * Math.PI) / 180;
    const cos = Math.cos(r), sin = Math.sin(r);
    const check = (lx: number, ly: number) => {
      const rx = wall.worldX + lx * cos - ly * sin, ry = wall.worldY + lx * sin + ly * cos;
      return Math.sqrt((wx - rx) ** 2 + (wy - ry) ** 2) <= 15;
    };
    if (check(wall.width / 2, 0)) return 'resize-end';
    if (check(-wall.width / 2, 0)) return 'resize-start';
    if (check(0, -wall.width / 4)) return 'rotate';
    return null;
  }, []);

  const getResizeHandle = useCallback((obj: V2LayoutObject, wx: number, wy: number) => {
    const hitR = 10 / camera.zoom;
    const hw = obj.width / 2, hh = obj.height / 2;
    const rad = (obj.rotation * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const handles: Array<{ id: 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'; lx: number; ly: number }> = [
      { id: 'nw', lx: -hw, ly: -hh }, { id: 'n', lx: 0, ly: -hh }, { id: 'ne', lx: hw, ly: -hh },
      { id: 'e', lx: hw, ly: 0 }, { id: 'se', lx: hw, ly: hh }, { id: 's', lx: 0, ly: hh },
      { id: 'sw', lx: -hw, ly: hh }, { id: 'w', lx: -hw, ly: 0 },
    ];
    for (const h of handles) {
      const rx = obj.worldX + h.lx * cos - h.ly * sin;
      const ry = obj.worldY + h.lx * sin + h.ly * cos;
      if (Math.sqrt((wx - rx) ** 2 + (wy - ry) ** 2) <= hitR) return h.id;
    }
    return null;
  }, [camera.zoom]);

  const findWallSnap = useCallback((wx: number, wy: number, excludeId?: string) => {
    for (const wall of layout.objects.filter(o => o.type === 'wall' && o.id !== excludeId)) {
      const hl = wall.width / 2;
      const rad = (wall.rotation * Math.PI) / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      for (const pt of [{ x: wall.worldX - hl * cos, y: wall.worldY - hl * sin }, { x: wall.worldX + hl * cos, y: wall.worldY + hl * sin }]) {
        if (Math.sqrt((wx - pt.x) ** 2 + (wy - pt.y) ** 2) < 15) return pt;
      }
    }
    return null;
  }, [layout.objects]);

  /** Returns chair id if the world point is within a chair handle radius for the editing table */
  const getChairAtPoint = useCallback((wx: number, wy: number): { chairId: string; obj: V2LayoutObject } | null => {
    if (!editingChairsObjectId) return null;
    const obj = layout.objects.find(o => o.id === editingChairsObjectId);
    if (!obj) return null;
    const chairs = getEffectiveChairs(obj);
    const rad = (obj.rotation * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const HR = Math.max(12, 14 / camera.zoom);
    for (let i = chairs.length - 1; i >= 0; i--) {
      const ch = chairs[i];
      const cwx = obj.worldX + ch.x * cos - ch.y * sin;
      const cwy = obj.worldY + ch.x * sin + ch.y * cos;
      if (Math.sqrt((wx - cwx) ** 2 + (wy - cwy) ** 2) <= HR) return { chairId: ch.id, obj };
    }
    return null;
  }, [editingChairsObjectId, layout.objects, camera.zoom]);

  /** Hit-test chair resize/rotate handles for the currently selected chair */
  const getChairHandleAtPoint = useCallback((wx: number, wy: number): { handle: ChairHandle; obj: V2LayoutObject; chair: ChairData } | null => {
    if (!editingChairsObjectId || !selectedChairId) return null;
    const obj = layout.objects.find(o => o.id === editingChairsObjectId);
    if (!obj) return null;
    const chair = getEffectiveChairs(obj).find(c => c.id === selectedChairId);
    if (!chair) return null;

    const tRad = (obj.rotation * Math.PI) / 180;
    const tCos = Math.cos(tRad), tSin = Math.sin(tRad);
    const cwx = obj.worldX + chair.x * tCos - chair.y * tSin;
    const cwy = obj.worldY + chair.x * tSin + chair.y * tCos;

    const totalRad = ((chair.rotation + obj.rotation) * Math.PI) / 180;
    const cR = Math.cos(totalRad), sR = Math.sin(totalRad);
    const hw = chair.width / 2, hh = chair.height / 2;
    const RH = Math.max(9, 11 / camera.zoom);
    const ROTATE_OFFSET = Math.max(16, 20 / camera.zoom);

    // Rotate handle (above the chair in local space = -hh direction)
    const rotHx = cwx + (-hh - ROTATE_OFFSET) * (-sR);
    const rotHy = cwy + (-hh - ROTATE_OFFSET) * cR;
    if (Math.sqrt((wx - rotHx) ** 2 + (wy - rotHy) ** 2) <= RH + 2 / camera.zoom) {
      return { handle: 'rotate', obj, chair };
    }

    // Corner resize handles
    const cornerMap: [number, number, ChairHandle][] = [
      [-hw, -hh, 'nw'], [hw, -hh, 'ne'], [hw, hh, 'se'], [-hw, hh, 'sw'],
    ];
    for (const [lx, ly, hname] of cornerMap) {
      const hx = cwx + lx * cR - ly * sR;
      const hy = cwy + lx * sR + ly * cR;
      if (Math.sqrt((wx - hx) ** 2 + (wy - hy) ** 2) <= RH) {
        return { handle: hname, obj, chair };
      }
    }
    return null;
  }, [editingChairsObjectId, selectedChairId, layout.objects, camera.zoom]);

  /** Hit-test the customer viewport overlay handles (edges + corners + body for move) */
  const getViewportHandleAtPoint = useCallback((wx: number, wy: number): ViewportHandle | null => {
    if (!showCustomerViewport || !customerViewportBounds) return null;
    const { minX, minY, maxX, maxY } = customerViewportBounds;
    const threshold = Math.max(8, 12 / camera.zoom);
    const cornerThreshold = threshold * 1.5;

    // Check corners first (higher priority)
    if (Math.abs(wx - minX) < cornerThreshold && Math.abs(wy - minY) < cornerThreshold) return 'nw';
    if (Math.abs(wx - maxX) < cornerThreshold && Math.abs(wy - minY) < cornerThreshold) return 'ne';
    if (Math.abs(wx - maxX) < cornerThreshold && Math.abs(wy - maxY) < cornerThreshold) return 'se';
    if (Math.abs(wx - minX) < cornerThreshold && Math.abs(wy - maxY) < cornerThreshold) return 'sw';

    // Check edges
    if (wx >= minX && wx <= maxX && Math.abs(wy - minY) < threshold) return 'n';
    if (wx >= minX && wx <= maxX && Math.abs(wy - maxY) < threshold) return 's';
    if (wy >= minY && wy <= maxY && Math.abs(wx - minX) < threshold) return 'w';
    if (wy >= minY && wy <= maxY && Math.abs(wx - maxX) < threshold) return 'e';

    // Check interior for move
    if (wx > minX + threshold && wx < maxX - threshold && wy > minY + threshold && wy < maxY - threshold) return 'move';

    return null;
  }, [showCustomerViewport, customerViewportBounds, camera.zoom]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const { worldX, worldY } = screenToWorld(sx, sy);

    // RMB pan — editor only, pointer devices only (not touch)
    if (e.button === 2 && renderMode === 'editor' && e.pointerType !== 'touch') {
      setIsRmbDown(true);
      setRmbDragStart({ x: sx, y: sy });
      e.preventDefault();
      return;
    }

    setPointerDown({ x: sx, y: sy });
    setDragStart({ x: sx, y: sy });
    setIsDragging(false);

    // Chair edit mode — intercept chair handle hit before any normal drag
    if (editingChairsObjectId && activeTool === 'select' && renderMode === 'editor') {
      // 1. Check resize/rotate handles on selected chair first (highest priority)
      const handleHit = getChairHandleAtPoint(worldX, worldY);
      if (handleHit) {
        const tRad = (handleHit.obj.rotation * Math.PI) / 180;
        setChairHandleMode(handleHit.handle);
        setChairHandleObjectId(handleHit.obj.id);
        setChairHandleStart({
          wx: worldX, wy: worldY,
          cx: handleHit.chair.x, cy: handleHit.chair.y,
          cw: handleHit.chair.width, ch: handleHit.chair.height,
          crot: handleHit.chair.rotation, trot: tRad,
        });
        e.preventDefault();
        return;
      }

      // 2. Check move handle (centre of any chair)
      const hit = getChairAtPoint(worldX, worldY);
      if (hit) {
        const chairs = getEffectiveChairs(hit.obj);
        const chair = chairs.find(c => c.id === hit.chairId)!;
        setSelectedChairId(hit.chairId);
        setChairDragId(hit.chairId);
        setChairDragObjectId(hit.obj.id);
        setChairDragStart({ wx: worldX, wy: worldY, cx: chair.x, cy: chair.y });
        e.preventDefault();
        return;
      }

      // 3. Clicked on empty space — deselect chair
      setSelectedChairId(null);
    }

    // Customer viewport resize — check before normal object selection
    if (activeTool === 'select' && renderMode === 'editor' && showCustomerViewport && customerViewportBounds) {
      const vpHit = getViewportHandleAtPoint(worldX, worldY);
      if (vpHit) {
        setVpDragHandle(vpHit);
        setVpDragStart({ wx: worldX, wy: worldY, bounds: { ...customerViewportBounds } });
        e.preventDefault();
        return;
      }
    }

    if (activeTool === 'select' && renderMode === 'editor') {
      if (selectedObjectId) {
        const sel = layout.objects.find(o => o.id === selectedObjectId);
        if (sel?.type === 'wall') {
          const hm = getWallHandle(sel, worldX, worldY);
          if (hm) { setWallHandleMode(hm); setDragStart({ x: worldX, y: worldY }); setWallOrigProps({ width: sel.width, rotation: sel.rotation, worldX: sel.worldX, worldY: sel.worldY }); e.preventDefault(); return; }
        } else if (sel) {
          const rh = getResizeHandle(sel, worldX, worldY);
          if (rh) {
            setResizeHandle(rh);
            setResizeOrigProps({ worldX: sel.worldX, worldY: sel.worldY, width: sel.width, height: sel.height, rotation: sel.rotation });
            setResizeDragStart({ wx: worldX, wy: worldY });
            e.preventDefault();
            return;
          }
        }
      }

      if (selectedRoomId) {
        const vi = getVertexAtPoint(selectedRoomId, worldX, worldY);
        if (vi !== -1) {
          const room = rooms.find(r => r.id === selectedRoomId)!;
          setDragVertexRoomId(selectedRoomId);
          setDragVertexIndex(vi);
          setDragVertexStart({ wx: room.vertices[vi].x, wy: room.vertices[vi].y });
          setDragStart({ x: worldX, y: worldY });
          e.preventDefault();
          return;
        }
      }

      const obj = getObjectAtPoint(worldX, worldY);
      if (obj && !obj.locked) { setDragObjectId(obj.id); setDragObjectStart({ worldX: obj.worldX, worldY: obj.worldY }); setDragStart({ x: worldX, y: worldY }); onObjectSelect?.(obj.id); onRoomSelect?.(null); e.preventDefault(); return; }
    }
    e.preventDefault();
  }, [activeTool, selectedObjectId, selectedRoomId, layout.objects, rooms, screenToWorld, getWallHandle, getResizeHandle, getObjectAtPoint, getRoomAtPoint, getVertexAtPoint, onObjectSelect, onRoomSelect, renderMode, camera, onCameraChange]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const { worldX, worldY } = screenToWorld(sx, sy);

    setCursorWorld({ x: worldX, y: worldY });

    // RMB pan — handle before any other logic
    if (isRmbDown && renderMode === 'editor') {
      userHasInteractedRef.current = true;
      const dxPx = sx - rmbDragStart.x, dyPx = sy - rmbDragStart.y;
      const nc = clampCamera({ ...camera, panX: camera.panX + dxPx / camera.zoom, panY: camera.panY + dyPx / camera.zoom });
      setCamera(nc); onCameraChange?.(nc);
      setRmbDragStart({ x: sx, y: sy });
      return;
    }

    if (!isDragging && pointerDown) {
      // Use a larger drag threshold for touch to avoid misclassifying finger taps as drags
      const dragThreshold = e.pointerType === 'touch' ? 12 : 5;
      if (Math.sqrt((sx - pointerDown.x) ** 2 + (sy - pointerDown.y) ** 2) > dragThreshold) setIsDragging(true);
    }

    if (!isDragging) {
      const obj = getObjectAtPoint(worldX, worldY);
      if (renderMode === 'customer') {
        if (obj?.type === 'table' || obj?.type === 'booth') {
          const objStatus = tableStatusMap?.[obj.properties?.tableId || ''];
          const isAvailable = objStatus !== 'red' && !!objStatus;
          setHoveredId(isAvailable ? obj.id : null);
        } else setHoveredId(null);
      } else if (activeTool === 'select') setHoveredId(obj?.id || null);
    }

    // Customer viewport resize/move drag
    if (vpDragHandle && customerViewportBounds) {
      setIsDragging(true);
      const dx = worldX - vpDragStart.wx;
      const dy = worldY - vpDragStart.wy;
      const b = vpDragStart.bounds;
      const MIN_SIZE = 100;
      let newBounds = { ...b };

      if (vpDragHandle === 'move') {
        newBounds = { minX: b.minX + dx, minY: b.minY + dy, maxX: b.maxX + dx, maxY: b.maxY + dy };
      } else {
        if (vpDragHandle === 'n' || vpDragHandle === 'nw' || vpDragHandle === 'ne') {
          newBounds.minY = Math.min(b.minY + dy, b.maxY - MIN_SIZE);
        }
        if (vpDragHandle === 's' || vpDragHandle === 'sw' || vpDragHandle === 'se') {
          newBounds.maxY = Math.max(b.maxY + dy, b.minY + MIN_SIZE);
        }
        if (vpDragHandle === 'w' || vpDragHandle === 'nw' || vpDragHandle === 'sw') {
          newBounds.minX = Math.min(b.minX + dx, b.maxX - MIN_SIZE);
        }
        if (vpDragHandle === 'e' || vpDragHandle === 'ne' || vpDragHandle === 'se') {
          newBounds.maxX = Math.max(b.maxX + dx, b.minX + MIN_SIZE);
        }
      }
      onCustomerViewportBoundsChange?.(newBounds);
      return;
    }

    // Chair resize/rotate handle drag
    if (chairHandleMode && chairHandleObjectId) {
      setIsDragging(true);
      const obj = layout.objects.find(o => o.id === chairHandleObjectId);
      if (obj) {
        const chairs = getEffectiveChairs(obj);
        const chair = chairs.find(c => c.id === selectedChairId);
        if (chair) {
          if (chairHandleMode === 'rotate') {
            // Angle from chair world-centre to current pointer, relative to table
            const tRad = (obj.rotation * Math.PI) / 180;
            const tCos = Math.cos(tRad), tSin = Math.sin(tRad);
            const cwx = obj.worldX + chair.x * tCos - chair.y * tSin;
            const cwy = obj.worldY + chair.x * tSin + chair.y * tCos;
            const worldAngle = Math.atan2(worldY - cwy, worldX - cwx) * (180 / Math.PI);
            // Chair rotation is relative to table rotation; world angle includes table rotation
            let newRot = Math.round(worldAngle + 90 - obj.rotation);
            // Snap to 45-degree increments for easy cardinal/diagonal placement
            const ROTATION_SNAP = 45;
            newRot = Math.round(newRot / ROTATION_SNAP) * ROTATION_SNAP;
            const newChairs = chairs.map(c => c.id === selectedChairId ? { ...c, rotation: newRot } : c);
            onChairsUpdate?.(chairHandleObjectId, newChairs);
          } else {
            // Resize: convert world pointer to chair-local space to get width/height delta
            const tRad = chairHandleStart.trot;
            const tCos = Math.cos(tRad), tSin = Math.sin(tRad);
            // Chair centre in world space (using original position from drag start)
            const cwx = obj.worldX + chairHandleStart.cx * tCos - chairHandleStart.cy * tSin;
            const cwy = obj.worldY + chairHandleStart.cx * tSin + chairHandleStart.cy * tCos;
            // World delta from chair centre to current pointer
            const dx = worldX - cwx, dy = worldY - cwy;
            // Rotate into chair-local frame (reverse total rotation)
            const totalRad = ((chairHandleStart.crot + obj.rotation) * Math.PI) / 180;
            const cCos = Math.cos(-totalRad), cSin = Math.sin(-totalRad);
            const lx = dx * cCos - dy * cSin;
            const ly = dx * cSin + dy * cCos;

            const minSize = 6;
            const RESIZE_SNAP = 2;
            let newW = chairHandleStart.cw, newH = chairHandleStart.ch;
            const h = chairHandleMode;
            if (h === 'ne' || h === 'se') newW = Math.max(minSize, Math.round(Math.abs(lx) * 2 / RESIZE_SNAP) * RESIZE_SNAP);
            if (h === 'nw' || h === 'sw') newW = Math.max(minSize, Math.round(Math.abs(lx) * 2 / RESIZE_SNAP) * RESIZE_SNAP);
            if (h === 'se' || h === 'sw') newH = Math.max(minSize, Math.round(Math.abs(ly) * 2 / RESIZE_SNAP) * RESIZE_SNAP);
            if (h === 'ne' || h === 'nw') newH = Math.max(minSize, Math.round(Math.abs(ly) * 2 / RESIZE_SNAP) * RESIZE_SNAP);

            const newChairs = chairs.map(c => c.id === selectedChairId ? { ...c, width: newW, height: newH } : c);
            onChairsUpdate?.(chairHandleObjectId, newChairs);
          }
        }
      }
      return;
    }

    // Chair move drag in edit mode
    if (chairDragId && chairDragObjectId) {
      setIsDragging(true);
      const obj = layout.objects.find(o => o.id === chairDragObjectId);
      if (obj) {
        // Convert world delta to table-local delta (reverse table rotation)
        const rad = -(obj.rotation * Math.PI) / 180;
        const cos = Math.cos(rad), sin = Math.sin(rad);
        const ddx = worldX - chairDragStart.wx, ddy = worldY - chairDragStart.wy;
        const ldx = ddx * cos - ddy * sin;
        const ldy = ddx * sin + ddy * cos;
        let nx = chairDragStart.cx + ldx;
        let ny = chairDragStart.cy + ldy;

        // Snap chair to 4px grid in table-local space for consistent alignment
        const CHAIR_SNAP = 4;
        nx = Math.round(nx / CHAIR_SNAP) * CHAIR_SNAP;
        ny = Math.round(ny / CHAIR_SNAP) * CHAIR_SNAP;

        // Snap-to-edge: if chair center is close to a table edge, snap to it
        const halfW = obj.width / 2;
        const halfH = obj.height / 2;
        const chair = getEffectiveChairs(obj).find(c => c.id === chairDragId);
        const chairHalfH = chair ? chair.height / 2 : 6;
        const edgeGap = chairHalfH + 2;
        const EDGE_SNAP_THRESHOLD = 12;

        // Snap to top/bottom edges
        const topEdge = -(halfH + edgeGap);
        const bottomEdge = halfH + edgeGap;
        if (Math.abs(ny - topEdge) < EDGE_SNAP_THRESHOLD) ny = topEdge;
        else if (Math.abs(ny - bottomEdge) < EDGE_SNAP_THRESHOLD) ny = bottomEdge;

        // Snap to left/right edges
        const leftEdge = -(halfW + edgeGap);
        const rightEdge = halfW + edgeGap;
        if (Math.abs(nx - leftEdge) < EDGE_SNAP_THRESHOLD) nx = leftEdge;
        else if (Math.abs(nx - rightEdge) < EDGE_SNAP_THRESHOLD) nx = rightEdge;

        // Also snap to center axes
        if (Math.abs(nx) < EDGE_SNAP_THRESHOLD / 2) nx = 0;
        if (Math.abs(ny) < EDGE_SNAP_THRESHOLD / 2) ny = 0;

        const newChairs = getEffectiveChairs(obj).map(c =>
          c.id === chairDragId ? { ...c, x: nx, y: ny } : c
        );
        onChairsUpdate?.(chairDragObjectId, newChairs);
      }
      return;
    }

    // Chair hover detection in edit mode
    if (editingChairsObjectId) {
      const hit = getChairAtPoint(worldX, worldY);
      setHoveredChairId(hit ? hit.chairId : null);
    }

    if (dragVertexRoomId !== null && dragVertexIndex !== null) {
      const nx = snapToGrid(dragVertexStart.wx + worldX - dragStart.x);
      const ny = snapToGrid(dragVertexStart.wy + worldY - dragStart.y);
      onRoomVertexMove?.(dragVertexRoomId, dragVertexIndex, nx, ny);
    } else if (wallHandleMode !== 'none' && selectedObjectId && wallOrigProps) {
      const snap = findWallSnap(worldX, worldY, selectedObjectId);
      if (wallHandleMode === 'resize-end') {
        const rad = (wallOrigProps.rotation * Math.PI) / 180;
        const sx2 = wallOrigProps.worldX - (wallOrigProps.width / 2) * Math.cos(rad);
        const sy2 = wallOrigProps.worldY - (wallOrigProps.width / 2) * Math.sin(rad);
        const ex = snap ? snap.x : snapToGrid(worldX), ey = snap ? snap.y : snapToGrid(worldY);
        const dx = ex - sx2, dy = ey - sy2, len = Math.sqrt(dx * dx + dy * dy), ang = Math.atan2(dy, dx) * (180 / Math.PI);
        onObjectUpdate?.(selectedObjectId, { width: Math.max(20, len), rotation: ang, worldX: sx2 + dx / 2, worldY: sy2 + dy / 2 });
      } else if (wallHandleMode === 'resize-start') {
        const rad = (wallOrigProps.rotation * Math.PI) / 180;
        const ex = wallOrigProps.worldX + (wallOrigProps.width / 2) * Math.cos(rad);
        const ey = wallOrigProps.worldY + (wallOrigProps.width / 2) * Math.sin(rad);
        const stx = snap ? snap.x : snapToGrid(worldX), sty = snap ? snap.y : snapToGrid(worldY);
        const dx = ex - stx, dy = ey - sty, len = Math.sqrt(dx * dx + dy * dy), ang = Math.atan2(dy, dx) * (180 / Math.PI);
        onObjectUpdate?.(selectedObjectId, { width: Math.max(20, len), rotation: ang, worldX: stx + dx / 2, worldY: sty + dy / 2 });
      } else if (wallHandleMode === 'rotate') {
        onObjectUpdate?.(selectedObjectId, { rotation: Math.atan2(worldY - wallOrigProps.worldY, worldX - wallOrigProps.worldX) * (180 / Math.PI) });
      }
    } else if (resizeHandle && selectedObjectId && resizeOrigProps) {
      const rad = (resizeOrigProps.rotation * Math.PI) / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      const dwx = worldX - resizeDragStart.wx, dwy = worldY - resizeDragStart.wy;
      const dlx = dwx * cos + dwy * sin;
      const dly = -dwx * sin + dwy * cos;
      let { width, height, worldX: ox, worldY: oy } = resizeOrigProps;
      const selObjType = layout.objects.find(o => o.id === selectedObjectId)?.type;
      const minDim = 20;
      const minH = (selObjType === 'door' || selObjType === 'window') ? 6 : minDim;
      const handle = resizeHandle;
      const affectsRight = handle === 'e' || handle === 'ne' || handle === 'se';
      const affectsLeft = handle === 'w' || handle === 'nw' || handle === 'sw';
      const affectsBottom = handle === 's' || handle === 'se' || handle === 'sw';
      const affectsTop = handle === 'n' || handle === 'ne' || handle === 'nw';
      let newW = width, newH = height, shiftLx = 0, shiftLy = 0;
      if (affectsRight) { newW = Math.max(minDim, snapToGrid(width + dlx)); shiftLx = (newW - width) / 2; }
      if (affectsLeft) { newW = Math.max(minDim, snapToGrid(width - dlx)); shiftLx = -(newW - width) / 2; }
      if (affectsBottom) { newH = Math.max(minH, snapToGrid(height + dly)); shiftLy = (newH - height) / 2; }
      if (affectsTop) { newH = Math.max(minH, snapToGrid(height - dly)); shiftLy = -(newH - height) / 2; }
      const newWX = ox + shiftLx * cos - shiftLy * sin;
      const newWY = oy + shiftLx * sin + shiftLy * cos;
      onObjectUpdate?.(selectedObjectId, { width: newW, height: newH, worldX: newWX, worldY: newWY });
    } else if (dragObjectId && activeTool === 'select') {
      onObjectMove?.(dragObjectId, snapToGrid(dragObjectStart.worldX + worldX - dragStart.x), snapToGrid(dragObjectStart.worldY + worldY - dragStart.y));
    } else if (isDragging && (activeTool === 'pan' || renderMode === 'customer')) {
      userHasInteractedRef.current = true;
      const dxPx = sx - dragStart.x, dyPx = sy - dragStart.y;
      let nc = clampCamera(renderMode === 'customer'
        ? { ...camera, panX: camera.panX - dxPx / camera.zoom, panY: camera.panY - dyPx / camera.zoom }
        : { ...camera, panX: camera.panX + dxPx / camera.zoom, panY: camera.panY + dyPx / camera.zoom });
      if (renderMode === 'customer') {
        const contentBounds = customerViewportBounds || computeContentBoundsFromData(layout.objects, rooms);
        if (contentBounds) {
          const W = canvasSize.width, H = canvasSize.height;
          const clamped = clampCustomerPan(nc.panX, nc.panY, nc.zoom, W, H, contentBounds);
          nc = { ...nc, ...clamped };
        }
      }
      setCamera(nc); onCameraChange?.(nc); setDragStart({ x: sx, y: sy });
    }
  }, [isDragging, pointerDown, activeTool, selectedObjectId, selectedRoomId, wallHandleMode, wallOrigProps, resizeHandle, resizeOrigProps, resizeDragStart, dragObjectId, dragObjectStart, dragStart, dragVertexRoomId, dragVertexIndex, dragVertexStart, camera, screenToWorld, getObjectAtPoint, findWallSnap, snapToGrid, onObjectMove, onObjectUpdate, onRoomVertexMove, onCameraChange, renderMode, tableStatusMap, canvasSize, layout, rooms, isRmbDown, rmbDragStart]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Clear RMB pan on any pointer up
    if (e.button === 2 || isRmbDown) {
      setIsRmbDown(false);
      return;
    }

    // Clear viewport drag
    if (vpDragHandle) { setVpDragHandle(null); setIsDragging(false); setPointerDown(null); return; }

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const { worldX, worldY } = screenToWorld(sx, sy);
    // Clear chair handle drag (resize/rotate)
    if (chairHandleMode) { setChairHandleMode(null); setChairHandleObjectId(null); setIsDragging(false); setPointerDown(null); return; }
    // Clear chair move drag
    if (chairDragId) { setChairDragId(null); setChairDragObjectId(null); setIsDragging(false); setPointerDown(null); return; }

    const wasDrag = isDragging || dragObjectId !== null || wallHandleMode !== 'none' || dragVertexRoomId !== null || resizeHandle !== null;
    const pd = pointerDown;
    setIsDragging(false); setDragObjectId(null); setWallHandleMode('none'); setWallOrigProps(null); setPointerDown(null);
    setDragVertexRoomId(null); setDragVertexIndex(null);
    setResizeHandle(null); setResizeOrigProps(null);

    const isPlacementTool = activeTool !== 'select' && activeTool !== 'pan';
    const clickDist = pd ? Math.sqrt((sx - pd.x) ** 2 + (sy - pd.y) ** 2) : Infinity;
    // Touch taps naturally drift more than mouse clicks — use a larger threshold
    const clickThreshold = e.pointerType === 'touch' ? 18 : 10;
    const isClick = pd && clickDist <= clickThreshold;

    // In customer mode, selection is driven solely by tap distance — pan may have occurred
    // during the gesture but that doesn't prevent a table tap from registering.
    // In editor mode, keep the existing wasDrag guard so object placement isn't disrupted.
    const shouldSelect = renderMode === 'customer'
      ? !!isClick
      : isClick && (!wasDrag || isPlacementTool);

    if (shouldSelect) {
      if (renderMode === 'customer') {
        const obj = getObjectAtPoint(worldX, worldY);
        if (obj?.type === 'table' || obj?.type === 'booth') { const st = tableStatusMap?.[obj.properties?.tableId || '']; if (st === 'green' || st === 'yellow') onObjectSelect?.(obj.id); }
      } else if (activeTool === 'draw_room' || activeTool === 'draw_outdoor') {
        onRoomVertexClick?.(worldX, worldY);
      } else if (activeTool === 'select') {
        const obj = getObjectAtPoint(worldX, worldY);
        if (obj) {
          onObjectSelect?.(obj.id);
          onRoomSelect?.(null);
        } else {
          const room = getRoomAtPoint(worldX, worldY);
          if (room) {
            onRoomSelect?.(room.id);
            onObjectSelect?.(null);
          } else {
            onObjectSelect?.(null);
            onRoomSelect?.(null);
            onCanvasClick?.(worldX, worldY);
          }
        }
      } else {
        onCanvasClick?.(snapToGrid(worldX), snapToGrid(worldY));
      }
    }
  }, [isDragging, dragObjectId, wallHandleMode, dragVertexRoomId, pointerDown, activeTool, renderMode, screenToWorld, getObjectAtPoint, getRoomAtPoint, tableStatusMap, onObjectSelect, onRoomSelect, onCanvasClick, onRoomVertexClick, snapToGrid, isRmbDown]);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    userHasInteractedRef.current = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (renderMode === 'customer') {
      const base = customerBaseCamRef.current;
      if (!base) return;
      const minZoom = base.zoom * 0.85;
      const maxZoom = base.zoom * 3;
      const newZoom = Math.max(minZoom, Math.min(maxZoom, camera.zoom * (e.deltaY > 0 ? 0.92 : 1.08)));
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      // Keep world point under cursor fixed
      const worldX = sx / camera.zoom + camera.panX;
      const worldY = sy / camera.zoom + camera.panY;
      const newPanX = worldX - sx / newZoom;
      const newPanY = worldY - sy / newZoom;
      const W = canvasSize.width, H = canvasSize.height;
      const contentBounds = customerViewportBounds || computeContentBoundsFromData(layout.objects, rooms);
      const clamped = contentBounds ? clampCustomerPan(newPanX, newPanY, newZoom, W, H, contentBounds) : { panX: newPanX, panY: newPanY };
      const nc = clampCamera({ zoom: newZoom, ...clamped });
      setCamera(nc); onCameraChange?.(nc);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, camera.zoom * (e.deltaY > 0 ? 0.88 : 1.14)));
    const worldX = sx / camera.zoom + camera.panX;
    const worldY = sy / camera.zoom + camera.panY;
    const newPanX = worldX - sx / newZoom;
    const newPanY = worldY - sy / newZoom;
    const nc = clampCamera({ zoom: newZoom, panX: newPanX, panY: newPanY });
    setCamera(nc); onCameraChange?.(nc);
  }, [camera, renderMode, onCameraChange, canvasSize, layout, rooms, customerViewportBounds]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getTouchDist = (t1: Touch, t2: Touch) =>
      Math.sqrt((t1.clientX - t2.clientX) ** 2 + (t1.clientY - t2.clientY) ** 2);

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dist = getTouchDist(e.touches[0], e.touches[1]);
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        pinchRef.current = { dist, midX, midY };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();
        const newDist = getTouchDist(e.touches[0], e.touches[1]);
        const scale = newDist / pinchRef.current.dist;
        pinchRef.current.dist = newDist;

        setCamera(prev => {
          const canvas = canvasRef.current;
          const rect = canvas ? canvas.getBoundingClientRect() : null;
          const midX = pinchRef.current ? pinchRef.current.midX - (rect?.left ?? 0) : 0;
          const midY = pinchRef.current ? pinchRef.current.midY - (rect?.top ?? 0) : 0;
          const worldX = midX / prev.zoom + prev.panX;
          const worldY = midY / prev.zoom + prev.panY;
          const base = renderMode === 'customer' ? customerBaseCamRef.current : null;
          if (base) {
            const newZoom = Math.max(base.zoom * 0.85, Math.min(base.zoom * 3, prev.zoom * scale));
            const newPanX = worldX - midX / newZoom;
            const newPanY = worldY - midY / newZoom;
            const W = rect?.width ?? 0;
            const H = rect?.height ?? 0;
            const contentBounds = customerViewportBounds || computeContentBoundsFromData(layout.objects, rooms);
            const clamped = contentBounds ? clampCustomerPan(newPanX, newPanY, newZoom, W, H, contentBounds) : { panX: newPanX, panY: newPanY };
            return clampCamera({ zoom: newZoom, ...clamped });
          }
          const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, prev.zoom * scale));
          const newPanX = worldX - midX / newZoom;
          const newPanY = worldY - midY / newZoom;
          return clampCamera({ zoom: newZoom, panX: newPanX, panY: newPanY });
        });
      }
    };

    const handleTouchEnd = () => {
      if (pinchRef.current) pinchRef.current = null;
    };

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd);
    return () => {
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
    };
  }, [renderMode, layout, rooms, customerViewportBounds]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize.width * dpr; canvas.height = canvasSize.height * dpr;
    canvas.style.width = `${canvasSize.width}px`; canvas.style.height = `${canvasSize.height}px`;
    ctx.scale(dpr, dpr);
    const W = canvasSize.width, H = canvasSize.height;
    ctx.clearRect(0, 0, W, H);

    if (renderMode === 'editor') {
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#1e293b'); bg.addColorStop(1, '#0f172a');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    } else {
      const bg = ctx.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.75);
      bg.addColorStop(0, '#141410');
      bg.addColorStop(0.5, '#0f0f0c');
      bg.addColorStop(1, '#09090a');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    }

    ctx.save();
    if (renderMode === 'customer') { ctx.scale(camera.zoom, camera.zoom); ctx.translate(-camera.panX, -camera.panY); }
    else { ctx.translate(W / 2, H / 2); ctx.scale(camera.zoom, camera.zoom); ctx.translate(camera.panX, camera.panY); }

    if (renderMode === 'editor' && gridSnapping) {
      const step = gridSize;
      const zoomFade = Math.min(1, Math.max(0.3, camera.zoom));
      const startX = Math.floor((-camera.panX - W / 2 / camera.zoom) / step) * step;
      const endX = Math.ceil((-camera.panX + W / 2 / camera.zoom) / step) * step;
      const startY = Math.floor((-camera.panY - H / 2 / camera.zoom) / step) * step;
      const endY = Math.ceil((-camera.panY + H / 2 / camera.zoom) / step) * step;
      ctx.globalAlpha = 0.042 * zoomFade; ctx.strokeStyle = '#7ba5d4'; ctx.lineWidth = 0.5 / camera.zoom;
      for (let x = startX; x <= endX; x += step) { ctx.beginPath(); ctx.moveTo(x, startY); ctx.lineTo(x, endY); ctx.stroke(); }
      for (let y = startY; y <= endY; y += step) { ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(endX, y); ctx.stroke(); }
      ctx.globalAlpha = 0.08 * zoomFade; ctx.strokeStyle = '#7ba5d4'; ctx.lineWidth = 0.75 / camera.zoom;
      const big = step * 5;
      for (let x = Math.floor(startX / big) * big; x <= endX; x += big) { ctx.beginPath(); ctx.moveTo(x, startY); ctx.lineTo(x, endY); ctx.stroke(); }
      for (let y = Math.floor(startY / big) * big; y <= endY; y += big) { ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(endX, y); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }

    const filteredRooms = selectedAreaId ? rooms.filter(r => r.areaId === selectedAreaId) : rooms;
    const exteriorRooms = filteredRooms.filter(r => r.exterior || EXTERIOR_STYLES.has(r.floorStyle));
    const interiorRooms = filteredRooms.filter(r => !r.exterior && !EXTERIOR_STYLES.has(r.floorStyle));
    exteriorRooms.forEach(room => {
      if (room.vertices.length >= 3) {
        const isSelected = renderMode === 'editor' && room.id === selectedRoomId;
        drawFloorTexture(ctx, room.floorStyle, room.vertices, camera.zoom, renderMode);
        drawRoomOutline(ctx, room.vertices, isSelected, camera.zoom, true);
        if (isSelected) drawRoomVertexHandles(ctx, room.vertices, camera.zoom, dragVertexIndex);
      }
    });
    interiorRooms.forEach(room => {
      if (room.vertices.length >= 3) {
        const isSelected = renderMode === 'editor' && room.id === selectedRoomId;
        drawFloorTexture(ctx, room.floorStyle, room.vertices, camera.zoom, renderMode);
        drawRoomOutline(ctx, room.vertices, isSelected, camera.zoom, false);
        if (isSelected) drawRoomVertexHandles(ctx, room.vertices, camera.zoom, dragVertexIndex);
      }
    });

    if (renderMode === 'customer') {
      filteredRooms.filter(r => !r.exterior && !EXTERIOR_STYLES.has(r.floorStyle) && r.name).forEach(room => {
        if (room.vertices.length < 3 || !room.name) return;
        const xs = room.vertices.map(v => v.x);
        const ys = room.vertices.map(v => v.y);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        const skipNames = new Set(['main', 'main dining', 'dining', 'restaurant', 'floor', 'main floor']);
        if (skipNames.has(room.name.toLowerCase())) return;
        const fontSize = Math.max(11 / camera.zoom, 8);
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255,240,200,1)';
        ctx.letterSpacing = '0.12em';
        ctx.fillText(room.name.toUpperCase(), cx, cy);
        ctx.restore();
      });
    }

    if (roomInProgress && roomInProgress.length >= 1) {
      ctx.save();
      ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2 / camera.zoom; ctx.setLineDash([6 / camera.zoom, 4 / camera.zoom]);
      ctx.beginPath(); ctx.moveTo(roomInProgress[0].x, roomInProgress[0].y);
      for (let i = 1; i < roomInProgress.length; i++) ctx.lineTo(roomInProgress[i].x, roomInProgress[i].y);

      if (cursorWorld && roomInProgress.length >= 1) {
        const last = roomInProgress[roomInProgress.length - 1];
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(cursorWorld.x, cursorWorld.y);
      }

      ctx.stroke(); ctx.setLineDash([]);
      roomInProgress.forEach((v, i) => {
        ctx.fillStyle = i === 0 ? '#10b981' : '#3b82f6'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 / camera.zoom;
        ctx.beginPath(); ctx.arc(v.x, v.y, 6 / camera.zoom, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

        if (i === 0 && roomInProgress.length >= 2 && cursorWorld) {
          const dx = cursorWorld.x - v.x, dy = cursorWorld.y - v.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 30 / camera.zoom) {
            ctx.globalAlpha = 0.5;
            ctx.beginPath();
            ctx.arc(v.x, v.y, 30 / camera.zoom, 0, Math.PI * 2);
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 1.5 / camera.zoom;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      });
      ctx.restore();
    }

    if (wallStartPoint && renderMode === 'editor') {
      ctx.fillStyle = '#f59e0b'; ctx.shadowColor = 'rgba(245,158,11,0.5)'; ctx.shadowBlur = 8 / camera.zoom;
      ctx.beginPath(); ctx.arc(wallStartPoint.worldX, wallStartPoint.worldY, 5 / camera.zoom, 0, Math.PI * 2); ctx.fill();
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    }

    const filteredObjs = getFilteredObjects();

    filteredObjs.forEach(obj => {
      if (!isFinite(obj.worldX) || !isFinite(obj.worldY)) return;
      ctx.save();
      ctx.translate(obj.worldX, obj.worldY);
      ctx.rotate((obj.rotation * Math.PI) / 180);
      const isSelected = selectedObjectId === obj.id;
      const isHovered = hoveredId === obj.id;
      const status = tableStatusMap?.[obj.properties?.tableId || ''];
      const isRecommended = renderMode === 'customer' && recommendedObjectId === obj.id;
      const hoverT = renderMode === 'customer' ? (hoverProgressRef.current.get(obj.id) ?? 0) : 0;
      switch (obj.type) {
        case 'table': drawTable(ctx, obj, isSelected, isHovered, status, renderMode, camera.zoom, isRecommended, hoverT, !!(tableJoinableIds?.has(obj.properties?.tableId || ''))); break;
        case 'wall': drawWall(ctx, obj, isSelected, renderMode, camera.zoom); break;
        case 'door': drawDoor(ctx, obj, isSelected, renderMode, camera.zoom); break;
        case 'window': drawWindow(ctx, obj, isSelected, renderMode, camera.zoom); break;
        case 'wc': drawWC(ctx, obj, isSelected, renderMode, camera.zoom); break;
        case 'kitchen': drawKitchen(ctx, obj, isSelected, renderMode, camera.zoom); break;
        case 'bar_counter': drawBarCounter(ctx, obj, isSelected, renderMode, camera.zoom); break;
        case 'bar_stool': drawBarStool(ctx, obj, isSelected, renderMode, camera.zoom); break;
        case 'booth': drawBooth(ctx, obj, isSelected, isHovered, status, renderMode, camera.zoom, isRecommended, obj.rotation || 0, hoverT); break;
        case 'host_stand': drawHostStand(ctx, obj, isSelected, renderMode, camera.zoom); break;
        case 'stairs': drawStairs(ctx, obj, isSelected, renderMode, camera.zoom); break;
        case 'plant': drawPlant(ctx, obj, isSelected, renderMode, camera.zoom); break;
      }
      if (isSelected && renderMode === 'editor' && obj.type !== 'wall') {
        drawResizeHandles(ctx, obj, camera.zoom);
      }
      ctx.restore();
      // Draw chair edit handles in world space (after ctx.restore) for the editing table
      if (renderMode === 'editor' && editingChairsObjectId === obj.id && (obj.type === 'table' || obj.type === 'booth')) {
        drawChairEditHandles(ctx, obj, camera.zoom, hoveredChairId, selectedChairId);
        // Draw snap guides when dragging a chair
        if (chairDragId && chairDragObjectId === obj.id) {
          const chair = getEffectiveChairs(obj).find(c => c.id === chairDragId);
          if (chair) {
            const tRad = (obj.rotation * Math.PI) / 180;
            const tCos = Math.cos(tRad), tSin = Math.sin(tRad);
            const halfW = obj.width / 2;
            const halfH = obj.height / 2;
            const chairHalfH = chair.height / 2;
            const edgeGap = chairHalfH + 2;
            const topEdge = -(halfH + edgeGap);
            const bottomEdge = halfH + edgeGap;
            const leftEdge = -(halfW + edgeGap);
            const rightEdge = halfW + edgeGap;

            ctx.save();
            ctx.strokeStyle = 'rgba(100, 200, 255, 0.5)';
            ctx.lineWidth = 1 / camera.zoom;
            ctx.setLineDash([4 / camera.zoom, 3 / camera.zoom]);

            // Draw horizontal guide if snapped to top or bottom edge
            if (chair.y === topEdge || chair.y === bottomEdge) {
              const guideY = chair.y;
              const wx1 = obj.worldX + (-halfW - 10) * tCos - guideY * tSin;
              const wy1 = obj.worldY + (-halfW - 10) * tSin + guideY * tCos;
              const wx2 = obj.worldX + (halfW + 10) * tCos - guideY * tSin;
              const wy2 = obj.worldY + (halfW + 10) * tSin + guideY * tCos;
              ctx.beginPath();
              ctx.moveTo(wx1, wy1);
              ctx.lineTo(wx2, wy2);
              ctx.stroke();
            }
            // Draw vertical guide if snapped to left or right edge
            if (chair.x === leftEdge || chair.x === rightEdge) {
              const guideX = chair.x;
              const wx1 = obj.worldX + guideX * tCos - (-halfH - 10) * tSin;
              const wy1 = obj.worldY + guideX * tSin + (-halfH - 10) * tCos;
              const wx2 = obj.worldX + guideX * tCos - (halfH + 10) * tSin;
              const wy2 = obj.worldY + guideX * tSin + (halfH + 10) * tCos;
              ctx.beginPath();
              ctx.moveTo(wx1, wy1);
              ctx.lineTo(wx2, wy2);
              ctx.stroke();
            }
            // Draw center-axis guide if snapped to center
            if (chair.x === 0) {
              const wx1 = obj.worldX + 0 * tCos - (-halfH - 10) * tSin;
              const wy1 = obj.worldY + 0 * tSin + (-halfH - 10) * tCos;
              const wx2 = obj.worldX + 0 * tCos - (halfH + 10) * tSin;
              const wy2 = obj.worldY + 0 * tSin + (halfH + 10) * tCos;
              ctx.strokeStyle = 'rgba(255, 200, 100, 0.4)';
              ctx.beginPath();
              ctx.moveTo(wx1, wy1);
              ctx.lineTo(wx2, wy2);
              ctx.stroke();
            }
            if (chair.y === 0) {
              const wx1 = obj.worldX + (-halfW - 10) * tCos - 0 * tSin;
              const wy1 = obj.worldY + (-halfW - 10) * tSin + 0 * tCos;
              const wx2 = obj.worldX + (halfW + 10) * tCos - 0 * tSin;
              const wy2 = obj.worldY + (halfW + 10) * tSin + 0 * tCos;
              ctx.strokeStyle = 'rgba(255, 200, 100, 0.4)';
              ctx.beginPath();
              ctx.moveTo(wx1, wy1);
              ctx.lineTo(wx2, wy2);
              ctx.stroke();
            }
            ctx.setLineDash([]);
            ctx.restore();
          }
        }
      }
    });

    if (renderMode === 'customer') {
      filteredObjs.forEach(obj => {
        if ((obj.type !== 'table' && obj.type !== 'booth') || !isFinite(obj.worldX) || !isFinite(obj.worldY)) return;
        const status = tableStatusMap?.[obj.properties?.tableId || ''];
        const isHoveredRed = hoveredId === obj.id;
        if ((status === 'red' || !status) && isHoveredRed) {
          const tableId = obj.properties?.tableId || '';
          const unavailType = tableUnavailableTypeMap?.[tableId] || 'other';
          const bScaleInv = 1 / camera.zoom;
          const rotRad = (obj.rotation || 0) * Math.PI / 180;
          const hw = obj.width / 2;
          const hh = obj.height / 2;
          const absCos = Math.abs(Math.cos(rotRad));
          const absSin = Math.abs(Math.sin(rotRad));
          const bbHalfW = hw * absCos + hh * absSin;
          const bbHalfH = hw * absSin + hh * absCos;
          const wx = obj.worldX;
          const wy = obj.worldY;

          const tableCap2 = obj.capacity || 2;
          const isWinMismatch = unavailType === 'size' && (windowSeatIds?.has(obj.id) ?? false);
          const sizeMismatchTitle = isWinMismatch
            ? `This window table seats ${tableCap2}. Your party is ${partySize ?? tableCap2}.`
            : `This table seats ${tableCap2}. Your party is ${partySize ?? tableCap2}.`;
          const stateConfig: Record<string, { title: string; sub: string; accentColor: string }> = {
            booked: { title: 'Already reserved',   sub: 'Taken for your chosen time',          accentColor: 'rgba(175,68,50,0.80)'   },
            size:   { title: sizeMismatchTitle,     sub: '',                                    accentColor: 'rgba(148,118,52,0.65)'  },
            time:   { title: 'No slots available',  sub: 'No openings at your chosen time',     accentColor: 'rgba(140,112,48,0.60)'  },
            held:   { title: 'Being held',          sub: 'Another guest is deciding right now', accentColor: 'rgba(135,108,48,0.58)'  },
            other:  { title: 'Not available',       sub: '',                                    accentColor: 'rgba(125,100,45,0.55)'  },
          };
          const cfg = stateConfig[unavailType] || stateConfig.other;

          ctx.save();
          const redTableName = obj.name || obj.properties?.tableNumber || '';
          const titleFontSize = 12.5 * bScaleInv;
          const subFontSize = 10.5 * bScaleInv;
          const nameFontSize2 = 10 * bScaleInv;
          const accentBarW = 3 * bScaleInv;
          const padLeft = 10 * bScaleInv;
          const padRight = 14 * bScaleInv;
          const padY2 = 10 * bScaleInv;
          const lineGap2 = 3.5 * bScaleInv;
          const hasSub = !!cfg.sub;
          const hasName = !!redTableName;

          ctx.font = `500 ${titleFontSize}px system-ui, sans-serif`;
          const titleW = ctx.measureText(cfg.title).width;
          ctx.font = `400 ${subFontSize}px system-ui, sans-serif`;
          const subW = hasSub ? ctx.measureText(cfg.sub).width : 0;
          ctx.font = `400 ${nameFontSize2}px system-ui, sans-serif`;
          const nameW2 = hasName ? ctx.measureText(redTableName).width : 0;
          const contentW2 = Math.max(titleW, subW, nameW2);
          const bw = accentBarW + padLeft + contentW2 + padRight;
          const bh = (hasSub ? titleFontSize + lineGap2 + subFontSize : titleFontSize) + (hasName ? lineGap2 + nameFontSize2 : 0) + padY2 * 2;

          const worldRight = camera.panX + W * bScaleInv;
          const worldBottom = camera.panY + H * bScaleInv;
          let bx = wx + bbHalfW + 9 * bScaleInv;
          let by = wy - bh / 2;
          if (bx + bw > worldRight - 6 * bScaleInv) bx = wx - bbHalfW - bw - 9 * bScaleInv;
          if (bx < camera.panX + 6 * bScaleInv) { bx = wx - bw / 2; by = wy - bbHalfH - bh - 9 * bScaleInv; }
          if (by < camera.panY + 6 * bScaleInv) by = camera.panY + 6 * bScaleInv;
          if (by + bh > worldBottom - 6 * bScaleInv) by = worldBottom - bh - 6 * bScaleInv;

          const br = 7 * bScaleInv;

          // Drop shadow
          ctx.shadowColor = 'rgba(0,0,0,0.65)';
          ctx.shadowBlur = 16 * bScaleInv;
          ctx.shadowOffsetY = 3 * bScaleInv;

          // Dark warm surface
          const bgGrad = ctx.createLinearGradient(bx, by, bx, by + bh);
          bgGrad.addColorStop(0, 'rgba(14,11,8,0.97)');
          bgGrad.addColorStop(1, 'rgba(10,8,5,0.97)');
          ctx.fillStyle = bgGrad;
          ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, br); ctx.fill();
          ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

          // Subtle outer border — warm bronze tint
          ctx.strokeStyle = 'rgba(188,152,62,0.18)';
          ctx.lineWidth = 1 * bScaleInv;
          ctx.beginPath(); ctx.roundRect(bx + 0.5 * bScaleInv, by + 0.5 * bScaleInv, bw - 1 * bScaleInv, bh - 1 * bScaleInv, br - 0.5 * bScaleInv); ctx.stroke();

          // Left accent bar
          ctx.fillStyle = cfg.accentColor;
          const accentR = Math.min(br, accentBarW / 2);
          ctx.beginPath(); ctx.roundRect(bx, by, accentBarW, bh, [br, 0, 0, br]); ctx.fill();

          // Text
          const textX2 = bx + accentBarW + padLeft;
          ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.font = `500 ${titleFontSize}px system-ui, sans-serif`;
          ctx.fillStyle = 'rgba(232,224,212,0.95)';
          ctx.fillText(cfg.title, textX2, by + padY2);
          let textOffsetY = titleFontSize + lineGap2;
          if (hasSub) {
            ctx.font = `400 ${subFontSize}px system-ui, sans-serif`;
            ctx.fillStyle = 'rgba(155,145,130,0.70)';
            ctx.fillText(cfg.sub, textX2, by + padY2 + textOffsetY);
            textOffsetY += subFontSize + lineGap2;
          }
          if (hasName) {
            ctx.font = `400 ${nameFontSize2}px system-ui, sans-serif`;
            ctx.fillStyle = 'rgba(120,112,100,0.55)';
            ctx.fillText(redTableName, textX2, by + padY2 + textOffsetY);
          }

          // Thin connector line — just a subtle lead from badge edge to table
          const lineEndX = bx < wx ? wx - bbHalfW - 1.5 * bScaleInv : wx + bbHalfW + 1.5 * bScaleInv;
          const lineEndY = wy;
          const lineStartX = bx < wx ? bx + bw + 1.5 * bScaleInv : bx - 1.5 * bScaleInv;
          const lineStartY = by + bh / 2;
          if (Math.abs(lineStartX - lineEndX) > 8 * bScaleInv || Math.abs(lineStartY - lineEndY) > 8 * bScaleInv) {
            ctx.strokeStyle = 'rgba(255,255,255,0.08)';
            ctx.lineWidth = 0.8 * bScaleInv;
            ctx.setLineDash([2 * bScaleInv, 4 * bScaleInv]);
            ctx.beginPath(); ctx.moveTo(lineStartX, lineStartY); ctx.lineTo(lineEndX, lineEndY); ctx.stroke();
            ctx.setLineDash([]);
          }
          ctx.restore();
          return;
        }
        if (status === 'red' || !status) return;

        const isRecommended = recommendedObjectId === obj.id;
        const isHovered = hoveredId === obj.id;
        const isSelected = selectedObjectId === obj.id;

        const wx = obj.worldX;
        const wy = obj.worldY;

        const rotRad = (obj.rotation || 0) * Math.PI / 180;
        const hw = obj.width / 2;
        const hh = obj.height / 2;
        const absCos = Math.abs(Math.cos(rotRad));
        const absSin = Math.abs(Math.sin(rotRad));
        const bbHalfW = hw * absCos + hh * absSin;
        const bbHalfH = hw * absSin + hh * absCos;

        const bScaleInv = 1 / camera.zoom;

        if (isRecommended && !isSelected && suppressRecommendationBadge) {
          // Mobile: draw a compact pulsing gold double-ring directly on the table instead of the full badge
          ctx.save();
          const mobileRingR = (Math.max(bbHalfW, bbHalfH) + 7 * bScaleInv);
          ctx.shadowColor = 'rgba(205,170,62,0.50)';
          ctx.shadowBlur = 14 * bScaleInv;
          ctx.strokeStyle = 'rgba(205,170,62,0.82)';
          ctx.lineWidth = 2.2 * bScaleInv;
          ctx.globalAlpha = 0.88;
          ctx.beginPath(); ctx.arc(wx, wy, mobileRingR, 0, Math.PI * 2); ctx.stroke();
          ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
          ctx.strokeStyle = 'rgba(230,200,90,0.35)';
          ctx.lineWidth = 1.2 * bScaleInv;
          ctx.globalAlpha = 0.55;
          ctx.beginPath(); ctx.arc(wx, wy, mobileRingR + 4 * bScaleInv, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.restore();
        }

        if (isRecommended && !isSelected && !suppressRecommendationBadge) {
          const isWinRec = windowSeatIds?.has(obj.id) ?? false;
          ctx.save();

          // World-space viewport bounds
          const worldLeft   = camera.panX;
          const worldTop    = camera.panY;
          const worldRight  = camera.panX + W * bScaleInv;
          const worldBottom = camera.panY + H * bScaleInv;

          // UI control exclusion zones (in world space) so the badge never lands on top of buttons.
          // Zoom controls: bottom-right 3 × 34px buttons stacked = 34*3+4*2=110px total, starting 12px from edge.
          const ctrlPxW = 44 * bScaleInv, ctrlPxH = 120 * bScaleInv;
          const ctrlMargin = 14 * bScaleInv;
          const zoomCtrlX = worldRight  - ctrlPxW - ctrlMargin;
          const zoomCtrlY = worldBottom - ctrlPxH - ctrlMargin;
          // Legend button: bottom-left ~80px wide × 28px tall
          const legendPxW = 90 * bScaleInv, legendPxH = 36 * bScaleInv;
          const legendX = worldLeft  + ctrlMargin;
          const legendY = worldBottom - legendPxH - ctrlMargin;

          const objCap = obj.capacity || 2;
          const capLabel = `Seats ${objCap}`;
          const lines: Array<{ text: string; isBold: boolean }> = [
            { text: 'Recommended for your party', isBold: true },
            { text: isWinRec ? `${capLabel}  ·  Window seat` : capLabel, isBold: false },
          ];

          const mainFontSize = 13 * bScaleInv;
          const subFontSize  = 11 * bScaleInv;
          const padX  = 16 * bScaleInv;
          const padY  = 10 * bScaleInv;
          const lineGap = 5 * bScaleInv;
          const vpMargin = 10 * bScaleInv;
          const tipSize = 7 * bScaleInv; // callout arrow tip half-base & height

          ctx.font = `600 ${mainFontSize}px system-ui, sans-serif`;
          const mainW = ctx.measureText(lines[0].text).width;
          ctx.font = `400 ${subFontSize}px system-ui, sans-serif`;
          const subW = ctx.measureText(lines[1].text).width;

          const bw = Math.max(mainW, subW) + padX * 2;
          const bh = mainFontSize + lineGap + subFontSize + padY * 2;
          const br = 8 * bScaleInv;

          // Gap from table bounding box to badge (large enough that the badge
          // visually floats away from the table, not pressed against it).
          const gap = Math.max(bbHalfW, bbHalfH) * 0.35 + 18 * bScaleInv;

          // ----- Candidate positions -----
          // Each candidate also records which edge of the badge faces the table
          // ('r','l','t','b') so we know where to put the callout tip.
          type Candidate = { bx: number; by: number; tipEdge: 'r' | 'l' | 't' | 'b' };
          const rawCandidates: Candidate[] = [
            // above-centre — preferred first
            { bx: wx - bw / 2,              by: wy - bbHalfH - bh - gap, tipEdge: 'b' },
            // below-centre
            { bx: wx - bw / 2,              by: wy + bbHalfH + gap,       tipEdge: 't' },
            // right-centre
            { bx: wx + bbHalfW + gap,       by: wy - bh / 2,              tipEdge: 'l' },
            // left-centre
            { bx: wx - bbHalfW - bw - gap,  by: wy - bh / 2,              tipEdge: 'r' },
            // above-right
            { bx: wx + bbHalfW * 0.2,       by: wy - bbHalfH - bh - gap, tipEdge: 'b' },
            // above-left
            { bx: wx - bbHalfW * 0.2 - bw, by: wy - bbHalfH - bh - gap, tipEdge: 'b' },
            // below-right
            { bx: wx + bbHalfW * 0.2,       by: wy + bbHalfH + gap,       tipEdge: 't' },
            // below-left
            { bx: wx - bbHalfW * 0.2 - bw, by: wy + bbHalfH + gap,       tipEdge: 't' },
          ];

          // Clamp to viewport with penalty
          const clampCandidate = (c: Candidate): Candidate & { clampPenalty: number } => {
            const cbx = Math.max(worldLeft + vpMargin, Math.min(c.bx, worldRight - bw - vpMargin));
            const cby = Math.max(worldTop + vpMargin, Math.min(c.by, worldBottom - bh - vpMargin));
            return { bx: cbx, by: cby, tipEdge: c.tipEdge, clampPenalty: Math.abs(cbx - c.bx) + Math.abs(cby - c.by) };
          };

          // Overlap area between two axis-aligned rects
          const rectOverlap = (ax: number, ay: number, aw: number, ah: number,
                                bx2: number, by2: number, bw2: number, bh2: number): number => {
            const ix = Math.max(0, Math.min(ax + aw, bx2 + bw2) - Math.max(ax, bx2));
            const iy = Math.max(0, Math.min(ay + ah, by2 + bh2) - Math.max(ay, by2));
            return ix * iy;
          };

          // Score: lower is better
          const score = (c: Candidate & { clampPenalty: number }, priority: number): number => {
            let s = priority * 1e-4; // tiny bias for preferred ordering
            // Floorplan obstacles
            filteredObjs.forEach(other => {
              if (other.id === obj.id) return;
              const isBookable   = other.type === 'table' || other.type === 'booth';
              const isStructural = other.type === 'window' || other.type === 'wall' || other.type === 'door';
              if (!isBookable && !isStructural) return;
              const area = rectOverlap(c.bx, c.by, bw, bh,
                other.worldX - other.width / 2, other.worldY - other.height / 2, other.width, other.height);
              if (area > 0) s += isBookable ? area * 4 : area;
            });
            // Don't cover the recommended table itself
            s += rectOverlap(c.bx, c.by, bw, bh, wx - bbHalfW, wy - bbHalfH, bbHalfW * 2, bbHalfH * 2) * 12;
            // Don't cover UI controls (world-space bounding boxes)
            s += rectOverlap(c.bx, c.by, bw, bh, zoomCtrlX, zoomCtrlY, ctrlPxW, ctrlPxH) * 8;
            s += rectOverlap(c.bx, c.by, bw, bh, legendX, legendY, legendPxW, legendPxH) * 8;
            // Penalty for needing to be clamped into the viewport
            s += c.clampPenalty * 0.6;
            return s;
          };

          let best = { ...clampCandidate(rawCandidates[0]), priority: 0 };
          let bestScore = score(best, 0);
          for (let ci = 1; ci < rawCandidates.length; ci++) {
            const clamped = { ...clampCandidate(rawCandidates[ci]), priority: ci };
            const sc = score(clamped, ci);
            if (sc < bestScore) { best = clamped; bestScore = sc; }
          }

          const bx = best.bx;
          const by = best.by;
          const te = best.tipEdge; // which badge edge faces the table

          // Callout tip attachment point on the table bounding box
          let tipTableX = wx, tipTableY = wy;
          if (te === 'b') { tipTableX = Math.max(wx - bbHalfW, Math.min(wx + bbHalfW, bx + bw / 2)); tipTableY = wy - bbHalfH; }
          if (te === 't') { tipTableX = Math.max(wx - bbHalfW, Math.min(wx + bbHalfW, bx + bw / 2)); tipTableY = wy + bbHalfH; }
          if (te === 'l') { tipTableX = wx + bbHalfW; tipTableY = Math.max(wy - bbHalfH, Math.min(wy + bbHalfH, by + bh / 2)); }
          if (te === 'r') { tipTableX = wx - bbHalfW; tipTableY = Math.max(wy - bbHalfH, Math.min(wy + bbHalfH, by + bh / 2)); }

          // Callout tip root on the badge edge
          let tipRootX = bx + bw / 2, tipRootY = by;
          if (te === 'b') { tipRootX = Math.max(bx + br * 2, Math.min(bx + bw - br * 2, bx + bw / 2)); tipRootY = by + bh; }
          if (te === 't') { tipRootX = Math.max(bx + br * 2, Math.min(bx + bw - br * 2, bx + bw / 2)); tipRootY = by; }
          if (te === 'l') { tipRootX = bx; tipRootY = Math.max(by + br * 2, Math.min(by + bh - br * 2, by + bh / 2)); }
          if (te === 'r') { tipRootX = bx + bw; tipRootY = Math.max(by + br * 2, Math.min(by + bh - br * 2, by + bh / 2)); }

          const connDist = Math.sqrt((tipRootX - tipTableX) ** 2 + (tipRootY - tipTableY) ** 2);

          // ---- Draw connector line (behind badge) ----
          if (connDist > 8 * bScaleInv) {
            ctx.strokeStyle = 'rgba(195,162,68,0.35)';
            ctx.lineWidth = 1.1 * bScaleInv;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(tipRootX, tipRootY);
            ctx.lineTo(tipTableX, tipTableY);
            ctx.stroke();
            // Small dot at table end
            ctx.fillStyle = 'rgba(205,170,62,0.55)';
            ctx.beginPath();
            ctx.arc(tipTableX, tipTableY, 2.2 * bScaleInv, 0, Math.PI * 2);
            ctx.fill();
          }

          // ---- Draw badge background with callout tip ----
          ctx.shadowColor = 'rgba(165,130,42,0.32)';
          ctx.shadowBlur = 14 * bScaleInv;

          // Build the badge path with the integrated callout tip on the correct edge
          const buildBadgePath = () => {
            ctx.beginPath();
            if (te === 'b' && connDist > 8 * bScaleInv) {
              // Rounded rect + downward triangle on bottom edge
              const tx = tipRootX;
              manualRoundRect(ctx, bx, by, bw, bh, br);
              ctx.moveTo(tx - tipSize, by + bh);
              ctx.lineTo(tipTableX, tipTableY + tipSize * 0.5);
              ctx.lineTo(tx + tipSize, by + bh);
              ctx.closePath();
            } else if (te === 't' && connDist > 8 * bScaleInv) {
              manualRoundRect(ctx, bx, by, bw, bh, br);
              const tx = tipRootX;
              ctx.moveTo(tx - tipSize, by);
              ctx.lineTo(tipTableX, tipTableY - tipSize * 0.5);
              ctx.lineTo(tx + tipSize, by);
              ctx.closePath();
            } else if (te === 'l' && connDist > 8 * bScaleInv) {
              manualRoundRect(ctx, bx, by, bw, bh, br);
              const ty = tipRootY;
              ctx.moveTo(bx, ty - tipSize);
              ctx.lineTo(tipTableX - tipSize * 0.5, tipTableY);
              ctx.lineTo(bx, ty + tipSize);
              ctx.closePath();
            } else if (te === 'r' && connDist > 8 * bScaleInv) {
              manualRoundRect(ctx, bx, by, bw, bh, br);
              const ty = tipRootY;
              ctx.moveTo(bx + bw, ty - tipSize);
              ctx.lineTo(tipTableX + tipSize * 0.5, tipTableY);
              ctx.lineTo(bx + bw, ty + tipSize);
              ctx.closePath();
            } else {
              manualRoundRect(ctx, bx, by, bw, bh, br);
            }
          };

          // Fill background
          const bgGrad = ctx.createLinearGradient(bx, by, bx, by + bh);
          bgGrad.addColorStop(0, 'rgba(42,30,8,0.97)');
          bgGrad.addColorStop(1, 'rgba(26,18,4,0.97)');
          ctx.fillStyle = bgGrad;
          buildBadgePath();
          ctx.fill();
          ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;

          // Border
          const borderGrad = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
          borderGrad.addColorStop(0, 'rgba(215,178,72,0.75)');
          borderGrad.addColorStop(0.5,'rgba(188,152,56,0.50)');
          borderGrad.addColorStop(1, 'rgba(152,116,32,0.30)');
          ctx.strokeStyle = borderGrad;
          ctx.lineWidth = 1.2 * bScaleInv;
          ctx.save();
          ctx.translate(0.6 * bScaleInv, 0.6 * bScaleInv);
          manualRoundRect(ctx, bx, by, bw - 1.2 * bScaleInv, bh - 1.2 * bScaleInv, Math.max(0, br - 0.6 * bScaleInv));
          ctx.stroke();
          ctx.restore();

          // Text
          ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          const textX = bx + padX;
          ctx.font = `600 ${mainFontSize}px system-ui, sans-serif`;
          ctx.fillStyle = 'rgba(242,220,162,0.97)';
          ctx.fillText(lines[0].text, textX, by + padY);
          ctx.font = `400 ${subFontSize}px system-ui, sans-serif`;
          ctx.fillStyle = 'rgba(198,172,114,0.74)';
          ctx.fillText(lines[1].text, textX, by + padY + mainFontSize + lineGap);

          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.restore();
        }

        const isWindowSeat = windowSeatIds?.has(obj.id) ?? false;
        let wsBadgeH = 0;
        if (isWindowSeat && isHovered && !isSelected && !isRecommended) {
          ctx.save();
          const iconSize = 14 * bScaleInv;
          const mainFontSize = 12 * bScaleInv;
          const subFontSize = 10.5 * bScaleInv;
          const padX2 = 12 * bScaleInv;
          const padY2 = 9 * bScaleInv;
          const icoGap = 6 * bScaleInv;
          const lineGap2 = 3.5 * bScaleInv;
          const wsCap = obj.capacity || 2;
          const wsName = obj.name || obj.properties?.tableNumber || '';
          const viewDesc = windowViewDescriptionMap?.[obj.id] || (obj.properties?.viewDescription as string | undefined);
          const mainText = wsName ? wsName : `Window Table  ·  Seats ${wsCap}`;
          const subText = wsName ? `Seats ${wsCap}  ·  ${viewDesc || 'Window seat'}` : (viewDesc || 'Window View');

          ctx.font = `600 ${mainFontSize}px system-ui, sans-serif`;
          const mainTextW = ctx.measureText(mainText).width;
          let subTextW = 0;
          if (subText) {
            ctx.font = `400 ${subFontSize}px system-ui, sans-serif`;
            subTextW = ctx.measureText(subText).width;
          }
          const contentW = Math.max(mainTextW, subTextW);
          const bw = iconSize + icoGap + contentW + padX2 * 2;
          const bh = subText
            ? mainFontSize + lineGap2 + subFontSize + padY2 * 2
            : Math.max(iconSize, mainFontSize) + padY2 * 2;
          wsBadgeH = bh;
          const br2 = 10 * bScaleInv;

          let bx = wx - bw / 2;
          let by = wy - bbHalfH - bh - 10 * bScaleInv;
          const worldRight = camera.panX + W * bScaleInv;
          if (bx + bw > worldRight - 8 * bScaleInv) bx = worldRight - bw - 8 * bScaleInv;
          if (bx < camera.panX + 8 * bScaleInv) bx = camera.panX + 8 * bScaleInv;
          if (by < camera.panY + 8 * bScaleInv) by = wy + bbHalfH + 10 * bScaleInv;

          ctx.shadowColor = 'rgba(90,155,195,0.45)';
          ctx.shadowBlur = 14 * bScaleInv;
          const bgGrad2 = ctx.createLinearGradient(bx, by, bx, by + bh);
          bgGrad2.addColorStop(0, 'rgba(10,22,36,0.97)');
          bgGrad2.addColorStop(1, 'rgba(6,14,24,0.97)');
          ctx.fillStyle = bgGrad2;
          ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, br2); ctx.fill();
          ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;

          const bord2 = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
          bord2.addColorStop(0, 'rgba(138,195,228,0.85)');
          bord2.addColorStop(1, 'rgba(90,150,188,0.45)');
          ctx.strokeStyle = bord2;
          ctx.lineWidth = 1.5 * bScaleInv;
          ctx.beginPath(); ctx.roundRect(bx + 0.75 * bScaleInv, by + 0.75 * bScaleInv, bw - 1.5 * bScaleInv, bh - 1.5 * bScaleInv, br2 - 0.75 * bScaleInv); ctx.stroke();

          const cx2 = bx + padX2 + iconSize / 2;
          const cy2 = subText ? by + padY2 + mainFontSize / 2 : by + bh / 2;
          ctx.strokeStyle = 'rgba(148,205,232,0.90)';
          ctx.lineWidth = 1.5 * bScaleInv;
          ctx.fillStyle = 'rgba(148,205,232,0.18)';
          ctx.beginPath();
          ctx.rect(cx2 - iconSize * 0.42, cy2 - iconSize * 0.28, iconSize * 0.84, iconSize * 0.58);
          ctx.fill();
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cx2 - iconSize * 0.38, cy2 - iconSize * 0.28);
          ctx.quadraticCurveTo(cx2, cy2 - iconSize * 0.62, cx2 + iconSize * 0.38, cy2 - iconSize * 0.28);
          ctx.stroke();
          ctx.fillStyle = 'rgba(148,205,232,0.4)';
          ctx.beginPath();
          ctx.moveTo(cx2, cy2 - iconSize * 0.28);
          ctx.lineTo(cx2, cy2 - iconSize * 0.62);
          ctx.stroke();

          const textX2 = bx + padX2 + iconSize + icoGap;
          ctx.font = `600 ${mainFontSize}px system-ui, sans-serif`;
          ctx.fillStyle = 'rgba(178,220,242,1.0)';
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillText(mainText, textX2, cy2);

          if (subText) {
            ctx.font = `400 ${subFontSize}px system-ui, sans-serif`;
            ctx.fillStyle = 'rgba(140,190,220,0.72)';
            ctx.fillText(subText, textX2, by + padY2 + mainFontSize + lineGap2 + subFontSize / 2);
          }

          ctx.textAlign = 'center';
          ctx.restore();
        }

        const tags = tagsMap?.[obj.properties?.tableId || ''];
        if (isHovered && !isRecommended && !isWindowSeat) {
          ctx.save();
          const tagCap = obj.capacity || 2;
          const tableName = obj.name || obj.properties?.tableNumber || '';
          const tagTexts = [`Seats ${tagCap}`, ...(tags || [])].slice(0, 4);
          const nameFontSize = 12.5 * bScaleInv;
          const tagFontSize = 12 * bScaleInv;
          const padHoriz = 12 * bScaleInv;
          const padVert = 7 * bScaleInv;
          const tagH = tagFontSize + padVert * 2;
          const tagGap = 5 * bScaleInv;
          ctx.font = `500 ${tagFontSize}px system-ui, sans-serif`;
          const tagWidths = tagTexts.map(t => ctx.measureText(t).width + padHoriz * 2);
          const totalW = tagWidths.reduce((a, b) => a + b, 0) + tagGap * (tagWidths.length - 1);
          const nameGap = tableName ? nameFontSize + 6 * bScaleInv : 0;
          const totalH = tagH + nameGap;

          const worldLeft   = camera.panX;
          const worldTop    = camera.panY;
          const worldRight  = camera.panX + W * bScaleInv;
          const worldBottom = camera.panY + H * bScaleInv;
          const margin = 8 * bScaleInv;
          const edgeOff = 10 * bScaleInv; // gap from table bounding box edge

          // 8 candidate positions: above, below, right, left, then diagonals
          type TagCandidate = { startX: number; ty: number; nameCy: number };
          const candidates: TagCandidate[] = [
            // above-centre
            { startX: wx - totalW / 2, ty: wy - bbHalfH - edgeOff - totalH, nameCy: wy - bbHalfH - edgeOff - tagH - 2 * bScaleInv },
            // below-centre
            { startX: wx - totalW / 2, ty: wy + bbHalfH + edgeOff + nameGap, nameCy: wy + bbHalfH + edgeOff },
            // right-centre
            { startX: wx + bbHalfW + edgeOff, ty: wy - tagH / 2, nameCy: wy - tagH / 2 - nameGap / 2 },
            // left-centre
            { startX: wx - bbHalfW - edgeOff - totalW, ty: wy - tagH / 2, nameCy: wy - tagH / 2 - nameGap / 2 },
            // top-right
            { startX: wx + bbHalfW * 0.5, ty: wy - bbHalfH - edgeOff - totalH, nameCy: wy - bbHalfH - edgeOff - tagH - 2 * bScaleInv },
            // top-left
            { startX: wx - bbHalfW * 0.5 - totalW, ty: wy - bbHalfH - edgeOff - totalH, nameCy: wy - bbHalfH - edgeOff - tagH - 2 * bScaleInv },
            // bottom-right
            { startX: wx + bbHalfW * 0.5, ty: wy + bbHalfH + edgeOff + nameGap, nameCy: wy + bbHalfH + edgeOff },
            // bottom-left
            { startX: wx - bbHalfW * 0.5 - totalW, ty: wy + bbHalfH + edgeOff + nameGap, nameCy: wy + bbHalfH + edgeOff },
          ];

          // Helper: rect overlap area in world space
          const rectOverlap = (ax: number, ay: number, aw: number, ah: number, bx2: number, by2: number, bw2: number, bh2: number) => {
            const ox = Math.max(0, Math.min(ax + aw, bx2 + bw2) - Math.max(ax, bx2));
            const oy = Math.max(0, Math.min(ay + ah, by2 + bh2) - Math.max(ay, by2));
            return ox * oy;
          };

          // Pre-compute other table bounding boxes in world space
          const otherTableBoxes = filteredObjs
            .filter(o => o.id !== obj.id && (o.type === 'table' || o.type === 'booth') && isFinite(o.worldX) && isFinite(o.worldY))
            .map(o => {
              const oRotRad = (o.rotation || 0) * Math.PI / 180;
              const ohw = o.width / 2, ohh = o.height / 2;
              const oAbsCos = Math.abs(Math.cos(oRotRad)), oAbsSin = Math.abs(Math.sin(oRotRad));
              const obhW = ohw * oAbsCos + ohh * oAbsSin;
              const obhH = ohw * oAbsSin + ohh * oAbsCos;
              return { x: o.worldX - obhW, y: o.worldY - obhH, w: obhW * 2, h: obhH * 2 };
            });

          let bestCandidate = candidates[0];
          let bestScore = Infinity;

          for (const cand of candidates) {
            const cx = cand.startX, cy = cand.ty;

            // Clip to viewport
            const clampedX = Math.max(worldLeft + margin, Math.min(worldRight - totalW - margin, cx));
            const clampedY = Math.max(worldTop + margin, Math.min(worldBottom - totalH - margin, cy));
            const vpPenalty = (Math.abs(clampedX - cx) + Math.abs(clampedY - cy)) * 1000;

            // Overlap with other tables
            let overlapPenalty = 0;
            for (const box of otherTableBoxes) {
              overlapPenalty += rectOverlap(clampedX, clampedY - nameGap, totalW, totalH, box.x, box.y, box.w, box.h) * 500;
            }

            // Distance from hovered table centre (small tiebreaker)
            const cx2 = clampedX + totalW / 2, cy2 = clampedY + tagH / 2;
            const distPenalty = Math.sqrt((cx2 - wx) ** 2 + (cy2 - wy) ** 2) * 0.05;

            const score = vpPenalty + overlapPenalty + distPenalty;
            if (score < bestScore) {
              bestScore = score;
              bestCandidate = { ...cand, startX: clampedX, ty: clampedY };
            }
          }

          let startX = Math.max(worldLeft + margin, Math.min(worldRight - totalW - margin, bestCandidate.startX));
          const ty = Math.max(worldTop + margin, Math.min(worldBottom - totalH - margin, bestCandidate.ty));

          // Table name label above/near pills
          if (tableName) {
            ctx.font = `600 ${nameFontSize}px system-ui, sans-serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = status === 'green' ? 'rgba(195,232,215,0.92)' : 'rgba(245,218,165,0.92)';
            ctx.shadowColor = 'rgba(0,0,0,0.6)';
            ctx.shadowBlur = 6 * bScaleInv;
            ctx.fillText(tableName, startX + totalW / 2, ty - 2 * bScaleInv);
            ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
          }

          tagTexts.forEach((tag, i) => {
            const isCapTag = i === 0;
            const tx = startX + tagWidths.slice(0, i).reduce((a, b) => a + b, 0) + i * tagGap;
            const br3 = tagH / 2;
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 8 * bScaleInv;
            ctx.fillStyle = isCapTag ? 'rgba(14,10,4,0.97)' : 'rgba(20,15,8,0.95)';
            ctx.beginPath(); ctx.roundRect(tx, ty, tagWidths[i], tagH, br3); ctx.fill();
            ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
            if (isCapTag) {
              ctx.strokeStyle = status === 'green' ? 'rgba(148,200,172,0.72)' : 'rgba(225,188,80,0.72)';
            } else {
              ctx.strokeStyle = status === 'green' ? 'rgba(148,200,172,0.45)' : 'rgba(215,178,82,0.42)';
            }
            ctx.lineWidth = isCapTag ? 2 * bScaleInv : 1.5 * bScaleInv;
            ctx.beginPath(); ctx.roundRect(tx + 0.75 * bScaleInv, ty + 0.75 * bScaleInv, tagWidths[i] - 1.5 * bScaleInv, tagH - 1.5 * bScaleInv, br3 - 0.75 * bScaleInv); ctx.stroke();
            if (isCapTag) {
              ctx.fillStyle = status === 'green' ? 'rgba(185,230,208,1.0)' : 'rgba(252,222,158,1.0)';
              ctx.font = `600 ${tagFontSize}px system-ui, sans-serif`;
            } else {
              ctx.fillStyle = status === 'green' ? 'rgba(175,218,195,1.0)' : 'rgba(238,200,128,1.0)';
              ctx.font = `500 ${tagFontSize}px system-ui, sans-serif`;
            }
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(tag, tx + tagWidths[i] / 2, ty + tagH / 2);
          });
          ctx.restore();
        }
      });
    }

    ctx.restore();

    if (renderMode === 'customer') {
      // Edge-only vignette — frames the room without fogging the centre
      const vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.38, W / 2, H / 2, Math.max(W, H) * 0.82);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.22)');
      ctx.fillStyle = vignette; ctx.fillRect(0, 0, W, H);
    }

    if (renderMode === 'editor' && showCustomerViewport && customerViewportBounds) {
      const { minX, minY, maxX, maxY } = customerViewportBounds;
      const worldToScreen = (wx: number, wy: number) => ({
        sx: W / 2 + (wx + camera.panX) * camera.zoom,
        sy: H / 2 + (wy + camera.panY) * camera.zoom,
      });

      const topLeft = worldToScreen(minX, minY);
      const botRight = worldToScreen(maxX, maxY);

      const vx = topLeft.sx, vy = topLeft.sy;
      const vw = botRight.sx - topLeft.sx, vh = botRight.sy - topLeft.sy;

      ctx.save();
      ctx.strokeStyle = 'rgba(251,191,36,0.85)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 5]);
      ctx.strokeRect(vx, vy, vw, vh);
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(251,191,36,0.04)';
      ctx.fillRect(vx, vy, vw, vh);

      // Resize handles at corners and edge midpoints
      const handleSize = 6;
      const handles: [number, number][] = [
        [vx, vy], [vx + vw, vy], [vx + vw, vy + vh], [vx, vy + vh],
        [vx + vw / 2, vy], [vx + vw, vy + vh / 2], [vx + vw / 2, vy + vh], [vx, vy + vh / 2],
      ];
      for (const [hx, hy] of handles) {
        ctx.fillStyle = 'rgba(251,191,36,0.95)';
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1;
        ctx.fillRect(hx - handleSize / 2, hy - handleSize / 2, handleSize, handleSize);
        ctx.strokeRect(hx - handleSize / 2, hy - handleSize / 2, handleSize, handleSize);
      }

      const cvW = Math.round(maxX - minX);
      const cvH = Math.round(maxY - minY);
      const labelText = `Customer view (${cvW}\u00D7${cvH})`;
      const labelX = vx + 10;
      const labelY = vy + 22;
      ctx.font = 'bold 12px system-ui';
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(labelX - 4, labelY - 14, ctx.measureText(labelText).width + 8, 18);
      ctx.fillStyle = 'rgba(251,191,36,0.95)';
      ctx.fillText(labelText, labelX, labelY);

      // Hint text
      const hintText = 'Drag edges to resize';
      ctx.font = '10px system-ui';
      const hintW = ctx.measureText(hintText).width;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(vx + vw - hintW - 16, vy + vh - 22, hintW + 8, 16);
      ctx.fillStyle = 'rgba(251,191,36,0.7)';
      ctx.fillText(hintText, vx + vw - hintW - 12, vy + vh - 10);
      ctx.restore();
    }

    if (renderMode === 'editor') {
      const zoomPct = Math.round(camera.zoom * 100);
      ctx.save();
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(148,163,184,0.7)';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`${zoomPct}%`, W - 12, H - 10);
      ctx.restore();
    }

    if (renderMode === 'editor' && resizeHandle && selectedObjectId && cursorWorld) {
      const sel = layout.objects.find(o => o.id === selectedObjectId);
      if (sel) {
        const SCALE = 0.01;
        const wm = (sel.width * SCALE).toFixed(2);
        const hm = (sel.height * SCALE).toFixed(2);
        const labelText = `${wm}m × ${hm}m`;
        const worldToScreenLocal = (wx: number, wy: number) => ({
          sx: W / 2 + (wx + camera.panX) * camera.zoom,
          sy: H / 2 + (wy + camera.panY) * camera.zoom,
        });
        const sp = worldToScreenLocal(cursorWorld.x, cursorWorld.y);
        const tx = Math.min(sp.sx + 14, W - 80);
        const ty = Math.max(sp.sy - 14, 20);
        ctx.save();
        ctx.font = '600 11px system-ui, sans-serif';
        const tw = ctx.measureText(labelText).width;
        ctx.fillStyle = 'rgba(15,23,42,0.88)';
        ctx.beginPath();
        const pad = 5, r = 4;
        ctx.roundRect(tx - pad, ty - 14, tw + pad * 2, 20, r);
        ctx.fill();
        ctx.fillStyle = '#e2e8f0';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, tx, ty - 4);
        ctx.restore();
      }
    }
  }, [layout, rooms, camera, canvasSize, selectedObjectId, selectedRoomId, hoveredId, hoverAnimTick, renderMode, gridSnapping, gridSize, getFilteredObjects, wallStartPoint, roomInProgress, tableStatusMap, tableUnavailableReasonMap, recommendedObjectId, windowSeatIds, windowViewDescriptionMap, tagsMap, selectedAreaId, showCustomerViewport, customerViewportSize, customerViewportBounds, dragVertexIndex, cursorWorld, resizeHandle, editingChairsObjectId, hoveredChairId, selectedChairId, chairDragId, chairDragObjectId]);

  const cursor = React.useMemo(() => {
    if (renderMode === 'customer') {
      if (hoveredId) return 'pointer';
      return isDragging ? 'grabbing' : 'grab';
    }
    // RMB pan active
    if (isRmbDown) return 'grabbing';
    if (vpDragHandle) return vpDragHandle === 'move' ? 'grabbing' : 'grabbing';
    if (activeTool === 'pan') return isDragging ? 'grabbing' : 'grab';
    if (activeTool === 'select') {
      // Viewport handle cursor
      if (showCustomerViewport && customerViewportBounds && cursorWorld) {
        const vpH = getViewportHandleAtPoint(cursorWorld.x, cursorWorld.y);
        if (vpH === 'nw' || vpH === 'se') return 'nwse-resize';
        if (vpH === 'ne' || vpH === 'sw') return 'nesw-resize';
        if (vpH === 'n' || vpH === 's') return 'ns-resize';
        if (vpH === 'e' || vpH === 'w') return 'ew-resize';
        if (vpH === 'move') return 'move';
      }
      if (resizeHandle !== null) return 'grabbing';
      if (dragVertexRoomId !== null) return 'grabbing';
      if (selectedObjectId && cursorWorld) {
        const sel = layout.objects.find(o => o.id === selectedObjectId);
        if (sel && sel.type !== 'wall') {
          const rh = (() => {
            const hitR = 10 / camera.zoom;
            const hw = sel.width / 2, hh = sel.height / 2;
            const rad = (sel.rotation * Math.PI) / 180;
            const cos = Math.cos(rad), sin = Math.sin(rad);
            const handles: Array<{ id: 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'; lx: number; ly: number }> = [
              { id: 'nw', lx: -hw, ly: -hh }, { id: 'n', lx: 0, ly: -hh }, { id: 'ne', lx: hw, ly: -hh },
              { id: 'e', lx: hw, ly: 0 }, { id: 'se', lx: hw, ly: hh }, { id: 's', lx: 0, ly: hh },
              { id: 'sw', lx: -hw, ly: hh }, { id: 'w', lx: -hw, ly: 0 },
            ];
            for (const h of handles) {
              const rx = sel.worldX + h.lx * cos - h.ly * sin;
              const ry = sel.worldY + h.lx * sin + h.ly * cos;
              if (Math.sqrt((cursorWorld.x - rx) ** 2 + (cursorWorld.y - ry) ** 2) <= hitR) return h.id;
            }
            return null;
          })();
          if (rh === 'nw' || rh === 'se') return 'nwse-resize';
          if (rh === 'ne' || rh === 'sw') return 'nesw-resize';
          if (rh === 'n' || rh === 's') return 'ns-resize';
          if (rh === 'e' || rh === 'w') return 'ew-resize';
        }
      }
      if (selectedRoomId) {
        const room = rooms.find(r => r.id === selectedRoomId);
        if (room && cursorWorld) {
          const hitR = VERTEX_HIT_RADIUS / camera.zoom;
          const onVertex = room.vertices.some(v => Math.sqrt((cursorWorld.x - v.x) ** 2 + (cursorWorld.y - v.y) ** 2) <= hitR);
          if (onVertex) return 'crosshair';
        }
      }
      return hoveredId ? 'move' : 'default';
    }
    return 'crosshair';
  }, [renderMode, activeTool, hoveredId, isDragging, selectedRoomId, selectedObjectId, rooms, layout.objects, cursorWorld, camera.zoom, dragVertexRoomId, resizeHandle, isRmbDown, vpDragHandle, showCustomerViewport, customerViewportBounds, getViewportHandleAtPoint]);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full touch-none block"
        style={{ touchAction: 'none', cursor }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onContextMenu={e => e.preventDefault()}
      />
    </div>
  );
}
