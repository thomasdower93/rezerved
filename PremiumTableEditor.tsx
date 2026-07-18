import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MousePointer2, Minus, DoorOpen, CodeSquare as SquareCode, Bath, Circle, Square, RectangleHorizontal, Armchair, LayoutGrid, Layers, Trash2, RotateCw, Undo2, Redo2, Grid3x3, Save, Plus, X, ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Settings, Lock, Unlock, Home, Pencil, Zap, Trees, ArrowUpDown, Coffee, Star, Building2, Leaf, Eye, ZoomIn, ZoomOut, Maximize2, HelpCircle, UtensilsCrossed, Move } from 'lucide-react';
import { PremiumFloorplanCanvas, EditorTool, PremiumFloorplanCanvasHandle } from './PremiumFloorplanCanvas';
import { IsometricFloorplanCanvas } from './IsometricFloorplanCanvas';
import { V2LayoutData, V2LayoutObject, Area, RoomPolygon, Floorplan, ChairData } from '../lib/types';
import { generateDefaultChairs, addDefaultChair, getEffectiveChairs } from '../lib/chairUtils';
import { getOrCreateLegacyFloorplan, saveFloorplan, getAllFloorplans, rollbackToFloorplan } from '../services/floorplans';
import { getLayoutAsV2, cleanupOrphanedObjects } from '../services/legacyAdapter';
import { getAreas, createArea, deleteArea } from '../services/areas';
import { syncV2LayoutToDatabase, getTables } from '../services/tables';
import { getActiveCombinationNamesForTable } from '../services/combinations';

interface PremiumTableEditorProps {
  restaurantId: string;
  onBack?: () => void;
}

interface ToolGroup {
  label: string;
  icon: React.ReactNode;
  tools: { id: EditorTool; icon: React.ReactNode; label: string; shortcut?: string }[];
}

const GRID_SIZE = 20;

function generateId(prefix: string) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

function defaultSizeFor(type: EditorTool): { w: number; h: number } {
  switch (type) {
    case 'add_table_round': return { w: 90, h: 90 };
    case 'add_table_square': return { w: 90, h: 90 };
    case 'add_table_rect': return { w: 140, h: 80 };
    case 'add_bar_stool': return { w: 36, h: 36 };
    case 'add_booth': return { w: 160, h: 100 };
    case 'bar_counter': return { w: 220, h: 60 };
    case 'host_stand': return { w: 70, h: 70 };
    case 'stairs': return { w: 100, h: 150 };
    case 'plant': return { w: 50, h: 50 };
    case 'wc': return { w: 80, h: 80 };
    case 'kitchen': return { w: 180, h: 120 };
    case 'door': return { w: 80, h: 14 };
    case 'window': return { w: 100, h: 18 };
    default: return { w: 80, h: 80 };
  }
}

function shapeForTool(tool: EditorTool): 'circle' | 'square' | 'rectangle' {
  if (tool === 'add_table_round') return 'circle';
  if (tool === 'add_table_rect') return 'rectangle';
  return 'square';
}

export function PremiumTableEditor({ restaurantId }: PremiumTableEditorProps) {
  const [layout, setLayout] = useState<V2LayoutData | null>(null);
  const [rooms, setRooms] = useState<RoomPolygon[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<EditorTool>('select');
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [wallStart, setWallStart] = useState<{ worldX: number; worldY: number } | null>(null);
  const [roomInProgress, setRoomInProgress] = useState<Array<{ x: number; y: number }>>([]);
  const [gridSnapping, setGridSnapping] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [allFloorplans, setAllFloorplans] = useState<Floorplan[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<{ layout: V2LayoutData; rooms: RoomPolygon[] }[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['Interact', 'Room', 'Tables', 'Bar', 'Structure', 'Decor', 'Outdoor']));
  const [rightPanelTab, setRightPanelTab] = useState<'properties' | 'areas' | 'rooms'>('properties');
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [showCustomerViewport, setShowCustomerViewport] = useState(false);
  const [showCustomerPreview, setShowCustomerPreview] = useState(false);
  const [previewViewMode, setPreviewViewMode] = useState<'2d' | '3d'>('2d');
  const [interiorRoomsOpen, setInteriorRoomsOpen] = useState(true);
  const [outdoorAreasOpen, setOutdoorAreasOpen] = useState(true);
  const [customerViewportSize, setCustomerViewportSize] = useState<{ width: number; height: number } | undefined>();
  const [customerViewportBounds, setCustomerViewportBounds] = useState<{ minX: number; minY: number; maxX: number; maxY: number } | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const canvasHandle = useRef<PremiumFloorplanCanvasHandle>(null);
  const isUndoingRef = useRef(false);
  const [showHelp, setShowHelp] = useState(false);
  const [joinableWarning, setJoinableWarning] = useState<string[]>([]);
  const [editingChairsObjectId, setEditingChairsObjectId] = useState<string | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  };

  const computeContentBounds = useCallback((objects: V2LayoutObject[], rooms: RoomPolygon[], pad = 40) => {
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
    if (!isFinite(minX)) {
      return { minX: -600, minY: -400, maxX: 600, maxY: 400 };
    }
    return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
  }, []);

  const expandViewportBoundsForObject = useCallback((obj: V2LayoutObject) => {
    const hw = obj.width / 2 + 40, hh = obj.height / 2 + 40;
    setCustomerViewportBounds(prev => {
      if (!prev) return prev;
      const oMinX = obj.worldX - hw, oMaxX = obj.worldX + hw;
      const oMinY = obj.worldY - hh, oMaxY = obj.worldY + hh;
      if (oMinX >= prev.minX && oMaxX <= prev.maxX && oMinY >= prev.minY && oMaxY <= prev.maxY) return prev;
      return {
        minX: Math.min(prev.minX, oMinX),
        minY: Math.min(prev.minY, oMinY),
        maxX: Math.max(prev.maxX, oMaxX),
        maxY: Math.max(prev.maxY, oMaxY),
      };
    });
  }, []);

  const commitState = useCallback((newLayout: V2LayoutData, newRooms: RoomPolygon[]) => {
    if (isUndoingRef.current) return;
    setHistory(prev => {
      const slice = prev.slice(0, histIdx + 1);
      const next = [...slice, { layout: newLayout, rooms: newRooms }].slice(-60);
      setHistIdx(next.length - 1);
      return next;
    });
    setLayout(newLayout);
    setRooms(newRooms);
    setHasUnsaved(true);
  }, [histIdx]);

  const updateLayout = useCallback((newLayout: V2LayoutData) => {
    commitState(newLayout, rooms);
  }, [commitState, rooms]);

  const updateRooms = useCallback((newRooms: RoomPolygon[]) => {
    if (!layout) return;
    commitState(layout, newRooms);
  }, [commitState, layout]);

  const undo = useCallback(() => {
    if (histIdx <= 0 || isUndoingRef.current) return;
    isUndoingRef.current = true;
    const prev = history[histIdx - 1];
    setHistIdx(h => h - 1);
    setLayout(prev.layout);
    setRooms(prev.rooms);
    setHasUnsaved(true);
    setTimeout(() => { isUndoingRef.current = false; }, 0);
  }, [histIdx, history]);

  const redo = useCallback(() => {
    if (histIdx >= history.length - 1 || isUndoingRef.current) return;
    isUndoingRef.current = true;
    const next = history[histIdx + 1];
    setHistIdx(h => h + 1);
    setLayout(next.layout);
    setRooms(next.rooms);
    setHasUnsaved(true);
    setTimeout(() => { isUndoingRef.current = false; }, 0);
  }, [histIdx, history]);

  useEffect(() => { loadAll(); }, [restaurantId]);

  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setCustomerViewportSize({ width: Math.round(width), height: Math.round(height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const loadAll = async () => {
    setIsLoading(true);
    try {
      const [fp, areasData, allFps] = await Promise.all([
        getOrCreateLegacyFloorplan(restaurantId),
        getAreas(restaurantId),
        getAllFloorplans(restaurantId),
      ]);
      setAllFloorplans(allFps);
      setAreas(areasData);
      if (areasData.length > 0) setSelectedAreaId(areasData[0].id);

      const v2 = getLayoutAsV2(fp.layout_data);
      const tables = await getTables(restaurantId);
      const validTableIds = new Set(tables.map(t => t.id));
      const validAreaIds = new Set(areasData.map(a => a.id));
      let cleaned = cleanupOrphanedObjects(v2, validTableIds, validAreaIds);
      if (areasData.length > 0) {
        const def = areasData[0].id;
        cleaned = { ...cleaned, objects: cleaned.objects.map(o => ({ ...o, areaId: o.areaId || def })) };
      }
      const storedRooms: RoomPolygon[] = (fp.layout_data as any)?.rooms || [];
      setLayout(cleaned);
      setRooms(storedRooms);
      if (cleaned.customerViewportBounds) {
        setCustomerViewportBounds(cleaned.customerViewportBounds);
        setShowCustomerViewport(true);
      }
      setHistory([{ layout: cleaned, rooms: storedRooms }]);
      setHistIdx(0);
    } catch {
      showToast('Failed to load layout', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedRoomId) { e.preventDefault(); if (confirm('Delete this room shape?')) { updateRooms(rooms.filter(r => r.id !== selectedRoomId)); setSelectedRoomId(null); } return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedObjectId) { e.preventDefault(); deleteSelected(); return; }
      if (e.key === 'Escape') { e.preventDefault(); setSelectedObjectId(null); setSelectedRoomId(null); setWallStart(null); setRoomInProgress([]); setActiveTool('select'); setEditingChairsObjectId(null); }
      if (e.key === 'v') setActiveTool('select');
      if (e.key === 'w') setActiveTool('wall');
      if (selectedObjectId && layout) {
        const obj = layout.objects.find(o => o.id === selectedObjectId);
        if (!obj) return;
        const step = e.shiftKey ? 10 : 1;
        if (e.key === 'ArrowUp') { e.preventDefault(); handleObjectMove(selectedObjectId, obj.worldX, obj.worldY - step); }
        if (e.key === 'ArrowDown') { e.preventDefault(); handleObjectMove(selectedObjectId, obj.worldX, obj.worldY + step); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); handleObjectMove(selectedObjectId, obj.worldX - step, obj.worldY); }
        if (e.key === 'ArrowRight') { e.preventDefault(); handleObjectMove(selectedObjectId, obj.worldX + step, obj.worldY); }
        if ((e.metaKey || e.ctrlKey) && e.key === 'd') { e.preventDefault(); duplicateSelected(); }
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [selectedObjectId, selectedRoomId, rooms, layout, undo, redo]);

  const handleObjectMove = (id: string, wx: number, wy: number) => {
    if (!layout) return;
    const updated = layout.objects.map(o => o.id === id ? { ...o, worldX: wx, worldY: wy } : o);
    updateLayout({ ...layout, objects: updated });
    if (showCustomerViewport) {
      const movedObj = updated.find(o => o.id === id);
      if (movedObj) expandViewportBoundsForObject(movedObj);
    }
  };

  const handleObjectUpdate = (id: string, updates: Partial<V2LayoutObject>) => {
    if (!layout) return;
    if (updates.properties && !updates.properties.joinable && id !== selectedObjectId) {
      setJoinableWarning([]);
    }
    updateLayout({ ...layout, objects: layout.objects.map(o => o.id === id ? { ...o, ...updates } : o) });
  };

  const handleChairsUpdate = (objectId: string, chairs: ChairData[]) => {
    if (!layout) return;
    updateLayout({ ...layout, objects: layout.objects.map(o => o.id === objectId ? { ...o, chairs } : o) });
  };

  const handleRoomVertexMove = (roomId: string, vertexIndex: number, x: number, y: number) => {
    updateRooms(rooms.map(r => r.id === roomId
      ? { ...r, vertices: r.vertices.map((v, i) => i === vertexIndex ? { x, y } : v) }
      : r
    ));
  };

  const deleteSelected = () => {
    if (!layout || !selectedObjectId) return;
    updateLayout({ ...layout, objects: layout.objects.filter(o => o.id !== selectedObjectId) });
    setSelectedObjectId(null);
  };

  const duplicateSelected = () => {
    if (!layout || !selectedObjectId) return;
    const obj = layout.objects.find(o => o.id === selectedObjectId);
    if (!obj) return;
    const dup = { ...obj, id: generateId(obj.type), worldX: obj.worldX + 30, worldY: obj.worldY + 30 };
    updateLayout({ ...layout, objects: [...layout.objects, dup] });
    setSelectedObjectId(dup.id);
  };

  const handleCanvasClick = (worldX: number, worldY: number) => {
    if (!layout) return;
    if (activeTool === 'wall') {
      if (!wallStart) { setWallStart({ worldX, worldY }); return; }
      const dx = worldX - wallStart.worldX, dy = worldY - wallStart.worldY;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 10) { setWallStart(null); return; }
      const wall: V2LayoutObject = {
        id: generateId('wall'), type: 'wall', worldX: (wallStart.worldX + worldX) / 2, worldY: (wallStart.worldY + worldY) / 2,
        width: len, height: 12, rotation: Math.atan2(dy, dx) * (180 / Math.PI), zIndex: 0, locked: false, areaId: selectedAreaId || undefined,
      };
      updateLayout({ ...layout, objects: [...layout.objects, wall] });
      setWallStart(null);
      return;
    }

    const toolToType: Record<string, V2LayoutObject['type']> = {
      add_table_round: 'table', add_table_square: 'table', add_table_rect: 'table',
      add_booth: 'booth', add_bar_stool: 'bar_stool', bar_counter: 'bar_counter',
      host_stand: 'host_stand', stairs: 'stairs', plant: 'plant', door: 'door', window: 'window', wc: 'wc', kitchen: 'kitchen',
    };
    const objType = toolToType[activeTool];
    if (!objType) return;

    const { w, h } = defaultSizeFor(activeTool);
    const tableCount = layout.objects.filter(o => o.type === 'table' || o.type === 'booth').length;
    const isTable = objType === 'table' || objType === 'booth';

    const newObj: V2LayoutObject = {
      id: generateId(objType), type: objType, worldX, worldY, width: w, height: h,
      rotation: 0, zIndex: layout.objects.length, locked: false, areaId: selectedAreaId || undefined,
      ...(objType === 'table' ? {
        name: `T${tableCount + 1}`,
        capacity: activeTool === 'add_table_rect' ? 6 : 4,
        shape: shapeForTool(activeTool),
      } : {}),
      ...(objType === 'booth' ? { name: `Booth ${tableCount + 1}`, capacity: 4 } : {}),
      properties: { reservable: isTable },
    };
    updateLayout({ ...layout, objects: [...layout.objects, newObj] });
    setSelectedObjectId(newObj.id);
    if (showCustomerViewport) expandViewportBoundsForObject(newObj);
  };

  const handleRoomVertexClick = (worldX: number, worldY: number) => {
    const newVerts = [...roomInProgress, { x: worldX, y: worldY }];
    const isOutdoor = activeTool === 'draw_outdoor';
    if (newVerts.length >= 3) {
      const first = newVerts[0];
      if (Math.sqrt((worldX - first.x) ** 2 + (worldY - first.y) ** 2) < 30) {
        newVerts.pop();
        if (newVerts.length >= 3) {
          const defaultStyle = isOutdoor ? 'gravel' : 'wood';
          const room: RoomPolygon = {
            id: generateId(isOutdoor ? 'outdoor' : 'room'),
            vertices: newVerts,
            floorStyle: defaultStyle,
            areaId: selectedAreaId || undefined,
            name: isOutdoor ? `Outdoor ${rooms.filter(r => r.exterior).length + 1}` : `Room ${rooms.filter(r => !r.exterior).length + 1}`,
            exterior: isOutdoor,
          };
          updateRooms([...rooms, room]);
          setRoomInProgress([]);
          showToast(isOutdoor ? 'Outdoor area created' : 'Room shape created');
        }
        return;
      }
    }
    setRoomInProgress(newVerts);
  };

  const handleSave = async () => {
    if (!layout || isSaving) return;
    setIsSaving(true);
    try {
      const fp = await getOrCreateLegacyFloorplan(restaurantId);
      const layoutToSave = customerViewportBounds
        ? { ...layout, customerViewportBounds }
        : layout;
      const synced = await syncV2LayoutToDatabase(restaurantId, layoutToSave);
      const layoutWithRooms = { ...synced, rooms, customerViewportBounds: customerViewportBounds || undefined } as any;
      await saveFloorplan(restaurantId, layoutWithRooms, 2, 'v2', fp.version === 1 ? fp.id : undefined);
      setLayout(synced.customerViewportBounds ? synced : { ...synced, customerViewportBounds: customerViewportBounds || undefined });
      setHasUnsaved(false);
      await loadAll();
      showToast('Layout published successfully');
    } catch (err) {
      showToast(`Failed to save: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRollback = async (fpId: string) => {
    if (!confirm('Revert to this version? Unsaved changes will be lost.')) return;
    try {
      await rollbackToFloorplan(fpId);
      await loadAll();
      setShowHistory(false);
      setHasUnsaved(false);
      showToast('Layout reverted');
    } catch { showToast('Failed to revert', 'error'); }
  };

  const handleAddArea = async () => {
    const name = prompt('Area name:');
    if (!name?.trim()) return;
    try {
      const area = await createArea(restaurantId, name.trim());
      const updated = await getAreas(restaurantId);
      setAreas(updated);
      setSelectedAreaId(area.id);
    } catch { showToast('Failed to create area', 'error'); }
  };

  const handleDeleteArea = async (id: string) => {
    if (areas.length <= 1) { showToast('Cannot delete the last area', 'error'); return; }
    const area = areas.find(a => a.id === id);
    if (!confirm(`Delete "${area?.name}"? All objects in this area will be removed.`)) return;
    try {
      await deleteArea(id);
      if (layout) updateLayout({ ...layout, objects: layout.objects.filter(o => o.areaId !== id) });
      const updated = await getAreas(restaurantId);
      setAreas(updated);
      if (selectedAreaId === id) setSelectedAreaId(updated[0]?.id || null);
    } catch { showToast('Failed to delete area', 'error'); }
  };

  const toolGroups: ToolGroup[] = [
    { label: 'Interact', icon: <MousePointer2 className="w-4 h-4" />, tools: [
      { id: 'select', icon: <MousePointer2 className="w-4 h-4" />, label: 'Select', shortcut: 'V' },
      { id: 'pan', icon: <Move className="w-4 h-4" />, label: 'Pan', shortcut: 'H' },
    ]},
    { label: 'Room', icon: <Home className="w-4 h-4" />, tools: [
      { id: 'draw_room', icon: <Pencil className="w-4 h-4" />, label: 'Draw Room', shortcut: 'R' },
    ]},
    { label: 'Tables', icon: <Circle className="w-4 h-4" />, tools: [
      { id: 'add_table_round', icon: <Circle className="w-4 h-4" />, label: 'Round Table' },
      { id: 'add_table_square', icon: <Square className="w-4 h-4" />, label: 'Square Table' },
      { id: 'add_table_rect', icon: <RectangleHorizontal className="w-4 h-4" />, label: 'Rectangle Table' },
      { id: 'add_booth', icon: <Armchair className="w-4 h-4" />, label: 'Booth' },
    ]},
    { label: 'Bar', icon: <Coffee className="w-4 h-4" />, tools: [
      { id: 'bar_counter', icon: <LayoutGrid className="w-4 h-4" />, label: 'Bar Counter' },
      { id: 'add_bar_stool', icon: <Circle className="w-4 h-4" />, label: 'Bar Stool' },
      { id: 'host_stand', icon: <Star className="w-4 h-4" />, label: 'Host Stand' },
    ]},
    { label: 'Structure', icon: <Building2 className="w-4 h-4" />, tools: [
      { id: 'wall', icon: <Minus className="w-4 h-4" />, label: 'Wall', shortcut: 'W' },
      { id: 'door', icon: <DoorOpen className="w-4 h-4" />, label: 'Door' },
      { id: 'window', icon: <SquareCode className="w-4 h-4" />, label: 'Window' },
      { id: 'stairs', icon: <ArrowUpDown className="w-4 h-4" />, label: 'Stairs' },
      { id: 'wc', icon: <Bath className="w-4 h-4" />, label: 'Restroom' },
      { id: 'kitchen', icon: <UtensilsCrossed className="w-4 h-4" />, label: 'Kitchen' },
    ]},
    { label: 'Decor', icon: <Trees className="w-4 h-4" />, tools: [
      { id: 'plant', icon: <Trees className="w-4 h-4" />, label: 'Plant / Divider' },
    ]},
    { label: 'Outdoor', icon: <Leaf className="w-4 h-4" />, tools: [
      { id: 'draw_outdoor', icon: <Leaf className="w-4 h-4" />, label: 'Draw Outdoor Area' },
    ]},
  ];

  const selectedObject = selectedObjectId ? layout?.objects.find(o => o.id === selectedObjectId) : null;
  const isTableObj = selectedObject?.type === 'table' || selectedObject?.type === 'booth';
  const tableCount = layout?.objects.filter(o => o.type === 'table' || o.type === 'booth').length || 0;
  const totalCovers = layout?.objects.filter(o => o.type === 'table' || o.type === 'booth').reduce((s, o) => s + (o.capacity || 0), 0) || 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-900">
        <div className="text-center">
          <div className="w-14 h-14 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-5" />
          <p className="text-slate-300 font-medium">Loading layout editor...</p>
        </div>
      </div>
    );
  }

  if (!layout) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-900">
        <p className="text-slate-300">Failed to load layout</p>
      </div>
    );
  }

  const LEFT_W = 224;
  const RIGHT_W = 256;

  return (
    <div className="flex h-full bg-slate-900 overflow-hidden relative select-none">
      {toast && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[999] px-5 py-3 rounded-xl shadow-2xl text-sm font-semibold flex items-center gap-2 ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'success' ? <Zap className="w-4 h-4" /> : <X className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Left toolbar — absolute overlay so canvas always fills full width */}
      <div
        style={{ width: LEFT_W, transform: leftPanelOpen ? 'translateX(0)' : `translateX(-${LEFT_W}px)` }}
        className="absolute top-0 left-0 h-full bg-slate-950 border-r border-slate-800 flex flex-col z-30 transition-transform duration-300 ease-in-out shadow-2xl"
      >
        <div className="px-4 py-4 border-b border-slate-800">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Floor Plan Editor</div>
          <div className="text-xs text-slate-400 flex gap-3">
            <span><span className="text-emerald-400 font-semibold">{tableCount}</span> tables</span>
            <span><span className="text-blue-400 font-semibold">{totalCovers}</span> covers</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {toolGroups.map(group => (
            <div key={group.label}>
              <button
                onClick={() => setExpandedGroups(prev => { const n = new Set(prev); if (n.has(group.label)) n.delete(group.label); else n.add(group.label); return n; })}
                className="w-full flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 uppercase tracking-wider"
              >
                {expandedGroups.has(group.label) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                {group.icon}{group.label}
              </button>
              {expandedGroups.has(group.label) && (
                <div className="px-3 pb-2 space-y-0.5">
                  {group.tools.map(tool => (
                    <button key={tool.id} onClick={() => { setActiveTool(tool.id); if (tool.id !== activeTool) { setWallStart(null); setRoomInProgress([]); } }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${activeTool === tool.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
                      <span className={activeTool === tool.id ? 'text-white' : 'text-slate-400'}>{tool.icon}</span>
                      <span className="flex-1 text-left">{tool.label}</span>
                      {tool.shortcut && <kbd className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${activeTool === tool.id ? 'bg-blue-500 text-blue-100' : 'bg-slate-700 text-slate-400'}`}>{tool.shortcut}</kbd>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-slate-800">
          <div className="text-[10px] text-slate-600 font-mono space-y-0.5">
            <div>Ctrl+Z Undo · Ctrl+Y Redo</div>
            <div>Del Delete · Ctrl+D Duplicate</div>
            <div>Arrows Move selection</div>
            <div className="text-slate-700 hidden sm:block">RMB drag to pan canvas</div>
            <div className="text-slate-700 sm:hidden">Select Pan to move the map</div>
          </div>
        </div>
      </div>

      {/* Canvas area — always full width */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top toolbar */}
        <div className="h-12 bg-slate-900 border-b border-slate-800 flex items-center px-2 gap-1.5 flex-shrink-0">
          <button onClick={() => setLeftPanelOpen(o => !o)} title={leftPanelOpen ? 'Hide toolbar' : 'Show toolbar'} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors flex-shrink-0">
            {leftPanelOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </button>
          <div className="h-5 w-px bg-slate-700 flex-shrink-0" />
          <button onClick={undo} disabled={histIdx <= 0} title="Undo (Ctrl+Z)" className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><Undo2 className="w-4 h-4" /></button>
          <button onClick={redo} disabled={histIdx >= history.length - 1} title="Redo (Ctrl+Y)" className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><Redo2 className="w-4 h-4" /></button>
          <div className="h-5 w-px bg-slate-700" />
          <button onClick={() => setGridSnapping(g => !g)} title={`Snap ${gridSnapping ? 'ON' : 'OFF'}`} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${gridSnapping ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}>
            <Grid3x3 className="w-3.5 h-3.5" /><span className="hidden sm:inline">Snap {gridSnapping ? 'ON' : 'OFF'}</span>
          </button>
          <button onClick={() => {
            const next = !showCustomerViewport;
            setShowCustomerViewport(next);
            if (next && !customerViewportBounds && layout) {
              setCustomerViewportBounds(computeContentBounds(layout.objects, rooms));
            }
          }} title="Preview the initial customer viewport" className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${showCustomerViewport ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}>
            <Eye className="w-3.5 h-3.5" /><span className="hidden sm:inline">Custom. view</span>
          </button>
          <button onClick={() => setShowCustomerPreview(true)} title="Full-screen customer preview" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all text-slate-500 hover:text-slate-300 hover:bg-slate-800">
            <Maximize2 className="w-3.5 h-3.5" /><span className="hidden sm:inline">Preview</span>
          </button>

          {wallStart && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/15 border border-amber-500/30 rounded-lg">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-xs text-amber-400 font-medium">Click to finish wall · Esc to cancel</span>
            </div>
          )}
          {(activeTool === 'draw_room' || activeTool === 'draw_outdoor') && (
            <div className={`flex items-center gap-2 px-3 py-1.5 border rounded-lg ${activeTool === 'draw_outdoor' ? 'bg-green-500/15 border-green-500/30' : 'bg-emerald-500/15 border-emerald-500/30'}`}>
              <div className={`w-2 h-2 rounded-full animate-pulse ${activeTool === 'draw_outdoor' ? 'bg-green-400' : 'bg-emerald-400'}`} />
              <span className={`text-xs font-medium ${activeTool === 'draw_outdoor' ? 'text-green-400' : 'text-emerald-400'}`}>
                {activeTool === 'draw_outdoor' ? 'Drawing outdoor area — ' : 'Drawing room — '}
                {roomInProgress.length === 0 ? 'Click to place first point' : roomInProgress.length < 3 ? `${roomInProgress.length} point(s) placed` : 'Click near first point to close'}
              </span>
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            {hasUnsaved && <span className="hidden sm:flex items-center gap-1.5 text-xs text-amber-400"><div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />Unsaved</span>}
            {allFloorplans.length > 1 && (
              <div className="relative">
                <button onClick={() => setShowHistory(h => !h)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
                  <Layers className="w-3.5 h-3.5" />History
                </button>
                {showHistory && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-700 text-sm font-semibold text-white">Version History</div>
                    <div className="max-h-60 overflow-y-auto divide-y divide-slate-700">
                      {allFloorplans.map(fp => (
                        <button key={fp.id} onClick={() => handleRollback(fp.id)} disabled={fp.is_active}
                          className={`w-full text-left px-4 py-3 text-sm hover:bg-slate-700 transition-colors ${fp.is_active ? 'bg-slate-700/50' : ''}`}>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-200">V{fp.version} ({fp.engine})</span>
                            {fp.is_active && <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">Active</span>}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">{new Date(fp.created_at).toLocaleString()}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            <button onClick={handleSave} disabled={isSaving || !hasUnsaved}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${hasUnsaved && !isSaving ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/30' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}>
              <Save className="w-4 h-4" /><span className="hidden sm:inline">{isSaving ? 'Publishing...' : 'Publish'}</span>
            </button>
            <div className="h-5 w-px bg-slate-700 flex-shrink-0" />
            <button onClick={() => setRightPanelOpen(o => !o)} title={rightPanelOpen ? 'Hide properties' : 'Show properties'} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors flex-shrink-0">
              {rightPanelOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div ref={canvasContainerRef} className="flex-1 relative overflow-hidden">
          <PremiumFloorplanCanvas
            layout={layout} rooms={rooms} renderMode="editor" activeTool={activeTool}
            selectedObjectId={selectedObjectId} selectedRoomId={selectedRoomId}
            selectedAreaId={selectedAreaId}
            gridSnapping={gridSnapping} gridSize={GRID_SIZE}
            wallStartPoint={wallStart} roomInProgress={roomInProgress}
            showCustomerViewport={showCustomerViewport}
            customerViewportSize={customerViewportSize}
            customerViewportBounds={customerViewportBounds}
            onCustomerViewportBoundsChange={b => { setCustomerViewportBounds(b); setHasUnsaved(true); }}
            canvasRef={canvasHandle}
            editingChairsObjectId={editingChairsObjectId}
            onObjectSelect={id => { setSelectedObjectId(id); if (id) setSelectedRoomId(null); if (id !== editingChairsObjectId) setEditingChairsObjectId(null); }}
            onRoomSelect={id => { setSelectedRoomId(id); if (id) { setSelectedObjectId(null); setEditingChairsObjectId(null); } }}
            onObjectMove={handleObjectMove}
            onObjectUpdate={handleObjectUpdate}
            onRoomVertexMove={handleRoomVertexMove}
            onCameraChange={cam => layout && setLayout({ ...layout, camera: cam })}
            onCanvasClick={handleCanvasClick} onRoomVertexClick={handleRoomVertexClick}
            onChairsUpdate={handleChairsUpdate}
          />

          {/* Mobile-only Pan/Select toggle — bottom-left, hidden on desktop */}
          <div className="absolute bottom-4 left-4 sm:hidden z-20 flex items-center gap-1 bg-slate-900/95 backdrop-blur-sm border border-slate-700/80 rounded-xl shadow-xl p-1">
            <button
              onClick={() => setActiveTool('select')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${activeTool === 'select' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
            >
              <MousePointer2 className="w-4 h-4" />
              <span>Select</span>
            </button>
            <button
              onClick={() => setActiveTool('pan')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${activeTool === 'pan' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
            >
              <Move className="w-4 h-4" />
              <span>Pan</span>
            </button>
          </div>

          {/* Zoom controls + help */}
          <div className="absolute bottom-4 right-4 flex flex-col gap-1.5 z-10">
            <div className="flex flex-col bg-slate-900/90 backdrop-blur-sm border border-slate-700/80 rounded-lg overflow-hidden shadow-lg">
              <button onClick={() => canvasHandle.current?.zoomIn()} title="Zoom in" className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700/80 transition-colors border-b border-slate-700/60">
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => canvasHandle.current?.zoomOut()} title="Zoom out" className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700/80 transition-colors border-b border-slate-700/60">
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => canvasHandle.current?.reCenter()} title="Fit to screen" className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700/80 transition-colors">
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="relative">
              <button
                onClick={() => setShowHelp(h => !h)}
                title="Keyboard shortcuts"
                className={`w-8 h-8 flex items-center justify-center rounded-lg border shadow-lg transition-colors backdrop-blur-sm ${showHelp ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-900/90 border-slate-700/80 text-slate-400 hover:text-white hover:bg-slate-700/80'}`}
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </button>
              {showHelp && (
                <div className="absolute bottom-10 right-0 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-4 w-52 text-xs text-slate-300 space-y-2.5">
                  <p className="text-slate-400 font-semibold text-[10px] uppercase tracking-wider mb-1">Shortcuts</p>
                  {[
                    ['Scroll', 'Zoom in / out'],
                    ['H + drag', 'Pan canvas'],
                    ['Del / Backspace', 'Remove selected'],
                    ['Ctrl+Z', 'Undo'],
                    ['Ctrl+Y', 'Redo'],
                    ['Ctrl+D', 'Duplicate'],
                    ['V', 'Select tool'],
                    ['Arrows', 'Move selected'],
                  ].map(([key, desc]) => (
                    <div key={key} className="flex items-center justify-between gap-2">
                      <span className="text-slate-500">{desc}</span>
                      <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-600 rounded text-[10px] text-slate-300 font-mono whitespace-nowrap">{key}</kbd>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* Left panel persistent toggle handle */}
          <button
            onClick={() => setLeftPanelOpen(o => !o)}
            aria-label={leftPanelOpen ? 'Close left panel' : 'Open left panel'}
            style={{
              left: leftPanelOpen ? LEFT_W - 12 : 0,
              transition: 'left 300ms ease-in-out',
            }}
            className="absolute top-1/2 -translate-y-1/2 w-6 h-14 bg-slate-800 border border-slate-700 border-l-0 rounded-r-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors z-40"
          >
            <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-300 ${leftPanelOpen ? 'rotate-180' : ''}`} />
          </button>
          {/* Right panel persistent toggle handle */}
          <button
            onClick={() => setRightPanelOpen(o => !o)}
            aria-label={rightPanelOpen ? 'Close right panel' : 'Open right panel'}
            style={{
              right: rightPanelOpen ? RIGHT_W - 12 : 0,
              transition: 'right 300ms ease-in-out',
            }}
            className="absolute top-1/2 -translate-y-1/2 w-6 h-14 bg-slate-800 border border-slate-700 border-r-0 rounded-l-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors z-40"
          >
            <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-300 ${rightPanelOpen ? '' : 'rotate-180'}`} />
          </button>
        </div>
      </div>

      {/* Right panel — absolute overlay */}
      <div
        style={{ width: RIGHT_W, transform: rightPanelOpen ? 'translateX(0)' : `translateX(${RIGHT_W}px)` }}
        className="absolute top-0 right-0 h-full bg-slate-950 border-l border-slate-800 flex flex-col z-30 transition-transform duration-300 ease-in-out shadow-2xl"
      >
        <div className="flex border-b border-slate-800 flex-shrink-0">
          {(['properties', 'areas', 'rooms'] as const).map(tab => (
            <button key={tab} onClick={() => setRightPanelTab(tab)}
              className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider transition-colors ${rightPanelTab === tab ? 'text-white border-b-2 border-blue-500' : 'text-slate-500 hover:text-slate-300'}`}>
              {tab}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          {rightPanelTab === 'properties' && (
            <div className="p-4">
              {!selectedObject && selectedRoomId ? (() => {
                const selRoom = rooms.find(r => r.id === selectedRoomId);
                if (!selRoom) return null;
                const isExterior = selRoom.exterior || ['gravel','grass','car_park','decking','paving'].includes(selRoom.floorStyle);
                return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white">{isExterior ? 'Outdoor Area' : 'Room Shape'}</p>
                        <p className="text-xs text-slate-500">{selRoom.vertices.length} vertices — drag to reshape</p>
                      </div>
                      <button onClick={() => { if (confirm('Delete this room?')) { updateRooms(rooms.filter(r => r.id !== selectedRoomId)); setSelectedRoomId(null); } }} className="p-2 rounded-lg text-red-400 hover:bg-red-500/15 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1.5">Name</label>
                      <input value={selRoom.name || ''} onChange={e => updateRooms(rooms.map(r => r.id === selectedRoomId ? { ...r, name: e.target.value } : r))}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" placeholder="Room name" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1.5">{isExterior ? 'Surface Material' : 'Floor Material'}</label>
                      <select value={selRoom.floorStyle} onChange={e => updateRooms(rooms.map(r => r.id === selectedRoomId ? { ...r, floorStyle: e.target.value as RoomPolygon['floorStyle'] } : r))}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                        {isExterior ? <>
                          <option value="gravel">Gravel</option>
                          <option value="grass">Grass / Lawn</option>
                          <option value="car_park">Car Park</option>
                          <option value="decking">Timber Decking</option>
                          <option value="paving">Paving Slabs</option>
                          <option value="concrete">Concrete</option>
                        </> : <>
                          <option value="solid_wood">Solid Wood</option>
                          <option value="wood">Hardwood</option>
                          <option value="herringbone">Herringbone Parquet</option>
                          <option value="tile">Tile</option>
                          <option value="carpet">Carpet</option>
                          <option value="concrete">Polished Concrete</option>
                        </>}
                      </select>
                    </div>
                    <p className="text-xs text-slate-600 pt-1">Drag the white vertex handles on the canvas to reshape this room. Press Del to delete.</p>
                  </div>
                );
              })() : !selectedObject ? (
                <div className="text-center py-10 text-slate-500">
                  <Settings className="w-8 h-8 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Select an object or room to edit properties</p>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white capitalize">{selectedObject.type.replace(/_/g, ' ')}</p>
                      <p className="text-xs text-slate-500 font-mono">{selectedObject.id.split('_')[0]}</p>
                    </div>
                    <button onClick={deleteSelected} className="p-2 rounded-lg text-red-400 hover:bg-red-500/15 transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </div>

                  {isTableObj && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1.5">Table Name</label>
                        <input value={selectedObject.name || ''} onChange={e => handleObjectUpdate(selectedObject.id, { name: e.target.value })}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" placeholder="e.g. T1" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1.5">Capacity</label>
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleObjectUpdate(selectedObject.id, { capacity: Math.max(1, (selectedObject.capacity || 2) - 1) })} className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 flex items-center justify-center font-bold transition-colors">-</button>
                          <div className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-center text-white font-semibold text-sm">{selectedObject.capacity || 2}</div>
                          <button onClick={() => handleObjectUpdate(selectedObject.id, { capacity: Math.min(20, (selectedObject.capacity || 2) + 1) })} className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 flex items-center justify-center font-bold transition-colors">+</button>
                        </div>
                      </div>
                      {selectedObject.type === 'table' && (
                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1.5">Shape</label>
                          <div className="grid grid-cols-3 gap-2">
                            {[{ s: 'circle' as const, icon: <Circle className="w-5 h-5" />, label: 'Round' }, { s: 'square' as const, icon: <Square className="w-5 h-5" />, label: 'Square' }, { s: 'rectangle' as const, icon: <RectangleHorizontal className="w-5 h-5" />, label: 'Rect' }].map(({ s, icon, label }) => (
                              <button key={s} onClick={() => handleObjectUpdate(selectedObject.id, { shape: s })}
                                className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-lg border-2 transition-all text-xs ${(selectedObject.shape === s || (!selectedObject.shape && s === 'circle')) ? 'border-blue-500 bg-blue-600/20 text-blue-300' : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-300'}`}>
                                {icon}{label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="space-y-2">
                        <label className="block text-xs font-medium text-slate-400">Attributes</label>
                        <label className="flex items-center gap-3 cursor-pointer group">
                          <div className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${selectedObject.properties?.reservable ? 'bg-blue-600' : 'bg-slate-700'}`}
                            onClick={() => handleObjectUpdate(selectedObject.id, { properties: { ...selectedObject.properties, reservable: !selectedObject.properties?.reservable } })}>
                            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${selectedObject.properties?.reservable ? 'left-4' : 'left-0.5'}`} />
                          </div>
                          <span className="text-sm text-slate-300 group-hover:text-white">Reservable</span>
                        </label>
                        <label className="flex items-start gap-3 cursor-pointer group">
                          <div className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer flex-shrink-0 mt-0.5 ${selectedObject.properties?.joinable ? 'bg-blue-600' : 'bg-slate-700'}`}
                            onClick={async () => {
                              const newVal = !selectedObject.properties?.joinable;
                              if (!newVal) {
                                const tableId = selectedObject.properties?.tableId as string | undefined;
                                if (tableId) {
                                  const names = await getActiveCombinationNamesForTable(tableId);
                                  setJoinableWarning(names);
                                }
                              } else {
                                setJoinableWarning([]);
                              }
                              handleObjectUpdate(selectedObject.id, { properties: { ...selectedObject.properties, joinable: newVal } });
                            }}>
                            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${selectedObject.properties?.joinable ? 'left-4' : 'left-0.5'}`} />
                          </div>
                          <div>
                            <span className="text-sm text-slate-300 group-hover:text-white">Can be joined</span>
                            <p className="text-xs text-slate-500 mt-0.5">Allow this table to be used in approved joined-table combinations for larger parties.</p>
                          </div>
                        </label>
                        {joinableWarning.length > 0 && (
                          <div className="ml-12 bg-amber-900/30 border border-amber-600/40 rounded-lg px-3 py-2">
                            <p className="text-xs text-amber-300 leading-relaxed">
                              This table is used in: <strong>{joinableWarning.join(', ')}</strong>. Disabling this and saving will stop those combinations being offered for new bookings.
                            </p>
                          </div>
                        )}
                        <label className="flex items-center gap-3 cursor-pointer group">
                          <div
                            className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${selectedObject.properties?.windowSeat ? 'bg-sky-600' : 'bg-slate-700'}`}
                            onClick={() => handleObjectUpdate(selectedObject.id, { properties: { ...selectedObject.properties, windowSeat: !selectedObject.properties?.windowSeat } })}
                          >
                            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${selectedObject.properties?.windowSeat ? 'left-4' : 'left-0.5'}`} />
                          </div>
                          <span className="text-sm text-slate-300 group-hover:text-white">Window seat</span>
                        </label>
                      </div>
                      {selectedObject.properties?.windowSeat && (
                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1.5">View description</label>
                          <div className="relative">
                            <input
                              type="text"
                              value={(selectedObject.properties?.viewDescription as string) || ''}
                              onChange={e => handleObjectUpdate(selectedObject.id, { properties: { ...selectedObject.properties, viewDescription: e.target.value } })}
                              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500 pr-8"
                              placeholder="e.g. High Street View"
                              list="view-description-presets"
                            />
                            <datalist id="view-description-presets">
                              <option value="High Street View" />
                              <option value="Courtyard View" />
                              <option value="Quiet Side Street View" />
                              <option value="Waterfront View" />
                              <option value="Garden View" />
                              <option value="River View" />
                            </datalist>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">Shown to guests when they hover this table</p>
                        </div>
                      )}
                    </>
                  )}

                  {isTableObj && (
                    <div className="pt-3 border-t border-slate-800">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-medium text-slate-400">Chairs</label>
                        <button
                          onClick={() => setEditingChairsObjectId(prev => prev === selectedObject.id ? null : selectedObject.id)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${editingChairsObjectId === selectedObject.id ? 'bg-amber-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white'}`}
                        >
                          {editingChairsObjectId === selectedObject.id ? 'Done Editing' : 'Edit Chairs'}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => {
                            const chairs = generateDefaultChairs(selectedObject);
                            handleChairsUpdate(selectedObject.id, chairs);
                            setEditingChairsObjectId(selectedObject.id);
                          }}
                          className="px-2 py-1.5 rounded-lg text-xs bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                        >
                          Auto Layout
                        </button>
                        <button
                          onClick={() => {
                            handleChairsUpdate(selectedObject.id, []);
                          }}
                          className="px-2 py-1.5 rounded-lg text-xs bg-slate-800 border border-slate-700 text-slate-300 hover:bg-red-900/40 hover:text-red-300 hover:border-red-700/50 transition-colors"
                        >
                          Remove All
                        </button>
                        <button
                          onClick={() => {
                            const current = getEffectiveChairs(selectedObject);
                            const newChair = addDefaultChair(selectedObject);
                            handleChairsUpdate(selectedObject.id, [...current, newChair]);
                            setEditingChairsObjectId(selectedObject.id);
                          }}
                          className="px-2 py-1.5 rounded-lg text-xs bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                        >
                          Add Chair
                        </button>
                        <button
                          onClick={() => {
                            const current = getEffectiveChairs(selectedObject);
                            if (current.length > 0) {
                              handleChairsUpdate(selectedObject.id, current.slice(0, -1));
                            }
                          }}
                          className="px-2 py-1.5 rounded-lg text-xs bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                        >
                          Remove Last
                        </button>
                      </div>

                      {/* Chair size presets & match sizing */}
                      {editingChairsObjectId === selectedObject.id && (() => {
                        const currentChairs = getEffectiveChairs(selectedObject);
                        return (
                          <div className="mt-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-slate-500">{currentChairs.length} chair{currentChairs.length !== 1 ? 's' : ''}</span>
                              {currentChairs.length > 1 && (
                                <button
                                  onClick={() => {
                                    if (currentChairs.length < 2) return;
                                    const avgW = Math.round(currentChairs.reduce((s, c) => s + c.width, 0) / currentChairs.length);
                                    const avgH = Math.round(currentChairs.reduce((s, c) => s + c.height, 0) / currentChairs.length);
                                    const matched = currentChairs.map(c => ({ ...c, width: avgW, height: avgH }));
                                    handleChairsUpdate(selectedObject.id, matched);
                                  }}
                                  className="px-2 py-1 rounded text-xs bg-blue-600/20 border border-blue-500/30 text-blue-300 hover:bg-blue-600/30 transition-colors"
                                >
                                  Match All Sizes
                                </button>
                              )}
                            </div>

                            {/* Size presets */}
                            <div>
                              <span className="text-xs text-slate-500 block mb-1">Chair size preset</span>
                              <div className="flex gap-1.5">
                                {([
                                  { label: 'S', w: 14, h: 8 },
                                  { label: 'M', w: 20, h: 10 },
                                  { label: 'L', w: 28, h: 12 },
                                  { label: 'XL', w: 34, h: 14 },
                                ] as const).map(preset => (
                                  <button
                                    key={preset.label}
                                    onClick={() => {
                                      const resized = currentChairs.map(c => ({ ...c, width: preset.w, height: preset.h }));
                                      handleChairsUpdate(selectedObject.id, resized);
                                    }}
                                    className="flex-1 px-1.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white hover:border-slate-500 transition-colors text-center"
                                  >
                                    {preset.label}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <p className="text-xs text-amber-400/80">Drag chairs to reposition. They snap to table edges and center lines.</p>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1.5">Width</label>
                      <input type="number" value={Math.round(selectedObject.width)} onChange={e => handleObjectUpdate(selectedObject.id, { width: Math.max(10, parseInt(e.target.value) || 10) })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1.5">{selectedObject.type === 'door' || selectedObject.type === 'window' ? 'Thickness' : 'Height'}</label>
                      <input type="number" value={Math.round(selectedObject.height)} onChange={e => { const minH = (selectedObject.type === 'door' || selectedObject.type === 'window') ? 6 : 10; handleObjectUpdate(selectedObject.id, { height: Math.max(minH, parseInt(e.target.value) || minH) }); }} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Rotation</label>
                    <div className="flex items-center gap-2 mb-2">
                      <input type="number" value={Math.round(selectedObject.rotation)} onChange={e => handleObjectUpdate(selectedObject.id, { rotation: parseInt(e.target.value) || 0 })} className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                      <span className="text-slate-500 text-sm">°</span>
                      <button onClick={() => handleObjectUpdate(selectedObject.id, { rotation: ((Math.round(selectedObject.rotation) || 0) + 45) % 360 })} className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition-colors"><RotateCw className="w-4 h-4" /></button>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[0, 45, 90, 180].map(angle => (
                        <button key={angle} onClick={() => handleObjectUpdate(selectedObject.id, { rotation: angle })}
                          className={`py-1.5 text-xs rounded-lg font-medium transition-colors ${Math.round(selectedObject.rotation) === angle ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white border border-slate-700'}`}>
                          {angle}°
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${selectedObject.locked ? 'bg-amber-600' : 'bg-slate-700'}`}
                        onClick={() => handleObjectUpdate(selectedObject.id, { locked: !selectedObject.locked })}>
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${selectedObject.locked ? 'left-4' : 'left-0.5'}`} />
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-slate-300 group-hover:text-white">
                        {selectedObject.locked ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Unlock className="w-3.5 h-3.5" />}
                        {selectedObject.locked ? 'Locked' : 'Lock position'}
                      </div>
                    </label>
                  </div>

                  <div className="pt-2 flex gap-2">
                    <button onClick={duplicateSelected} className="flex-1 py-2 text-sm text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors font-medium">Duplicate</button>
                    <button onClick={deleteSelected} className="flex-1 py-2 text-sm text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 rounded-lg border border-red-500/30 transition-colors font-medium">Delete</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {rightPanelTab === 'areas' && (
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Areas</p>
                <button onClick={handleAddArea} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors font-medium"><Plus className="w-3.5 h-3.5" /> Add</button>
              </div>
              {areas.map(area => (
                <div key={area.id} onClick={() => setSelectedAreaId(area.id)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${selectedAreaId === area.id ? 'border-blue-500 bg-blue-600/15 text-white' : 'border-slate-700 text-slate-300 hover:border-slate-600'}`}>
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${selectedAreaId === area.id ? 'bg-blue-400' : 'bg-slate-600'}`} />
                  <span className="text-sm flex-1 font-medium">{area.name}</span>
                  <span className="text-xs text-slate-500">{layout?.objects.filter(o => o.areaId === area.id).length || 0}</span>
                  {areas.length > 1 && <button onClick={e => { e.stopPropagation(); handleDeleteArea(area.id); }} className="text-slate-600 hover:text-red-400 transition-colors"><X className="w-3.5 h-3.5" /></button>}
                </div>
              ))}
              <p className="text-xs text-slate-600 mt-2">Objects are placed in the active area. Use areas to group sections (Main, Bar, Patio).</p>
            </div>
          )}

          {rightPanelTab === 'rooms' && (
            <div className="p-4 space-y-3">
              {/* Interior Rooms — collapsible */}
              <div>
                <button
                  onClick={() => setInteriorRoomsOpen(o => !o)}
                  className="w-full flex items-center justify-between py-1.5 mb-1 group"
                >
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest group-hover:text-slate-300 transition-colors flex items-center gap-2">
                    <Home className="w-3.5 h-3.5" />
                    Interior Rooms
                    {rooms.filter(r => !r.exterior).length > 0 && (
                      <span className="text-[10px] text-slate-600 font-normal normal-case tracking-normal">({rooms.filter(r => !r.exterior).length})</span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={e => { e.stopPropagation(); setActiveTool('draw_room'); setRightPanelTab('properties'); }}
                      className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors font-medium flex items-center gap-0.5"
                    >
                      <Plus className="w-3 h-3" /> Draw
                    </button>
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-150 ${interiorRoomsOpen ? 'rotate-0' : '-rotate-90'}`} />
                  </div>
                </button>
                {interiorRoomsOpen && (
                  <div className="space-y-2">
                    {rooms.filter(r => !r.exterior).length === 0 && (
                      <div className="text-center py-4 text-slate-600 bg-slate-800/40 rounded-lg border border-slate-800">
                        <p className="text-xs">No interior rooms yet</p>
                      </div>
                    )}
                    {rooms.filter(r => !r.exterior).map(room => {
                      const isActive = selectedRoomId === room.id;
                      return (
                        <div key={room.id}
                          onClick={() => setSelectedRoomId(room.id)}
                          className={`rounded-lg overflow-hidden border cursor-pointer transition-all ${isActive ? 'border-blue-500/60 bg-blue-950/30' : 'border-slate-800 bg-slate-800/50 hover:border-slate-700'}`}
                        >
                          <div className={`flex items-center gap-0 ${isActive ? 'border-l-2 border-l-blue-500' : 'border-l-2 border-l-transparent'}`}>
                            <div className="flex-1 p-2.5 space-y-2.5">
                              <div className="flex items-center gap-2">
                                <input value={room.name || ''} onClick={e => e.stopPropagation()} onChange={e => updateRooms(rooms.map(r => r.id === room.id ? { ...r, name: e.target.value } : r))}
                                  className="flex-1 bg-slate-700/70 border border-slate-600/60 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500 focus:bg-slate-700" placeholder="Room name" />
                                <button onClick={e => { e.stopPropagation(); if (confirm('Delete this room?')) updateRooms(rooms.filter(r => r.id !== room.id)); }} className="text-slate-600 hover:text-red-400 transition-colors flex-shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                              </div>
                              <select value={room.floorStyle} onClick={e => e.stopPropagation()} onChange={e => updateRooms(rooms.map(r => r.id === room.id ? { ...r, floorStyle: e.target.value as RoomPolygon['floorStyle'] } : r))}
                                className="w-full bg-slate-700/70 border border-slate-600/60 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500">
                                <option value="solid_wood">Solid Wood</option>
                                <option value="wood">Hardwood</option>
                                <option value="herringbone">Herringbone Parquet</option>
                                <option value="tile">Tile</option>
                                <option value="carpet">Carpet</option>
                                <option value="concrete">Polished Concrete</option>
                              </select>
                              <p className="text-[10px] text-slate-600">{room.vertices.length} pts</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Outdoor Areas — collapsible */}
              <div className="pt-2 border-t border-slate-800/80">
                <button
                  onClick={() => setOutdoorAreasOpen(o => !o)}
                  className="w-full flex items-center justify-between py-1.5 mb-1 group"
                >
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest group-hover:text-slate-300 transition-colors flex items-center gap-2">
                    <Leaf className="w-3.5 h-3.5 text-green-600" />
                    Outdoor Areas
                    {rooms.filter(r => r.exterior).length > 0 && (
                      <span className="text-[10px] text-slate-600 font-normal normal-case tracking-normal">({rooms.filter(r => r.exterior).length})</span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={e => { e.stopPropagation(); setActiveTool('draw_outdoor'); setRightPanelTab('properties'); }}
                      className="text-[11px] text-green-400 hover:text-green-300 transition-colors font-medium flex items-center gap-0.5"
                    >
                      <Plus className="w-3 h-3" /> Draw
                    </button>
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-150 ${outdoorAreasOpen ? 'rotate-0' : '-rotate-90'}`} />
                  </div>
                </button>
                {outdoorAreasOpen && (
                  <div className="space-y-2">
                    {rooms.filter(r => r.exterior).length === 0 && (
                      <div className="text-center py-4 text-slate-600 bg-slate-800/40 rounded-lg border border-slate-800">
                        <p className="text-xs">No outdoor areas yet</p>
                      </div>
                    )}
                    {rooms.filter(r => r.exterior).map(room => {
                      const isActive = selectedRoomId === room.id;
                      return (
                        <div key={room.id}
                          onClick={() => setSelectedRoomId(room.id)}
                          className={`rounded-lg overflow-hidden border cursor-pointer transition-all ${isActive ? 'border-green-700/50 bg-green-950/20' : 'border-slate-800 bg-slate-800/50 hover:border-slate-700'}`}
                        >
                          <div className={`flex items-center gap-0 ${isActive ? 'border-l-2 border-l-green-500' : 'border-l-2 border-l-transparent'}`}>
                            <div className="flex-1 p-2.5 space-y-2.5">
                              <div className="flex items-center gap-2">
                                <input value={room.name || ''} onClick={e => e.stopPropagation()} onChange={e => updateRooms(rooms.map(r => r.id === room.id ? { ...r, name: e.target.value } : r))}
                                  className="flex-1 bg-slate-700/70 border border-slate-600/60 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-green-500 focus:bg-slate-700" placeholder="Area name" />
                                <button onClick={e => { e.stopPropagation(); if (confirm('Delete this area?')) updateRooms(rooms.filter(r => r.id !== room.id)); }} className="text-slate-600 hover:text-red-400 transition-colors flex-shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                              </div>
                              <select value={room.floorStyle} onClick={e => e.stopPropagation()} onChange={e => updateRooms(rooms.map(r => r.id === room.id ? { ...r, floorStyle: e.target.value as RoomPolygon['floorStyle'] } : r))}
                                className="w-full bg-slate-700/70 border border-slate-600/60 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-green-500">
                                <option value="gravel">Gravel</option>
                                <option value="grass">Grass / Lawn</option>
                                <option value="car_park">Car Park</option>
                                <option value="decking">Timber Decking</option>
                                <option value="paving">Paving Slabs</option>
                                <option value="concrete">Concrete</option>
                              </select>
                              <p className="text-[10px] text-slate-600">{room.vertices.length} pts</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {showCustomerPreview && layout && (
        <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800 flex-shrink-0">
            <span className="text-sm font-semibold text-white">Customer Preview</span>
            <span className="text-xs text-slate-400 ml-2">All tables shown as available</span>
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => setPreviewViewMode(v => v === '2d' ? '3d' : '2d')}
                className="flex items-center gap-1.5 h-7 px-3 rounded-full transition-all text-xs font-semibold select-none"
                style={{
                  background: previewViewMode === '3d' ? 'rgba(212,175,55,0.18)' : 'rgba(255,255,255,0.06)',
                  border: previewViewMode === '3d' ? '1px solid rgba(212,175,55,0.45)' : '1px solid rgba(255,255,255,0.12)',
                  color: previewViewMode === '3d' ? 'rgba(212,175,55,0.95)' : 'rgba(255,255,255,0.65)',
                }}
              >
                {previewViewMode === '2d' ? '3D' : '2D'}
              </button>
              <button
                onClick={() => setShowCustomerPreview(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 relative overflow-hidden">
            {previewViewMode === '2d' ? (
              <PremiumFloorplanCanvas
                layout={layout}
                rooms={rooms}
                renderMode="customer"
                fitToContentOnLoad
                selectedAreaId={selectedAreaId}
                customerViewportBounds={customerViewportBounds}
                tableStatusMap={Object.fromEntries(
                  layout.objects
                    .filter(o => (o.type === 'table' || o.type === 'booth') && o.properties?.tableId)
                    .map(o => [o.properties!.tableId as string, 'green' as const])
                )}
              />
            ) : (
              <IsometricFloorplanCanvas
                layout={layout}
                rooms={rooms}
                selectedAreaId={selectedAreaId}
                tableStatusMap={Object.fromEntries(
                  layout.objects
                    .filter(o => (o.type === 'table' || o.type === 'booth') && o.properties?.tableId)
                    .map(o => [o.properties!.tableId as string, 'green' as const])
                )}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
