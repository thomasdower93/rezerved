import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StaffLayout, StaffTab } from '../components/StaffLayout';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { TableMarker } from '../components/TableMarker';
import { ToolPalette, Tool } from '../components/ToolPalette';
import { MobileToolbar } from '../components/MobileToolbar';
import { StructuralElements } from '../components/StructuralElements';
import { useMobile } from '../hooks/useMobile';
import { useAuth } from '../contexts/AuthContext';
import { getTablesByArea, createTable, saveTableLayout, deleteTable } from '../services/tables';
import { getAreas, createArea, deleteArea, getStructuralElements, createStructuralElement, deleteStructuralElement, updateStructuralElement } from '../services/areas';
import { getRestaurant } from '../services/restaurants';
import { Table, Restaurant, Area, StructuralElement, Wall, DoorWindowWC } from '../lib/types';
import { Trash2, Info, RotateCcw, Save, RotateCw, Plus, X, Maximize2 } from 'lucide-react';
import {
  calculateContentBounds,
  calculateStaffViewportLayout,
  clampPanOffset,
  ViewportLayout,
} from '../lib/mapLayout';

interface RotationHandleProps {
  onRotateStart: (e: React.MouseEvent | React.TouchEvent) => void;
}

function RotationHandle({ onRotateStart, isMobile }: RotationHandleProps & { isMobile?: boolean }) {
  const size = isMobile ? 'w-9 h-9' : 'w-8 h-8';
  const iconSize = isMobile ? 'w-4 h-4' : 'w-4 h-4';
  return (
    <div
      className={`absolute ${size} bg-green-500 border-2 border-white rounded-full cursor-pointer hover:bg-green-600 z-30 flex items-center justify-center`}
      style={{ top: isMobile ? '-42px' : '-40px', left: '50%', transform: 'translateX(-50%)', pointerEvents: 'auto' }}
      onMouseDown={(e) => {
        e.stopPropagation();
        onRotateStart(e);
      }}
      onTouchStart={(e) => {
        e.stopPropagation();
        onRotateStart(e);
      }}
      title="Rotate table"
    >
      <RotateCw className={`${iconSize} text-white`} />
    </div>
  );
}

interface ResizeHandlesProps {
  shape: 'circle' | 'square' | 'rectangle';
  scaleX: number;
  scaleY: number;
  onResizeStart: (handle: string, e: React.MouseEvent | React.TouchEvent) => void;
}

function ResizeHandles({ shape, scaleX, scaleY, onResizeStart, isMobile }: ResizeHandlesProps & { isMobile?: boolean }) {
  const handleSize = isMobile ? 'w-5 h-5' : 'w-3 h-3';
  const handleOffset = isMobile ? '-10px' : '-6px';
  const handleStyle = `absolute ${handleSize} bg-blue-500 border-2 border-white rounded-full cursor-pointer hover:bg-blue-600 z-20`;

  const handleStart = (handle: string) => (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    onResizeStart(handle, e);
  };

  if (shape === 'circle' || shape === 'square') {
    return (
      <>
        <div className={handleStyle} style={{ top: handleOffset, left: '50%', transform: 'translateX(-50%)', cursor: 'n-resize', pointerEvents: 'auto' }} onMouseDown={handleStart('n')} onTouchStart={handleStart('n')} />
        <div className={handleStyle} style={{ bottom: handleOffset, left: '50%', transform: 'translateX(-50%)', cursor: 's-resize', pointerEvents: 'auto' }} onMouseDown={handleStart('s')} onTouchStart={handleStart('s')} />
        <div className={handleStyle} style={{ top: '50%', left: handleOffset, transform: 'translateY(-50%)', cursor: 'w-resize', pointerEvents: 'auto' }} onMouseDown={handleStart('w')} onTouchStart={handleStart('w')} />
        <div className={handleStyle} style={{ top: '50%', right: handleOffset, transform: 'translateY(-50%)', cursor: 'e-resize', pointerEvents: 'auto' }} onMouseDown={handleStart('e')} onTouchStart={handleStart('e')} />
      </>
    );
  } else {
    return (
      <>
        <div className={handleStyle} style={{ top: handleOffset, left: '50%', transform: 'translateX(-50%)', cursor: 'n-resize', pointerEvents: 'auto' }} onMouseDown={handleStart('n')} onTouchStart={handleStart('n')} />
        <div className={handleStyle} style={{ bottom: handleOffset, left: '50%', transform: 'translateX(-50%)', cursor: 's-resize', pointerEvents: 'auto' }} onMouseDown={handleStart('s')} onTouchStart={handleStart('s')} />
        <div className={handleStyle} style={{ top: '50%', left: handleOffset, transform: 'translateY(-50%)', cursor: 'w-resize', pointerEvents: 'auto' }} onMouseDown={handleStart('w')} onTouchStart={handleStart('w')} />
        <div className={handleStyle} style={{ top: '50%', right: handleOffset, transform: 'translateY(-50%)', cursor: 'e-resize', pointerEvents: 'auto' }} onMouseDown={handleStart('e')} onTouchStart={handleStart('e')} />
        <div className={handleStyle} style={{ top: handleOffset, left: handleOffset, cursor: 'nw-resize', pointerEvents: 'auto' }} onMouseDown={handleStart('nw')} onTouchStart={handleStart('nw')} />
        <div className={handleStyle} style={{ top: handleOffset, right: handleOffset, cursor: 'ne-resize', pointerEvents: 'auto' }} onMouseDown={handleStart('ne')} onTouchStart={handleStart('ne')} />
        <div className={handleStyle} style={{ bottom: handleOffset, left: handleOffset, cursor: 'sw-resize', pointerEvents: 'auto' }} onMouseDown={handleStart('sw')} onTouchStart={handleStart('sw')} />
        <div className={handleStyle} style={{ bottom: handleOffset, right: handleOffset, cursor: 'se-resize', pointerEvents: 'auto' }} onMouseDown={handleStart('se')} onTouchStart={handleStart('se')} />
      </>
    );
  }
}

interface TableEditorProps {
  activeTab: StaffTab;
  onNavigate: (tab: StaffTab) => void;
  onLogout: () => void;
}

export function TableEditor({ activeTab, onNavigate, onLogout }: TableEditorProps) {
  const { user, isAdmin } = useAuth();
  const [areas, setAreas] = useState<Area[]>([]);
  const [activeAreaId, setActiveAreaId] = useState<string | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [structuralElements, setStructuralElements] = useState<StructuralElement[]>([]);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [dragging, setDragging] = useState<{ tableId: string; startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);
  const [draggingElement, setDraggingElement] = useState<{ elementId: string; startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [resizing, setResizing] = useState<{ tableId: string; handle: string; startX: number; startY: number; startScaleX: number; startScaleY: number } | null>(null);
  const [rotating, setRotating] = useState<{ tableId: string; startAngle: number; startRotation: number; centerX: number; centerY: number } | null>(null);
  const [draggingWallHandle, setDraggingWallHandle] = useState<{ elementId: string; handleType: 'start' | 'end'; startX: number; startY: number; originalWall: Wall } | null>(null);
  const [showAddTableModal, setShowAddTableModal] = useState(false);
  const [showAddAreaModal, setShowAddAreaModal] = useState(false);
  const [newTableCapacity, setNewTableCapacity] = useState(4);
  const [newTableShape, setNewTableShape] = useState<'circle' | 'square' | 'rectangle'>('circle');
  const [newAreaName, setNewAreaName] = useState('');
  const [wallStart, setWallStart] = useState<{ x: number; y: number } | null>(null);
  const [dirtyTableIds, setDirtyTableIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showTableList, setShowTableList] = useState(false);
  const [showHowToUse, setShowHowToUse] = useState(true);
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [isDragEnabled, setIsDragEnabled] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const isMobile = useMobile();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapContentRef = useRef<HTMLDivElement>(null);
  const panOffsetRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const touchHandledRef = useRef(false);
  const [cameraScale, setCameraScale] = useState(1);
  const [cameraOffset, setCameraOffset] = useState({ x: 0, y: 0 });
  const [viewportLayout, setViewportLayout] = useState<ViewportLayout>({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    panningEnabled: false,
    maxPanX: 0,
    maxPanY: 0,
    minPanX: 0,
    minPanY: 0,
  });

  const [debugMode, setDebugMode] = useState(false);
  const [debugInfo, setDebugInfo] = useState<{
    clientX: number;
    clientY: number;
    containerRect: DOMRect | null;
    contentRect: DOMRect | null;
    nx: number;
    ny: number;
    wx: number;
    wy: number;
  } | null>(null);
  const [clickMarkers, setClickMarkers] = useState<Array<{ x: number; y: number }>>([]);

  const draggingRef = useRef(dragging);
  const draggingElementRef = useRef(draggingElement);
  const resizingRef = useRef(resizing);
  const rotatingRef = useRef(rotating);
  const draggingWallHandleRef = useRef(draggingWallHandle);
  const tablesRef = useRef(tables);
  const structuralElementsRef = useRef(structuralElements);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setDebugMode(params.get('debugMap') === '1');
  }, []);

  useEffect(() => {
    draggingRef.current = dragging;
  }, [dragging]);

  useEffect(() => {
    draggingElementRef.current = draggingElement;
  }, [draggingElement]);

  useEffect(() => {
    resizingRef.current = resizing;
  }, [resizing]);

  useEffect(() => {
    rotatingRef.current = rotating;
  }, [rotating]);

  useEffect(() => {
    draggingWallHandleRef.current = draggingWallHandle;
  }, [draggingWallHandle]);

  useEffect(() => {
    tablesRef.current = tables;
  }, [tables]);

  useEffect(() => {
    structuralElementsRef.current = structuralElements;
  }, [structuralElements]);

  const recalculateCamera = useCallback(() => {
    if (!mapRef.current || tables.length === 0) return;

    const rect = mapRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const contentBounds = calculateContentBounds(tables, structuralElements);
    const layout = calculateStaffViewportLayout(
      contentBounds,
      rect.width,
      rect.height,
      cameraScale,
      100
    );

    setViewportLayout(layout);

    const clamped = clampPanOffset(cameraOffset.x, cameraOffset.y, layout);
    if (clamped.x !== cameraOffset.x || clamped.y !== cameraOffset.y) {
      setCameraOffset(clamped);
      panOffsetRef.current = clamped;
    }
  }, [tables, structuralElements, cameraScale, cameraOffset.x, cameraOffset.y]);

  const fitToRoom = useCallback(() => {
    if (!mapRef.current || tables.length === 0) return;

    const rect = mapRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const contentBounds = calculateContentBounds(tables, structuralElements);

    const mapCoordinateSpace = 100;
    const aspectRatio = rect.width / rect.height;

    const viewportWidthInMapUnits = aspectRatio * mapCoordinateSpace;
    const viewportHeightInMapUnits = mapCoordinateSpace;

    const padding = 5;

    const contentWidth = contentBounds.width;
    const contentHeight = contentBounds.height;

    const scaleX = contentWidth > 0 ? (viewportWidthInMapUnits - padding * 2) / contentWidth : 1;
    const scaleY = contentHeight > 0 ? (viewportHeightInMapUnits - padding * 2) / contentHeight : 1;

    const optimalScale = Math.min(scaleX, scaleY, 2.0);
    const finalScale = Math.max(0.5, optimalScale);

    const layout = calculateStaffViewportLayout(
      contentBounds,
      rect.width,
      rect.height,
      finalScale,
      mapCoordinateSpace
    );

    setViewportLayout(layout);
    setCameraScale(finalScale);
    setCameraOffset({ x: 0, y: 0 });
    panOffsetRef.current = { x: 0, y: 0 };
  }, [tables, structuralElements]);

  useEffect(() => {
    if (tables.length > 0 || structuralElements.length > 0) {
      recalculateCamera();
    }
  }, [tables, structuralElements, recalculateCamera]);

  useEffect(() => {
    const handleResize = () => {
      recalculateCamera();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [recalculateCamera]);

  useEffect(() => {
    if (user?.restaurant_id) {
      loadAreas();
    }
  }, [user]);

  useEffect(() => {
    if (activeAreaId) {
      loadAreaData();
    }
  }, [activeAreaId]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    if (isMobile) {
      setShowHowToUse(false);
      setShowTableList(false);
    }
  }, [isMobile]);

  useEffect(() => {
    if (isMobile && activeTool !== 'select') {
      panOffsetRef.current = { x: 0, y: 0 };
      if (mapContentRef.current) {
        mapContentRef.current.style.transform = 'translate3d(0px, 0px, 0px)';
      }
    }
  }, [activeTool, isMobile]);

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  const loadAreas = async () => {
    if (!user?.restaurant_id) return;

    setLoading(true);
    try {
      const [areasData, restaurantData] = await Promise.all([
        getAreas(user.restaurant_id),
        getRestaurant(user.restaurant_id),
      ]);
      setAreas(areasData);
      setRestaurant(restaurantData);
      if (areasData.length > 0 && !activeAreaId) {
        setActiveAreaId(areasData[0].id);
      }
    } catch (error) {
      console.error('Failed to load areas:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAreaData = async () => {
    if (!activeAreaId) return;

    try {
      const [tablesData, elementsData] = await Promise.all([
        getTablesByArea(activeAreaId),
        getStructuralElements(activeAreaId),
      ]);
      setTables(tablesData);
      setStructuralElements(elementsData);
      setDirtyTableIds(new Set());
    } catch (error) {
      console.error('Failed to load area data:', error);
    }
  };

  const getRoomViewportRect = (): DOMRect | null => {
    if (!mapContentRef.current) return null;
    return mapContentRef.current.getBoundingClientRect();
  };

  const screenToWorld = (clientX: number, clientY: number): { x: number; y: number; nx: number; ny: number } | null => {
    const rect = getRoomViewportRect();
    if (!rect) return null;

    const nx = (clientX - rect.left) / rect.width;
    const ny = (clientY - rect.top) / rect.height;

    const wx = nx * 100;
    const wy = ny * 100;

    const clampedX = Math.max(0, Math.min(100, wx));
    const clampedY = Math.max(0, Math.min(100, wy));

    return { x: clampedX, y: clampedY, nx, ny };
  };

  const handleAddArea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.restaurant_id || !newAreaName.trim()) return;

    try {
      const newArea = await createArea(user.restaurant_id, newAreaName.trim());
      setAreas(prev => [...prev, newArea]);
      setActiveAreaId(newArea.id);
      setShowAddAreaModal(false);
      setNewAreaName('');
    } catch (error) {
      alert('Failed to create area');
      console.error(error);
    }
  };

  const handleDeleteArea = async () => {
    if (!activeAreaId) return;

    const areaToDelete = areas.find(a => a.id === activeAreaId);
    if (!areaToDelete) return;

    if (areas.length === 1) {
      setToast('Cannot delete the last area');
      return;
    }

    const tableCount = tables.length;
    const tableText = tableCount === 1 ? '1 table' : `${tableCount} tables`;
    const message = `Delete area '${areaToDelete.name}'?\n\nThis area contains ${tableText} and will be permanently deleted along with all structural elements.`;

    if (!window.confirm(message)) {
      return;
    }

    try {
      await deleteArea(activeAreaId);
      const remainingAreas = areas.filter(a => a.id !== activeAreaId);
      setAreas(remainingAreas);
      setActiveAreaId(remainingAreas[0]?.id || null);
    } catch (error) {
      alert('Failed to delete area');
      console.error(error);
    }
  };

  const handleDebugMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!debugMode) return;

    const coords = screenToWorld(e.clientX, e.clientY);
    if (!coords) return;

    const containerRect = mapRef.current?.getBoundingClientRect() || null;
    const contentRect = getRoomViewportRect();
    setDebugInfo({
      clientX: e.clientX,
      clientY: e.clientY,
      containerRect,
      contentRect,
      nx: coords.nx,
      ny: coords.ny,
      wx: coords.x,
      wy: coords.y,
    });
  };

  const handleMapClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!mapContentRef.current || !activeAreaId) return;
    if (isMobile && isPanning) return;

    const coords = screenToWorld(e.clientX, e.clientY);
    if (!coords) return;

    const x = coords.x;
    const y = coords.y;

    if (debugMode) {
      setClickMarkers(prev => [...prev, { x, y }]);
    }

    if (activeTool === 'select') {
      setSelectedTableId(null);
      setSelectedElementId(null);
    }

    if (activeTool === 'add_table') {
      if (checkTableCollision(x, y)) {
        setToast('Cannot place table here - overlaps with structural elements');
        return;
      }
      setShowAddTableModal(true);
      setNewTableCapacity(4);
      setNewTableShape('circle');
      (window as any).__pendingTablePosition = { x, y };
    } else if (activeTool === 'wall') {
      if (!wallStart) {
        setWallStart({ x, y });
      } else {
        try {
          await createStructuralElement(activeAreaId, 'wall', {
            x1: wallStart.x,
            y1: wallStart.y,
            x2: x,
            y2: y,
          });
          await loadAreaData();
          setWallStart(null);
          setActiveTool('select');
        } catch (error) {
          console.error('Failed to create wall:', error);
        }
      }
    } else if (activeTool === 'door') {
      if (checkElementCollision(x, y)) {
        setToast('Cannot place door here - overlaps with table');
        return;
      }
      try {
        await createStructuralElement(activeAreaId, 'door', {
          x,
          y,
          rotation: 0,
          doorDirection: 1,
        });
        await loadAreaData();
        setActiveTool('select');
      } catch (error) {
        console.error('Failed to create door:', error);
      }
    } else if (activeTool === 'window') {
      if (checkElementCollision(x, y)) {
        setToast('Cannot place window here - overlaps with table');
        return;
      }
      try {
        await createStructuralElement(activeAreaId, 'window', {
          x,
          y,
          rotation: 0,
        });
        await loadAreaData();
        setActiveTool('select');
      } catch (error) {
        console.error('Failed to create window:', error);
      }
    } else if (activeTool === 'wc') {
      if (checkElementCollision(x, y)) {
        setToast('Cannot place WC here - overlaps with table');
        return;
      }
      try {
        await createStructuralElement(activeAreaId, 'wc', {
          x,
          y,
          rotation: 0,
        });
        await loadAreaData();
        setActiveTool('select');
      } catch (error) {
        console.error('Failed to create WC:', error);
      }
    } else if (activeTool === 'select') {
      setSelectedTableId(null);
      setSelectedElementId(null);
    }
  };

  const checkTableCollision = (x: number, y: number, tableRadius = 5): boolean => {
    return structuralElements.some(element => {
      if (element.type === 'wall') {
        const wall = element.properties as Wall;
        const dist = pointToLineDistance(x, y, wall.x1, wall.y1, wall.x2, wall.y2);
        return dist < tableRadius;
      } else {
        const props = element.properties as DoorWindowWC;
        const dist = Math.sqrt(Math.pow(x - props.x, 2) + Math.pow(y - props.y, 2));
        return dist < tableRadius + 3;
      }
    });
  };

  const checkElementCollision = (x: number, y: number, checkRadius = 3): boolean => {
    return tables.some(table => {
      const dist = Math.sqrt(Math.pow(x - table.pos_x, 2) + Math.pow(y - table.pos_y, 2));
      return dist < checkRadius + 5;
    });
  };

  const pointToLineDistance = (px: number, py: number, x1: number, y1: number, x2: number, y2: number): number => {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0) param = dot / lenSq;

    let xx, yy;

    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }

    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleConfirmAddTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.restaurant_id || !activeAreaId) return;

    const pos = (window as any).__pendingTablePosition;
    if (!pos) return;

    try {
      const tableNumber = tables.length + 1;
      const newTable = await createTable(
        user.restaurant_id,
        activeAreaId,
        `Table ${tableNumber}`,
        newTableCapacity,
        newTableShape,
        pos.x,
        pos.y
      );
      setTables(prev => [...prev, newTable]);
      setShowAddTableModal(false);
      setActiveTool('select');
      (window as any).__pendingTablePosition = null;
    } catch (error) {
      alert('Failed to create table');
      console.error(error);
    }
  };

  const handleDeleteTable = async (tableId: string) => {
    const table = tables.find(t => t.id === tableId);
    const tableName = table?.name || 'this table';
    if (!window.confirm(`Delete Table '${tableName}'? This cannot be undone.`)) {
      return;
    }

    setError(null);

    try {
      await deleteTable(tableId);
      setTables(prevTables => prevTables.filter(t => t.id !== tableId));
      setDirtyTableIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(tableId);
        return newSet;
      });
    } catch (error) {
      console.error('Failed to delete table:', error);
      setError('Failed to delete table. Please try again.');
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleDuplicateTable = async (tableId: string) => {
    if (!user?.restaurant_id || !activeAreaId) return;

    const table = tables.find(t => t.id === tableId);
    if (!table) return;

    try {
      const tableNumber = tables.length + 1;
      const offsetX = Math.min(100, table.pos_x + 5);
      const offsetY = Math.min(100, table.pos_y + 5);

      const newTable = await createTable(
        user.restaurant_id,
        activeAreaId,
        `Table ${tableNumber}`,
        table.capacity,
        table.shape,
        offsetX,
        offsetY
      );

      setTables(prev => [...prev, {
        ...newTable,
        scale_x: table.scale_x,
        scale_y: table.scale_y,
        rotation: table.rotation,
      }]);

      setDirtyTableIds(prev => new Set(prev).add(newTable.id));
      await saveTableLayout(user.restaurant_id, [{
        id: newTable.id,
        pos_x: offsetX,
        pos_y: offsetY,
        shape: table.shape,
        scale_x: table.scale_x ?? 1,
        scale_y: table.scale_y ?? 1,
        rotation: table.rotation ?? 0,
      }]);
    } catch (error) {
      console.error('Failed to duplicate table:', error);
      setError('Failed to duplicate table. Please try again.');
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleResizeTable = (tableId: string, direction: 'up' | 'down') => {
    setTables(prev =>
      prev.map(t => {
        if (t.id === tableId) {
          const currentScale = t.scale_x ?? 1;
          const change = direction === 'up' ? 0.1 : -0.1;
          const newScale = Math.max(0.5, Math.min(2.0, currentScale + change));

          return {
            ...t,
            scale_x: newScale,
            scale_y: newScale,
          };
        }
        return t;
      })
    );
    setDirtyTableIds(prev => new Set(prev).add(tableId));
  };

  const handleDeleteElement = async () => {
    if (!selectedElementId) return;

    const element = structuralElements.find(e => e.id === selectedElementId);
    if (!element) return;

    const elementTypeNames = {
      wall: 'Wall Segment',
      door: 'Door',
      window: 'Window',
      wc: 'WC Symbol'
    };
    const typeName = elementTypeNames[element.type] || 'Element';

    if (!window.confirm(`Delete ${typeName}? This cannot be undone.`)) {
      return;
    }

    try {
      await deleteStructuralElement(selectedElementId);
      setStructuralElements(prev => prev.filter(e => e.id !== selectedElementId));
      setSelectedElementId(null);
    } catch (error) {
      console.error('Failed to delete element:', error);
    }
  };

  const handleReverseElementDirection = async () => {
    if (!selectedElementId) return;

    const element = structuralElements.find(e => e.id === selectedElementId);
    if (!element || element.type !== 'door') return;

    const props = element.properties as DoorWindowWC;
    const newDirection = props.doorDirection === 1 ? -1 : 1;

    try {
      await updateStructuralElement(selectedElementId, {
        ...props,
        doorDirection: newDirection,
      });
      setStructuralElements(prev =>
        prev.map(e =>
          e.id === selectedElementId
            ? { ...e, properties: { ...props, doorDirection: newDirection } }
            : e
        )
      );
    } catch (error) {
      console.error('Failed to update element:', error);
    }
  };

  const snapToGrid = (value: number): number => {
    return Math.round(value / 5) * 5;
  };

  const handleDragStart = (tableId: string, e: React.MouseEvent) => {
    if (activeTool !== 'select') return;
    e.preventDefault();
    e.stopPropagation();
    const table = tables.find(t => t.id === tableId);
    if (!table) return;

    setDragging({
      tableId,
      startX: e.clientX,
      startY: e.clientY,
      startPosX: table.pos_x,
      startPosY: table.pos_y,
    });
    setError(null);
  };

  const handleTouchStart = (tableId: string, e: React.TouchEvent) => {
    if (activeTool !== 'select') return;
    e.stopPropagation();
    e.preventDefault();
    const table = tables.find(t => t.id === tableId);
    if (!table || e.touches.length !== 1) return;

    const touch = e.touches[0];

    if (isMobile) {
      panStartRef.current = null;
      setIsPanning(false);

      const timer = setTimeout(() => {
        setIsDragEnabled(true);
        setDragging({
          tableId,
          startX: touch.clientX,
          startY: touch.clientY,
          startPosX: table.pos_x,
          startPosY: table.pos_y,
        });
        setError(null);
        if ('vibrate' in navigator) {
          navigator.vibrate(50);
        }
      }, 400);
      setLongPressTimer(timer);
    } else {
      setDragging({
        tableId,
        startX: touch.clientX,
        startY: touch.clientY,
        startPosX: table.pos_x,
        startPosY: table.pos_y,
      });
      setError(null);
    }
  };

  const handleTouchEnd = (tableId: string, e: React.TouchEvent) => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }

    if (isMobile && !isDragEnabled) {
      e.stopPropagation();
      e.preventDefault();
      touchHandledRef.current = true;
      setTimeout(() => {
        touchHandledRef.current = false;
      }, 100);
      setSelectedTableId(tableId);
      setSelectedElementId(null);
    }

    setIsDragEnabled(false);
  };

  const handleElementDragStart = (elementId: string, e: React.MouseEvent) => {
    if (activeTool !== 'select') return;
    e.preventDefault();
    e.stopPropagation();
    const element = structuralElements.find(el => el.id === elementId);
    if (!element || element.type === 'wall') return;

    const props = element.properties as DoorWindowWC;
    setDraggingElement({
      elementId,
      startX: e.clientX,
      startY: e.clientY,
      startPosX: props.x,
      startPosY: props.y,
    });
    setSelectedElementId(elementId);
    setSelectedTableId(null);
    setError(null);
  };

  const handleElementTouchStart = (elementId: string, e: React.TouchEvent) => {
    if (activeTool !== 'select') return;
    e.stopPropagation();
    e.preventDefault();
    const element = structuralElements.find(el => el.id === elementId);
    if (!element || element.type === 'wall' || e.touches.length !== 1) return;

    const props = element.properties as DoorWindowWC;
    const touch = e.touches[0];

    if (isMobile) {
      panStartRef.current = null;
      setIsPanning(false);

      const timer = setTimeout(() => {
        setIsDragEnabled(true);
        setDraggingElement({
          elementId,
          startX: touch.clientX,
          startY: touch.clientY,
          startPosX: props.x,
          startPosY: props.y,
        });
        setError(null);
        if ('vibrate' in navigator) {
          navigator.vibrate(50);
        }
      }, 400);
      setLongPressTimer(timer);
    }
  };

  const handleElementTouchEnd = (elementId: string, e: React.TouchEvent) => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }

    if (isMobile && !isDragEnabled) {
      const element = structuralElements.find(el => el.id === elementId);
      if (!element) return;

      e.stopPropagation();
      e.preventDefault();
      touchHandledRef.current = true;
      setTimeout(() => {
        touchHandledRef.current = false;
      }, 100);
      setSelectedElementId(elementId);
      setSelectedTableId(null);
    }

    setIsDragEnabled(false);
  };

  const handleSaveLayout = async () => {
    if (!user?.restaurant_id || dirtyTableIds.size === 0) return;

    setSaving(true);
    setError(null);

    try {
      const updates = tables
        .filter(t => dirtyTableIds.has(t.id))
        .map(t => ({
          id: t.id,
          pos_x: Number(t.pos_x),
          pos_y: Number(t.pos_y),
          shape: t.shape,
          scale_x: t.scale_x ?? 1,
          scale_y: t.scale_y ?? 1,
          rotation: t.rotation ?? 0,
        }));

      await saveTableLayout(user.restaurant_id, updates);
      setDirtyTableIds(new Set());
    } catch (error) {
      console.error('handleSaveLayout error', error);
      setError('Failed to save layout. Please try again.');
      setTimeout(() => setError(null), 5000);
    } finally {
      setSaving(false);
    }
  };

  const handleResetLayout = () => {
    if (!window.confirm('Reset table positions? This will move all tables for this area back to their original layout.')) {
      return;
    }

    setTables(prevTables =>
      prevTables.map(t => ({
        ...t,
        pos_x: t.default_pos_x,
        pos_y: t.default_pos_y,
      }))
    );

    const allTableIds = new Set(tables.map(t => t.id));
    setDirtyTableIds(allTableIds);
    setError(null);
  };

  const handleTableClick = (tableId: string, e: React.MouseEvent) => {
    if (activeTool !== 'select' || isMobile) return;
    e.stopPropagation();
    setSelectedTableId(tableId);
    setSelectedElementId(null);
  };

  const handleMapMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool !== 'select' || isMobile) return;
    if (!viewportLayout.panningEnabled) return;

    const target = e.target as HTMLElement;
    if (target !== e.currentTarget && !target.closest('.map-background')) {
      return;
    }

    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      offsetX: cameraOffset.x,
      offsetY: cameraOffset.y,
    };

    setIsPanning(true);
  };

  const handleMapMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!panStartRef.current || activeTool !== 'select' || isMobile) return;
    if (!isPanning) return;

    const deltaX = e.clientX - panStartRef.current.x;
    const deltaY = e.clientY - panStartRef.current.y;

    const newPanX = panStartRef.current.offsetX + deltaX;
    const newPanY = panStartRef.current.offsetY + deltaY;

    const clamped = clampPanOffset(newPanX, newPanY, viewportLayout);
    setCameraOffset(clamped);
    panOffsetRef.current = clamped;
  };

  const handleMapMouseUp = () => {
    if (!panStartRef.current || isMobile) return;

    if (!isPanning && activeTool === 'select') {
      setSelectedTableId(null);
      setSelectedElementId(null);
    }

    panStartRef.current = null;
    setIsPanning(false);
  };

  const handleMapPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isMobile || activeTool !== 'select') return;
    if (selectedTableId || selectedElementId) return;

    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      offsetX: cameraOffset.x,
      offsetY: cameraOffset.y,
    };
  };

  const handleMapPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isMobile || !panStartRef.current || activeTool !== 'select') return;
    if (dragging || isDragEnabled || selectedTableId || selectedElementId) return;

    const deltaX = e.clientX - panStartRef.current.x;
    const deltaY = e.clientY - panStartRef.current.y;

    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    if (distance > 5) {
      if (!isPanning) {
        setIsPanning(true);
      }

      const newPanX = panStartRef.current.offsetX + deltaX;
      const newPanY = panStartRef.current.offsetY + deltaY;

      const clamped = clampPanOffset(newPanX, newPanY, viewportLayout);
      setCameraOffset(clamped);
      panOffsetRef.current = clamped;
    }
  };

  const handleMapPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isMobile) return;

    if (touchHandledRef.current) {
      return;
    }

    if (!isPanning && activeTool === 'select' && e.target === mapContentRef.current) {
      setSelectedTableId(null);
      setSelectedElementId(null);
    }

    panStartRef.current = null;
    setIsPanning(false);
  };

  const handleResizeStart = (tableId: string, handle: string, e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const table = tables.find(t => t.id === tableId);
    if (!table) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    setResizing({
      tableId,
      handle,
      startX: clientX,
      startY: clientY,
      startScaleX: table.scale_x ?? 1,
      startScaleY: table.scale_y ?? 1,
    });
  };

  const handleRotateStart = (tableId: string, e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const table = tables.find(t => t.id === tableId);
    if (!table || !mapRef.current) return;

    const mapRect = mapRef.current.getBoundingClientRect();
    const centerX = mapRect.left + (mapRect.width * table.pos_x / 100);
    const centerY = mapRect.top + (mapRect.height * table.pos_y / 100);

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const startAngle = Math.atan2(clientY - centerY, clientX - centerX) * (180 / Math.PI);

    setRotating({
      tableId,
      startAngle,
      startRotation: table.rotation ?? 0,
      centerX,
      centerY,
    });
  };

  useEffect(() => {
    const handleMove = (clientX: number, clientY: number) => {
      const currentDragging = draggingRef.current;
      const currentDraggingElement = draggingElementRef.current;
      const currentResizing = resizingRef.current;
      const currentRotating = rotatingRef.current;

      if (currentRotating) {
        const currentAngle = Math.atan2(clientY - currentRotating.centerY, clientX - currentRotating.centerX) * (180 / Math.PI);
        const angleDelta = currentAngle - currentRotating.startAngle;
        let newRotation = currentRotating.startRotation + angleDelta;

        while (newRotation < 0) newRotation += 360;
        while (newRotation >= 360) newRotation -= 360;

        setTables(prevTables =>
          prevTables.map(t =>
            t.id === currentRotating.tableId
              ? { ...t, rotation: newRotation }
              : t
          )
        );
      }

      if (currentResizing && mapRef.current) {
        const table = tablesRef.current.find(t => t.id === currentResizing.tableId);
        if (!table) return;

        const deltaX = clientX - currentResizing.startX;
        const deltaY = clientY - currentResizing.startY;

        const scaleFactor = 0.005;
        let newScaleX = currentResizing.startScaleX;
        let newScaleY = currentResizing.startScaleY;

        if (table.shape === 'circle' || table.shape === 'square') {
          const delta = (deltaX + deltaY) / 2;
          const scaleChange = delta * scaleFactor;
          newScaleX = newScaleY = Math.max(0.5, Math.min(2.0, currentResizing.startScaleX + scaleChange));
        } else {
          if (currentResizing.handle.includes('e') || currentResizing.handle.includes('w')) {
            const scaleChangeX = deltaX * scaleFactor * (currentResizing.handle.includes('w') ? -1 : 1);
            newScaleX = Math.max(0.5, Math.min(2.0, currentResizing.startScaleX + scaleChangeX));
          }
          if (currentResizing.handle.includes('n') || currentResizing.handle.includes('s')) {
            const scaleChangeY = deltaY * scaleFactor * (currentResizing.handle.includes('n') ? -1 : 1);
            newScaleY = Math.max(0.5, Math.min(2.0, currentResizing.startScaleY + scaleChangeY));
          }
          if (currentResizing.handle.length === 2) {
            const scaleChangeX = deltaX * scaleFactor * (currentResizing.handle.includes('w') ? -1 : 1);
            const scaleChangeY = deltaY * scaleFactor * (currentResizing.handle.includes('n') ? -1 : 1);
            newScaleX = Math.max(0.5, Math.min(2.0, currentResizing.startScaleX + scaleChangeX));
            newScaleY = Math.max(0.5, Math.min(2.0, currentResizing.startScaleY + scaleChangeY));
          }
        }

        setTables(prevTables =>
          prevTables.map(t =>
            t.id === currentResizing.tableId
              ? { ...t, scale_x: newScaleX, scale_y: newScaleY }
              : t
          )
        );
      }

      if (currentDragging && mapRef.current) {
        const rect = mapRef.current.getBoundingClientRect();
        const deltaX = clientX - currentDragging.startX;
        const deltaY = clientY - currentDragging.startY;

        const deltaXPercent = (deltaX / rect.width) * 100;
        const deltaYPercent = (deltaY / rect.height) * 100;

        const newX = currentDragging.startPosX + deltaXPercent;
        const newY = currentDragging.startPosY + deltaYPercent;

        const clampedX = Math.max(0, Math.min(100, newX));
        const clampedY = Math.max(0, Math.min(100, newY));

        const snappedX = snapToGrid(clampedX);
        const snappedY = snapToGrid(clampedY);

        setTables(prevTables =>
          prevTables.map(t =>
            t.id === currentDragging.tableId
              ? { ...t, pos_x: snappedX, pos_y: snappedY }
              : t
          )
        );
      }

      if (currentDraggingElement && mapRef.current) {
        const rect = mapRef.current.getBoundingClientRect();
        const deltaX = clientX - currentDraggingElement.startX;
        const deltaY = clientY - currentDraggingElement.startY;

        const deltaXPercent = (deltaX / rect.width) * 100;
        const deltaYPercent = (deltaY / rect.height) * 100;

        const newX = currentDraggingElement.startPosX + deltaXPercent;
        const newY = currentDraggingElement.startPosY + deltaYPercent;

        const clampedX = Math.max(0, Math.min(100, newX));
        const clampedY = Math.max(0, Math.min(100, newY));

        setStructuralElements(prevElements =>
          prevElements.map(el => {
            if (el.id === currentDraggingElement.elementId && el.type !== 'wall') {
              const props = el.properties as DoorWindowWC;
              return {
                ...el,
                properties: {
                  ...props,
                  x: clampedX,
                  y: clampedY,
                },
              };
            }
            return el;
          })
        );
      }

      const currentDraggingWallHandle = draggingWallHandleRef.current;
      if (currentDraggingWallHandle && mapRef.current) {
        const rect = mapRef.current.getBoundingClientRect();
        const deltaX = clientX - currentDraggingWallHandle.startX;
        const deltaY = clientY - currentDraggingWallHandle.startY;

        const deltaXPercent = (deltaX / rect.width) * 100;
        const deltaYPercent = (deltaY / rect.height) * 100;

        const wall = currentDraggingWallHandle.originalWall;

        let newX1 = wall.x1;
        let newY1 = wall.y1;
        let newX2 = wall.x2;
        let newY2 = wall.y2;

        if (currentDraggingWallHandle.handleType === 'start') {
          newX1 = Math.max(0, Math.min(100, wall.x1 + deltaXPercent));
          newY1 = Math.max(0, Math.min(100, wall.y1 + deltaYPercent));
        } else {
          newX2 = Math.max(0, Math.min(100, wall.x2 + deltaXPercent));
          newY2 = Math.max(0, Math.min(100, wall.y2 + deltaYPercent));
        }

        setStructuralElements(prevElements =>
          prevElements.map(el => {
            if (el.id === currentDraggingWallHandle.elementId && el.type === 'wall') {
              return {
                ...el,
                properties: {
                  x1: newX1,
                  y1: newY1,
                  x2: newX2,
                  y2: newY2,
                } as Wall,
              };
            }
            return el;
          })
        );
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      handleMove(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        e.preventDefault();
        const touch = e.touches[0];
        handleMove(touch.clientX, touch.clientY);
      }
    };

    const handleEnd = async () => {
      const currentResizing = resizingRef.current;
      const currentDragging = draggingRef.current;
      const currentDraggingElement = draggingElementRef.current;
      const currentRotating = rotatingRef.current;
      const currentDraggingWallHandle = draggingWallHandleRef.current;

      if (currentResizing) {
        setDirtyTableIds(prev => new Set(prev).add(currentResizing.tableId));
        setResizing(null);
      }
      if (currentDragging) {
        setDirtyTableIds(prev => new Set(prev).add(currentDragging.tableId));
        setDragging(null);
      }
      if (currentRotating) {
        setDirtyTableIds(prev => new Set(prev).add(currentRotating.tableId));
        setRotating(null);
      }
      if (currentDraggingElement) {
        const element = structuralElementsRef.current.find(e => e.id === currentDraggingElement.elementId);
        if (element && element.type !== 'wall') {
          try {
            await updateStructuralElement(currentDraggingElement.elementId, element.properties);
          } catch (error) {
            console.error('Failed to update element position:', error);
          }
        }
        setDraggingElement(null);
      }
      if (currentDraggingWallHandle) {
        const element = structuralElementsRef.current.find(e => e.id === currentDraggingWallHandle.elementId);
        if (element && element.type === 'wall') {
          try {
            await updateStructuralElement(currentDraggingWallHandle.elementId, element.properties);
          } catch (error) {
            console.error('Failed to update wall:', error);
          }
        }
        setDraggingWallHandle(null);
      }
    };

    if (resizing || dragging || rotating || draggingElement || draggingWallHandle) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleEnd);
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleEnd);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleEnd);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleEnd);
      };
    }
  }, [resizing, dragging, rotating, draggingElement, draggingWallHandle]);

  const shapeOptions = [
    { value: 'circle', label: 'Circle' },
    { value: 'square', label: 'Square' },
    { value: 'rectangle', label: 'Rectangle' },
  ];

  if (isAdmin) {
    return null;
  }

  if (!user?.restaurant_id) {
    return (
      <StaffLayout activeTab={activeTab} onNavigate={onNavigate} onLogout={onLogout} restaurant={restaurant}>
        <div className="bg-white rounded-xl shadow-md p-8 text-center">
          <p className="text-slate-600">No restaurant assigned to your account.</p>
        </div>
      </StaffLayout>
    );
  }

  const hasDirtyTables = dirtyTableIds.size > 0;

  return (
    <StaffLayout activeTab={activeTab} onNavigate={onNavigate} onLogout={onLogout}>
      <div className="space-y-6">
        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h2 className="text-2xl font-bold text-slate-900">Table Layout Editor</h2>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={handleResetLayout} disabled={tables.length === 0}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset Layout
              </Button>
              <Button onClick={handleSaveLayout} disabled={!hasDirtyTables || saving}>
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Saving...' : 'Save Layout'}
              </Button>
            </div>
          </div>

          {hasDirtyTables && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm">
              You have unsaved changes. Click "Save Layout" to persist your changes.
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center justify-between">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 ml-2">×</button>
            </div>
          )}

          {toast && (
            <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg text-orange-700 text-sm flex items-center justify-between">
              <span>{toast}</span>
              <button onClick={() => setToast(null)} className="text-orange-500 hover:text-orange-700 ml-2">×</button>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <button
              onClick={() => setShowHowToUse(!showHowToUse)}
              className="flex items-start gap-3 w-full text-left"
            >
              <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-sm text-blue-800 flex items-center gap-2">
                  How to use
                  <span className="text-xs">{showHowToUse ? '▼' : '▶'}</span>
                </p>
              </div>
            </button>
            {showHowToUse && (
              <div className="mt-2 ml-8 text-sm text-blue-800">
                <ul className="list-disc list-inside space-y-1">
                  <li>Select a tool from the {isMobile ? 'bottom toolbar' : 'left palette'}</li>
                  <li>Use "Add Table" to place tables by {isMobile ? 'tapping' : 'clicking'} on the map</li>
                  <li>Use "Draw Wall" for two-{isMobile ? 'tap' : 'click'} wall creation</li>
                  <li>Add doors, windows, and WC symbols with one {isMobile ? 'tap' : 'click'}</li>
                  {isMobile && <li>Long-press tables to drag them</li>}
                  {isMobile && <li>Drag empty space to pan the map</li>}
                  <li>Switch between areas using tabs</li>
                </ul>
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-xl shadow-md p-12 text-center">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-600">Loading...</p>
          </div>
        ) : (
          <>
            {areas.length > 1 && (
              <div className="bg-white rounded-xl shadow-md p-4">
                <div className={`flex items-center gap-2 ${isMobile ? 'overflow-x-auto' : 'flex-wrap'}`}>
                  {areas.map(area => (
                    <button
                      key={area.id}
                      onClick={() => setActiveAreaId(area.id)}
                      className={`px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap ${
                        activeAreaId === area.id
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {area.name}
                    </button>
                  ))}
                  <button
                    onClick={() => setShowAddAreaModal(true)}
                    className={`px-4 py-2 rounded-lg font-medium bg-green-50 text-green-700 hover:bg-green-100 transition-all flex items-center gap-1 whitespace-nowrap ${isMobile ? 'flex-shrink-0' : ''}`}
                  >
                    <Plus className="w-4 h-4" />
                    {isMobile ? '+' : 'Add Area'}
                  </button>
                  {areas.length > 1 && (
                    <button
                      onClick={handleDeleteArea}
                      className={`px-4 py-2 rounded-lg font-medium bg-red-50 text-red-700 hover:bg-red-100 transition-all flex items-center gap-1 whitespace-nowrap ${isMobile ? 'flex-shrink-0' : ''}`}
                    >
                      <Trash2 className="w-4 h-4" />
                      {isMobile ? '−' : 'Remove Area'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {areas.length === 1 && (
              <div className="bg-white rounded-xl shadow-md p-4">
                <div className="flex items-center gap-2">
                  <div className="px-4 py-2 rounded-lg font-medium bg-blue-600 text-white">
                    {areas[0].name}
                  </div>
                  <button
                    onClick={() => setShowAddAreaModal(true)}
                    className="px-4 py-2 rounded-lg font-medium bg-green-50 text-green-700 hover:bg-green-100 transition-all flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    {isMobile ? '+' : 'Add Area'}
                  </button>
                </div>
              </div>
            )}

            {isMobile && (
              <div className="bg-slate-100 rounded-lg px-3 py-2 flex items-center gap-2 text-sm text-slate-700">
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
                <span>Editing layout</span>
              </div>
            )}

            <div className={`flex gap-4 ${isMobile ? 'mb-32' : ''}`}>
              {!isMobile && (
                <div className="flex-shrink-0">
                  <ToolPalette activeTool={activeTool} onToolChange={setActiveTool} />
                </div>
              )}

              <div className="flex-1 bg-white rounded-xl shadow-md p-4 sm:p-6 relative">
                {tables.length > 0 && (
                  <button
                    onClick={fitToRoom}
                    className="absolute top-6 right-6 z-50 p-2 bg-white border-2 border-slate-300 rounded-lg hover:bg-slate-50 hover:border-slate-400 transition-all shadow-md flex items-center gap-2 text-sm font-medium text-slate-700"
                    title="Fit to room"
                  >
                    <Maximize2 className="w-4 h-4" />
                    {!isMobile && <span>Fit</span>}
                  </button>
                )}
                <div
                  ref={mapRef}
                  className="bg-slate-50 rounded-xl border-2 border-slate-200 p-4 sm:p-8 relative aspect-video w-full mx-auto select-none overflow-hidden"
                  onPointerDown={handleMapPointerDown}
                  onPointerMove={handleMapPointerMove}
                  onPointerUp={handleMapPointerUp}
                  onPointerCancel={handleMapPointerUp}
                  onMouseDown={handleMapMouseDown}
                  onMouseMove={handleMapMouseMove}
                  onMouseUp={handleMapMouseUp}
                  onMouseLeave={handleMapMouseUp}
                  style={{
                    userSelect: 'none',
                    cursor: activeTool !== 'select' ? 'crosshair' : isPanning ? 'grabbing' : viewportLayout.panningEnabled ? 'grab' : 'default',
                    touchAction: isMobile && activeTool === 'select' ? 'none' : 'auto'
                  }}
                >
                  <div
                    ref={mapContentRef}
                    className="w-full h-full relative map-background"
                    onClick={handleMapClick}
                    onMouseMove={handleDebugMouseMove}
                    style={{
                      willChange: 'transform',
                      transform: `translate(${cameraOffset.x}px, ${cameraOffset.y}px) scale(${cameraScale})`,
                      transformOrigin: 'center center',
                      transition: isPanning ? 'none' : 'transform 0.2s ease-out',
                    }}
                  >
                  <StructuralElements
                    elements={structuralElements}
                    selectedElementId={selectedElementId}
                    onElementClick={(elementId) => {
                      if (isMobile) {
                        touchHandledRef.current = true;
                        setTimeout(() => {
                          touchHandledRef.current = false;
                        }, 100);
                      }
                      setSelectedElementId(elementId);
                      setSelectedTableId(null);
                    }}
                    onElementDragStart={handleElementDragStart}
                    onElementTouchStart={handleElementTouchStart}
                    onElementTouchEnd={handleElementTouchEnd}
                    onElementDelete={(elementId) => {
                      setSelectedElementId(elementId);
                      handleDeleteElement();
                    }}
                    onElementRotate={(elementId) => {
                      const element = structuralElements.find(e => e.id === elementId);
                      if (element && element.type !== 'wall' && element.type !== 'wc') {
                        const props = element.properties as DoorWindowWC;
                        const newRotation = ((props.rotation || 0) + 15) % 360;
                        updateStructuralElement(elementId, {
                          ...props,
                          rotation: newRotation,
                        }).then(() => {
                          setStructuralElements(prev =>
                            prev.map(e =>
                              e.id === elementId
                                ? { ...e, properties: { ...props, rotation: newRotation } }
                                : e
                            )
                          );
                        });
                      }
                    }}
                    onElementReverse={(elementId) => {
                      setSelectedElementId(elementId);
                      handleReverseElementDirection();
                    }}
                    onWallHandleDragStart={(elementId, handleType, e) => {
                      if (isMobile) {
                        touchHandledRef.current = true;
                        setTimeout(() => {
                          touchHandledRef.current = false;
                        }, 100);
                      }

                      const element = structuralElements.find(el => el.id === elementId);
                      if (!element || element.type !== 'wall') return;

                      const wall = element.properties as Wall;
                      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
                      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

                      setDraggingWallHandle({
                        elementId,
                        handleType,
                        startX: clientX,
                        startY: clientY,
                        originalWall: wall,
                      });
                    }}
                    isStaffMode={true}
                    isMobile={isMobile}
                  />

                  {wallStart && activeTool === 'wall' && (
                    <svg className="absolute inset-0 w-full h-full pointer-events-none">
                      <circle cx={`${wallStart.x}%`} cy={`${wallStart.y}%`} r="4" fill="#3b82f6" />
                    </svg>
                  )}

                  {tables.map((table) => (
                    <div
                      key={table.id}
                      onMouseDown={(e) => handleDragStart(table.id, e)}
                      onTouchStart={(e) => handleTouchStart(table.id, e)}
                      onTouchEnd={(e) => handleTouchEnd(table.id, e)}
                      onClick={(e) => handleTableClick(table.id, e)}
                      className={`absolute transform -translate-x-1/2 -translate-y-1/2 select-none ${
                        activeTool === 'select' ? 'cursor-move' : 'pointer-events-none'
                      } ${dragging?.tableId === table.id ? 'scale-110 opacity-70' : ''} ${isDragEnabled && dragging?.tableId === table.id ? 'ring-2 ring-blue-500 animate-pulse' : ''}`}
                      style={{
                        left: `${table.pos_x}%`,
                        top: `${table.pos_y}%`,
                        transition: dragging?.tableId === table.id ? 'none' : 'all 0.2s',
                        userSelect: 'none',
                        touchAction: 'none',
                        pointerEvents: activeTool === 'select' ? 'auto' : 'none',
                      }}
                    >
                      <div className="relative">
                        <TableMarker
                          name={table.name}
                          capacity={table.capacity}
                          shape={table.shape}
                          scaleX={table.scale_x ?? 1}
                          scaleY={table.scale_y ?? 1}
                          rotation={table.rotation ?? 0}
                        />
                        {activeTool === 'select' && !isMobile && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTable(table.id);
                            }}
                            className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-md transition-colors z-10"
                            title="Delete table"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                        {selectedTableId === table.id && activeTool === 'select' && (
                          <>
                            <RotationHandle onRotateStart={(e) => handleRotateStart(table.id, e)} isMobile={isMobile} />
                            <ResizeHandles
                              shape={table.shape}
                              scaleX={table.scale_x ?? 1}
                              scaleY={table.scale_y ?? 1}
                              onResizeStart={(handle, e) => handleResizeStart(table.id, handle, e)}
                              isMobile={isMobile}
                            />
                            {isMobile && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteTable(table.id);
                                }}
                                className="absolute -bottom-2 -right-2 w-9 h-9 bg-red-500 active:bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg z-10"
                                title="Delete table"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}

                  {tables.length === 0 && structuralElements.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center text-slate-400">
                        <p className="text-lg mb-2">Empty floor plan</p>
                        <p className="text-sm">Select a tool to get started</p>
                      </div>
                    </div>
                  )}
                  </div>

                  {debugMode && (
                    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 9999 }}>
                      {debugInfo && debugInfo.contentRect && (
                        <>
                          <div
                            className="absolute border-2 border-red-500"
                            style={{
                              left: `${debugInfo.contentRect.left - (debugInfo.containerRect?.left || 0)}px`,
                              top: `${debugInfo.contentRect.top - (debugInfo.containerRect?.top || 0)}px`,
                              width: `${debugInfo.contentRect.width}px`,
                              height: `${debugInfo.contentRect.height}px`,
                            }}
                          />
                          <div
                            className="absolute bg-black bg-opacity-80 text-white text-xs p-2 rounded"
                            style={{
                              top: '10px',
                              left: '10px',
                              fontFamily: 'monospace',
                              maxWidth: '300px',
                            }}
                          >
                            <div>clientX: {debugInfo.clientX.toFixed(0)}</div>
                            <div>clientY: {debugInfo.clientY.toFixed(0)}</div>
                            <div>---</div>
                            {debugInfo.containerRect && (
                              <>
                                <div>Container Rect:</div>
                                <div>  x: {debugInfo.containerRect.left.toFixed(0)}</div>
                                <div>  y: {debugInfo.containerRect.top.toFixed(0)}</div>
                                <div>  w: {debugInfo.containerRect.width.toFixed(0)}</div>
                                <div>  h: {debugInfo.containerRect.height.toFixed(0)}</div>
                              </>
                            )}
                            <div>---</div>
                            {debugInfo.contentRect && (
                              <>
                                <div>Content Rect (RED):</div>
                                <div>  x: {debugInfo.contentRect.left.toFixed(0)}</div>
                                <div>  y: {debugInfo.contentRect.top.toFixed(0)}</div>
                                <div>  w: {debugInfo.contentRect.width.toFixed(0)}</div>
                                <div>  h: {debugInfo.contentRect.height.toFixed(0)}</div>
                              </>
                            )}
                            <div>---</div>
                            <div>nx: {debugInfo.nx.toFixed(4)}</div>
                            <div>ny: {debugInfo.ny.toFixed(4)}</div>
                            <div>---</div>
                            <div>wx: {debugInfo.wx.toFixed(2)}</div>
                            <div>wy: {debugInfo.wy.toFixed(2)}</div>
                          </div>
                        </>
                      )}
                      {clickMarkers.map((marker, idx) => (
                        <div
                          key={idx}
                          className="absolute"
                          style={{
                            left: `${marker.x}%`,
                            top: `${marker.y}%`,
                            width: '8px',
                            height: '8px',
                            marginLeft: '-4px',
                            marginTop: '-4px',
                            backgroundColor: 'lime',
                            border: '2px solid black',
                            borderRadius: '50%',
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {selectedElementId && activeTool === 'select' && !isMobile && (
                  <div className="mt-4 flex gap-2">
                    {structuralElements.find(e => e.id === selectedElementId)?.type === 'door' && (
                      <Button onClick={handleReverseElementDirection} variant="secondary" className="text-sm">
                        Reverse Door Direction
                      </Button>
                    )}
                    <Button onClick={handleDeleteElement} variant="secondary" className="text-sm">
                      <Trash2 className="w-4 h-4 mr-1" />
                      Delete Element
                    </Button>
                  </div>
                )}

                {tables.length > 0 && (
                  <div className="mt-6">
                    <button
                      onClick={() => setShowTableList(!showTableList)}
                      className="text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors flex items-center gap-2"
                    >
                      {showTableList ? '▼' : '▶'} Show Table List ({tables.length})
                    </button>
                    {showTableList && (
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4">
                        {tables.map((table) => (
                          <div key={table.id} className="bg-slate-50 rounded-lg p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-medium text-slate-900">{table.name}</div>
                                <div className="text-sm text-slate-600">
                                  Capacity: {table.capacity} • {table.shape}
                                </div>
                              </div>
                              <button
                                onClick={() => handleDeleteTable(table.id)}
                                className="text-red-500 hover:text-red-600 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {showAddTableModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">Add New Table</h2>

            <form onSubmit={handleConfirmAddTable} className="space-y-4">
              <Input
                label="Capacity"
                type="number"
                min="1"
                max="20"
                value={newTableCapacity}
                onChange={(e) => setNewTableCapacity(Number(e.target.value))}
                required
              />

              <Select
                label="Shape"
                value={newTableShape}
                onChange={(e) => setNewTableShape(e.target.value as 'circle' | 'square' | 'rectangle')}
                options={shapeOptions}
              />

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
                Only parties of <strong>{newTableCapacity}</strong> or{' '}
                <strong>{newTableCapacity - 1}</strong> guests can book this table.
              </div>

              <div className="flex gap-3">
                <Button type="submit" className="flex-1">
                  Add Table
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowAddTableModal(false);
                    setActiveTool('select');
                    (window as any).__pendingTablePosition = null;
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddAreaModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">Add New Area</h2>

            <form onSubmit={handleAddArea} className="space-y-4">
              <Input
                label="Area Name"
                type="text"
                value={newAreaName}
                onChange={(e) => setNewAreaName(e.target.value)}
                placeholder="e.g., Patio, Upstairs, Bar Area"
                required
              />

              <div className="flex gap-3">
                <Button type="submit" className="flex-1">
                  Add Area
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowAddAreaModal(false);
                    setNewAreaName('');
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isMobile && (
        <MobileToolbar activeTool={activeTool} onToolChange={setActiveTool} />
      )}
    </StaffLayout>
  );
}
