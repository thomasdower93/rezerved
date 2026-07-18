import React, { useRef, useState, useEffect, useCallback } from 'react';
import { V2LayoutData, V2LayoutObject, V2Camera, InteractionMode } from '../lib/types';

interface FloorplanCanvasV2Props {
  layout: V2LayoutData;
  mode: InteractionMode;
  editable: boolean;
  selectedObjectId?: string;
  selectedAreaId?: string | null;
  wallStartPoint?: { worldX: number; worldY: number } | null;
  fitToContentOnLoad?: boolean;
  tableStatusMap?: Record<string, 'green' | 'yellow' | 'red'>;
  renderMode?: 'editor' | 'customer';
  gridSnapping?: boolean;
  gridSize?: number;
  onObjectSelect?: (objectId: string | null) => void;
  onObjectMove?: (objectId: string, worldX: number, worldY: number) => void;
  onObjectUpdate?: (objectId: string, updates: Partial<V2LayoutObject>) => void;
  onCameraChange?: (camera: V2Camera) => void;
  onCanvasClick?: (worldX: number, worldY: number) => void;
  onRecenterRequest?: () => void;
}

const clampCamera = (camera: V2Camera): V2Camera => {
  return {
    panX: isFinite(camera.panX) ? camera.panX : 0,
    panY: isFinite(camera.panY) ? camera.panY : 0,
    zoom: isFinite(camera.zoom) && camera.zoom > 0.1 && camera.zoom < 4
      ? camera.zoom
      : 1,
  };
};

const getInitialCamera = (layoutCamera?: V2Camera): V2Camera => {
  if (!layoutCamera) {
    return { panX: 0, panY: 0, zoom: 1 };
  }
  return clampCamera(layoutCamera);
};

const fitToContent = (objects: V2LayoutObject[], canvasWidth: number, canvasHeight: number, selectedAreaId?: string | null, renderMode: 'editor' | 'customer' = 'editor'): V2Camera => {
  const visibleObjects = selectedAreaId
    ? objects.filter(obj => obj.areaId === selectedAreaId)
    : objects;

  if (visibleObjects.length === 0) {
    return { panX: 0, panY: 0, zoom: 1 };
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  visibleObjects.forEach(obj => {
    const halfWidth = obj.width / 2;
    const halfHeight = obj.height / 2;
    minX = Math.min(minX, obj.worldX - halfWidth);
    maxX = Math.max(maxX, obj.worldX + halfWidth);
    minY = Math.min(minY, obj.worldY - halfHeight);
    maxY = Math.max(maxY, obj.worldY + halfHeight);
  });

  const contentWidth = maxX - minX;
  const contentHeight = maxY - minY;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const padding = 80;
  const zoomX = (canvasWidth - padding) / contentWidth;
  const zoomY = (canvasHeight - padding) / contentHeight;
  const zoom = Math.min(Math.max(Math.min(zoomX, zoomY), 0.2), 2.5);

  if (renderMode === 'customer') {
    const viewWorldW = canvasWidth / zoom;
    const viewWorldH = canvasHeight / zoom;
    return {
      panX: centerX - viewWorldW / 2,
      panY: centerY - viewWorldH / 2,
      zoom,
    };
  }

  return {
    panX: centerX,
    panY: centerY,
    zoom,
  };
};

export function FloorplanCanvasV2({
  layout,
  mode,
  editable,
  selectedObjectId,
  selectedAreaId,
  wallStartPoint,
  fitToContentOnLoad = false,
  tableStatusMap,
  renderMode = 'editor',
  gridSnapping = false,
  gridSize = 20,
  onObjectSelect,
  onObjectMove,
  onObjectUpdate,
  onCameraChange,
  onCanvasClick,
  onRecenterRequest,
}: FloorplanCanvasV2Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [camera, setCamera] = useState<V2Camera>(() => {
    if (fitToContentOnLoad) {
      return fitToContent(layout.objects, 800, 600, selectedAreaId, renderMode);
    }
    return getInitialCamera(layout.camera);
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [pointerDownPos, setPointerDownPos] = useState<{ x: number; y: number } | null>(null);
  const [dragObjectId, setDragObjectId] = useState<string | null>(null);
  const [dragObjectStart, setDragObjectStart] = useState({ worldX: 0, worldY: 0 });
  const [wallHandleMode, setWallHandleMode] = useState<'none' | 'resize-start' | 'resize-end' | 'rotate'>('none');
  const [wallOriginalProps, setWallOriginalProps] = useState<{ width: number; rotation: number; worldX: number; worldY: number } | null>(null);
  const [hoveredObjectId, setHoveredObjectId] = useState<string | null>(null);
  // RMB / touch pan state
  const [isPanning, setIsPanning] = useState(false);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });

  const snapToGrid = useCallback((value: number): number => {
    if (!gridSnapping) {
      return value;
    }
    const snapped = Math.round(value / gridSize) * gridSize;
    return snapped;
  }, [gridSnapping, gridSize]);

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setCanvasSize({ width: rect.width, height: rect.height });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  useEffect(() => {
    if (fitToContentOnLoad && renderMode === 'customer' && canvasSize.width > 0) {
      const newCamera = fitToContent(layout.objects, canvasSize.width, canvasSize.height, selectedAreaId, renderMode);
      setCamera(newCamera);
      onCameraChange?.(newCamera);
    }
  }, [layout.id, selectedAreaId, canvasSize.width, canvasSize.height]);

  const screenToWorld = useCallback((screenX: number, screenY: number): { worldX: number; worldY: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { worldX: 0, worldY: 0 };

    if (renderMode === 'customer') {
      const worldX = screenX / camera.zoom + camera.panX;
      const worldY = screenY / camera.zoom + camera.panY;
      return { worldX, worldY };
    }

    const rect = canvas.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const worldX = (screenX - centerX) / camera.zoom - camera.panX;
    const worldY = (screenY - centerY) / camera.zoom - camera.panY;

    return { worldX, worldY };
  }, [camera, renderMode]);

  const worldToScreen = useCallback((worldX: number, worldY: number): { screenX: number; screenY: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { screenX: 0, screenY: 0 };

    if (renderMode === 'customer') {
      const screenX = (worldX - camera.panX) * camera.zoom;
      const screenY = (worldY - camera.panY) * camera.zoom;
      return { screenX, screenY };
    }

    const rect = canvas.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const screenX = (worldX + camera.panX) * camera.zoom + centerX;
    const screenY = (worldY + camera.panY) * camera.zoom + centerY;

    return { screenX, screenY };
  }, [camera, renderMode]);

  useEffect(() => {
    console.log('[FloorplanCanvasV2] Mode changed:', {
      mode,
      camera,
      objectsCount: layout.objects.length,
      selectedAreaId,
      filteredObjectsCount: layout.objects.filter(obj =>
        !selectedAreaId || obj.areaId === selectedAreaId
      ).length,
    });
  }, [mode, camera, layout.objects.length, selectedAreaId]);

  const getFilteredObjects = useCallback((): V2LayoutObject[] => {
    if (!selectedAreaId) {
      return layout.objects;
    }
    return layout.objects.filter(obj => obj.areaId === selectedAreaId);
  }, [layout.objects, selectedAreaId]);

  const getContentBounds = useCallback(() => {
    const filteredObjects = getFilteredObjects();

    if (filteredObjects.length === 0) {
      return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    filteredObjects.forEach(obj => {
      const halfWidth = obj.width / 2;
      const halfHeight = obj.height / 2;
      minX = Math.min(minX, obj.worldX - halfWidth);
      maxX = Math.max(maxX, obj.worldX + halfWidth);
      minY = Math.min(minY, obj.worldY - halfHeight);
      maxY = Math.max(maxY, obj.worldY + halfHeight);
    });

    return { minX, maxX, minY, maxY };
  }, [getFilteredObjects]);

  const clampPanToContent = useCallback((panX: number, panY: number): { panX: number; panY: number } => {
    if (renderMode !== 'customer') {
      return { panX, panY };
    }

    const { minX, maxX, minY, maxY } = getContentBounds();

    if (minX === Infinity || maxX === -Infinity) {
      return { panX, panY };
    }

    const paddingWorld = 120;
    const viewWorldW = canvasSize.width / camera.zoom;
    const viewWorldH = canvasSize.height / camera.zoom;

    let minPanX = minX - paddingWorld;
    let maxPanX = maxX + paddingWorld - viewWorldW;
    let minPanY = minY - paddingWorld;
    let maxPanY = maxY + paddingWorld - viewWorldH;

    if (maxPanX < minPanX) {
      const center = (minPanX + maxPanX) / 2;
      minPanX = center;
      maxPanX = center;
    }

    if (maxPanY < minPanY) {
      const center = (minPanY + maxPanY) / 2;
      minPanY = center;
      maxPanY = center;
    }

    return {
      panX: Math.max(minPanX, Math.min(maxPanX, panX)),
      panY: Math.max(minPanY, Math.min(maxPanY, panY))
    };
  }, [renderMode, getContentBounds, canvasSize, camera.zoom]);

  const handleRecenter = useCallback(() => {
    const targetCamera = fitToContent(layout.objects, canvasSize.width, canvasSize.height, selectedAreaId, renderMode);

    if (renderMode === 'customer') {
      const startCamera = { ...camera };
      const startTime = performance.now();
      const duration = 300;

      const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easeOutCubic(progress);

        const interpolatedCamera = {
          panX: startCamera.panX + (targetCamera.panX - startCamera.panX) * easedProgress,
          panY: startCamera.panY + (targetCamera.panY - startCamera.panY) * easedProgress,
          zoom: startCamera.zoom + (targetCamera.zoom - startCamera.zoom) * easedProgress,
        };

        setCamera(interpolatedCamera);
        onCameraChange?.(interpolatedCamera);

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          onRecenterRequest?.();
        }
      };

      requestAnimationFrame(animate);
    } else {
      setCamera(targetCamera);
      onCameraChange?.(targetCamera);
      onRecenterRequest?.();
    }
  }, [layout.objects, canvasSize, selectedAreaId, renderMode, camera, onCameraChange, onRecenterRequest]);

  const getWallHandleAtPoint = useCallback((wall: V2LayoutObject, worldX: number, worldY: number): 'resize-start' | 'resize-end' | 'rotate' | null => {
    if (wall.type !== 'wall') return null;

    const handleSize = 15;
    const rotRad = (wall.rotation * Math.PI) / 180;
    const cos = Math.cos(rotRad);
    const sin = Math.sin(rotRad);

    const checkHandle = (localX: number, localY: number) => {
      const rotX = wall.worldX + localX * cos - localY * sin;
      const rotY = wall.worldY + localX * sin + localY * cos;
      const dist = Math.sqrt((worldX - rotX) ** 2 + (worldY - rotY) ** 2);
      return dist <= handleSize;
    };

    if (checkHandle(wall.width / 2, 0)) return 'resize-end';
    if (checkHandle(-wall.width / 2, 0)) return 'resize-start';
    if (checkHandle(0, -wall.width / 4)) return 'rotate';

    return null;
  }, []);

  const getObjectAtPoint = useCallback((worldX: number, worldY: number): V2LayoutObject | null => {
    const filteredObjects = getFilteredObjects();
    for (let i = filteredObjects.length - 1; i >= 0; i--) {
      const obj = filteredObjects[i];

      if (obj.type === 'wall') {
        const rotRad = (obj.rotation * Math.PI) / 180;
        const cos = Math.cos(rotRad);
        const sin = Math.sin(rotRad);

        const dx = worldX - obj.worldX;
        const dy = worldY - obj.worldY;
        const localX = dx * cos + dy * sin;
        const localY = -dx * sin + dy * cos;

        if (Math.abs(localX) <= obj.width / 2 && Math.abs(localY) <= obj.height / 2) {
          return obj;
        }
      } else {
        const dx = worldX - obj.worldX;
        const dy = worldY - obj.worldY;

        const halfWidth = obj.width / 2;
        const halfHeight = obj.height / 2;

        if (Math.abs(dx) <= halfWidth && Math.abs(dy) <= halfHeight) {
          return obj;
        }
      }
    }
    return null;
  }, [getFilteredObjects]);

  const handlePointerDown = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const { worldX, worldY } = screenToWorld(screenX, screenY);

    console.log('[FloorplanCanvas] PointerDown at:', { screenX, screenY, worldX, worldY, renderMode, mode, button: e.button });

    // RMB pan — editor only, desktop pointer devices only
    if (e.button === 2 && renderMode === 'editor' && e.pointerType === 'mouse') {
      isPanningRef.current = true;
      panStartRef.current = { x: screenX, y: screenY };
      setIsPanning(true);
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    // Single-finger pan on touch — editor only
    if (e.pointerType === 'touch' && renderMode === 'editor') {
      isPanningRef.current = true;
      panStartRef.current = { x: screenX, y: screenY };
      setIsPanning(true);
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    setPointerDownPos({ x: screenX, y: screenY });
    setDragStart({ x: screenX, y: screenY });
    setIsDragging(false);

    if (mode === 'edit' && editable) {
      if (selectedObjectId) {
        const selectedObj = layout.objects.find(o => o.id === selectedObjectId);
        if (selectedObj && selectedObj.type === 'wall') {
          const handleMode = getWallHandleAtPoint(selectedObj, worldX, worldY);
          if (handleMode) {
            setWallHandleMode(handleMode);
            setDragStart({ x: worldX, y: worldY });
            setWallOriginalProps({
              width: selectedObj.width,
              rotation: selectedObj.rotation,
              worldX: selectedObj.worldX,
              worldY: selectedObj.worldY,
            });
            e.preventDefault();
            return;
          }
        }
      }

      const obj = getObjectAtPoint(worldX, worldY);
      if (obj && !obj.locked) {
        setDragObjectId(obj.id);
        setDragObjectStart({ worldX: obj.worldX, worldY: obj.worldY });
        setDragStart({ x: worldX, y: worldY });
        onObjectSelect?.(obj.id);
        e.preventDefault();
        return;
      }
      e.preventDefault();
      return;
    }

    e.preventDefault();
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const { worldX, worldY } = screenToWorld(screenX, screenY);

    // RMB / touch pan handling — editor only
    if (isPanningRef.current && renderMode === 'editor') {
      const dxPx = screenX - panStartRef.current.x;
      const dyPx = screenY - panStartRef.current.y;
      const dxWorld = dxPx / camera.zoom;
      const dyWorld = dyPx / camera.zoom;
      const newCamera = clampCamera({
        ...camera,
        panX: camera.panX + dxWorld,
        panY: camera.panY + dyWorld,
      });
      setCamera(newCamera);
      onCameraChange?.(newCamera);
      panStartRef.current = { x: screenX, y: screenY };
      return;
    }

    if (!isDragging) {
      const obj = getObjectAtPoint(worldX, worldY);

      if (renderMode === 'customer') {
        if (obj && obj.type === 'table') {
          const tableId = obj.properties?.tableId;
          const status = tableStatusMap?.[tableId || ''];
          if (status === 'green' || status === 'yellow') {
            setHoveredObjectId(obj.id);
          } else {
            setHoveredObjectId(null);
          }
        } else {
          setHoveredObjectId(null);
        }
      } else if (renderMode === 'editor' && mode === 'edit') {
        setHoveredObjectId(obj?.id || null);
      }
    }

    if (pointerDownPos && !isDragging) {
      const dx = screenX - pointerDownPos.x;
      const dy = screenY - pointerDownPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > 6) {
        setIsDragging(true);
      }
    }

    if (!isDragging && !dragObjectId && wallHandleMode === 'none') return;

    if (wallHandleMode !== 'none' && selectedObjectId && wallOriginalProps) {
      const selectedObj = layout.objects.find(o => o.id === selectedObjectId);
      if (selectedObj && selectedObj.type === 'wall') {
        const findNearbyWallEndpoint = (x: number, y: number) => {
          const SNAP_THRESHOLD = 15;
          const walls = layout.objects.filter(obj => obj.type === 'wall' && obj.id !== selectedObjectId);

          for (const wall of walls) {
            const halfLen = wall.width / 2;
            const rad = (wall.rotation * Math.PI) / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);

            const start = {
              x: wall.worldX - halfLen * cos,
              y: wall.worldY - halfLen * sin,
            };
            const end = {
              x: wall.worldX + halfLen * cos,
              y: wall.worldY + halfLen * sin,
            };

            const distToStart = Math.sqrt((x - start.x) ** 2 + (y - start.y) ** 2);
            const distToEnd = Math.sqrt((x - end.x) ** 2 + (y - end.y) ** 2);

            if (distToStart < SNAP_THRESHOLD) return start;
            if (distToEnd < SNAP_THRESHOLD) return end;
          }
          return null;
        };

        if (wallHandleMode === 'resize-end') {
          const rotRad = (wallOriginalProps.rotation * Math.PI) / 180;
          const cos = Math.cos(rotRad);
          const sin = Math.sin(rotRad);

          const startX = wallOriginalProps.worldX - (wallOriginalProps.width / 2) * cos;
          const startY = wallOriginalProps.worldY - (wallOriginalProps.width / 2) * sin;

          const wallSnap = findNearbyWallEndpoint(worldX, worldY);
          const snappedEndX = wallSnap ? wallSnap.x : snapToGrid(worldX);
          const snappedEndY = wallSnap ? wallSnap.y : snapToGrid(worldY);

          const dx = snappedEndX - startX;
          const dy = snappedEndY - startY;
          const newLength = Math.sqrt(dx * dx + dy * dy);
          const newAngle = Math.atan2(dy, dx) * (180 / Math.PI);

          const newCenterX = startX + (newLength / 2) * Math.cos((newAngle * Math.PI) / 180);
          const newCenterY = startY + (newLength / 2) * Math.sin((newAngle * Math.PI) / 180);

          onObjectUpdate?.(selectedObjectId, {
            width: Math.max(20, newLength),
            rotation: newAngle,
            worldX: newCenterX,
            worldY: newCenterY,
          });
        } else if (wallHandleMode === 'resize-start') {
          const rotRad = (wallOriginalProps.rotation * Math.PI) / 180;
          const cos = Math.cos(rotRad);
          const sin = Math.sin(rotRad);

          const endX = wallOriginalProps.worldX + (wallOriginalProps.width / 2) * cos;
          const endY = wallOriginalProps.worldY + (wallOriginalProps.width / 2) * sin;

          const wallSnap = findNearbyWallEndpoint(worldX, worldY);
          const snappedStartX = wallSnap ? wallSnap.x : snapToGrid(worldX);
          const snappedStartY = wallSnap ? wallSnap.y : snapToGrid(worldY);

          const dx = endX - snappedStartX;
          const dy = endY - snappedStartY;
          const newLength = Math.sqrt(dx * dx + dy * dy);
          const newAngle = Math.atan2(dy, dx) * (180 / Math.PI);

          const newCenterX = snappedStartX + (newLength / 2) * Math.cos((newAngle * Math.PI) / 180);
          const newCenterY = snappedStartY + (newLength / 2) * Math.sin((newAngle * Math.PI) / 180);

          onObjectUpdate?.(selectedObjectId, {
            width: Math.max(20, newLength),
            rotation: newAngle,
            worldX: newCenterX,
            worldY: newCenterY,
          });
        } else if (wallHandleMode === 'rotate') {
          const dx = worldX - wallOriginalProps.worldX;
          const dy = worldY - wallOriginalProps.worldY;
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);

          onObjectUpdate?.(selectedObjectId, {
            rotation: angle,
          });
        }
      }
    } else if (dragObjectId && mode === 'edit') {
      const deltaX = worldX - dragStart.x;
      const deltaY = worldY - dragStart.y;

      const rawWorldX = dragObjectStart.worldX + deltaX;
      const rawWorldY = dragObjectStart.worldY + deltaY;

      const snappedWorldX = snapToGrid(rawWorldX);
      const snappedWorldY = snapToGrid(rawWorldY);

      onObjectMove?.(dragObjectId, snappedWorldX, snappedWorldY);
    } else if (isDragging && mode === 'pan') {
      const dxPx = screenX - dragStart.x;
      const dyPx = screenY - dragStart.y;

      const dxWorld = dxPx / camera.zoom;
      const dyWorld = dyPx / camera.zoom;

      let proposedPanX: number;
      let proposedPanY: number;

      if (renderMode === 'customer') {
        proposedPanX = camera.panX - dxWorld;
        proposedPanY = camera.panY - dyWorld;
      } else {
        proposedPanX = camera.panX + dxWorld;
        proposedPanY = camera.panY + dyWorld;
      }

      const { panX: clampedPanX, panY: clampedPanY } = clampPanToContent(proposedPanX, proposedPanY);

      const newCamera = clampCamera({
        ...camera,
        panX: clampedPanX,
        panY: clampedPanY,
      });

      setCamera(newCamera);
      onCameraChange?.(newCamera);
      setDragStart({ x: screenX, y: screenY });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Stop RMB / touch pan
    if (isPanningRef.current) {
      isPanningRef.current = false;
      setIsPanning(false);
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const { worldX, worldY } = screenToWorld(screenX, screenY);

    let wasDragging = isDragging || dragObjectId || wallHandleMode !== 'none';

    if (pointerDownPos && !wasDragging) {
      const dx = screenX - pointerDownPos.x;
      const dy = screenY - pointerDownPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= 6) {
        wasDragging = false;
      } else {
        wasDragging = true;
      }
    }

    console.log('[FloorplanCanvas] PointerUp:', {
      wasDragging,
      renderMode,
      isDragging,
      dragObjectId,
      distance: pointerDownPos ? Math.sqrt(Math.pow(screenX - pointerDownPos.x, 2) + Math.pow(screenY - pointerDownPos.y, 2)) : 0,
    });

    setIsDragging(false);
    setDragObjectId(null);
    setWallHandleMode('none');
    setWallOriginalProps(null);
    setPointerDownPos(null);

    if (!wasDragging) {
      console.log('[FloorplanCanvas] Tap detected at world coords:', { worldX, worldY });

      if (renderMode === 'customer') {
        const obj = getObjectAtPoint(worldX, worldY);
        console.log('[FloorplanCanvas] Object at point:', obj);

        if (obj && obj.type === 'table') {
          const tableId = obj.properties?.tableId;
          const status = tableStatusMap?.[tableId || ''];
          console.log('[FloorplanCanvas] Table clicked:', {
            objectId: obj.id,
            tableId,
            tableName: obj.name,
            status
          });

          if (status === 'green' || status === 'yellow') {
            console.log('[FloorplanCanvas] Calling onObjectSelect for eligible table');
            onObjectSelect?.(obj.id);
          } else {
            console.log('[FloorplanCanvas] Table not eligible, status:', status);
          }
        } else {
          console.log('[FloorplanCanvas] No table at point or obj is not a table');
        }
      } else if (onCanvasClick && mode === 'edit' && editable) {
        const obj = getObjectAtPoint(worldX, worldY);
        if (!obj) {
          onObjectSelect?.(null);
          onCanvasClick(worldX, worldY);
        }
      }
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();

    if (renderMode === 'customer') {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const { worldX: worldMouseX, worldY: worldMouseY } = screenToWorld(mouseX, mouseY);

    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(4, camera.zoom * zoomFactor));

    const newCamera = clampCamera({
      ...camera,
      zoom: newZoom,
    });

    setCamera(newCamera);
    onCameraChange?.(newCamera);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    if (renderMode === 'customer') {
      canvas.width = Math.floor(canvasSize.width * dpr);
      canvas.height = Math.floor(canvasSize.height * dpr);
      canvas.style.width = `${canvasSize.width}px`;
      canvas.style.height = `${canvasSize.height}px`;
    } else {
      canvas.width = canvasSize.width;
      canvas.height = canvasSize.height;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (renderMode !== 'customer') {
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, '#f8fafc');
      gradient.addColorStop(1, '#e2e8f0');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // PAN / ZOOM TRANSFORM APPLIED HERE (world layer)
    // All drawing after this point is in world coordinates and will pan/zoom
    ctx.save();
    if (renderMode === 'customer') {
      ctx.scale(dpr, dpr);
      ctx.scale(camera.zoom, camera.zoom);
      ctx.translate(-camera.panX, -camera.panY);
    } else {
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.scale(camera.zoom, camera.zoom);
      ctx.translate(camera.panX, camera.panY);
    }

    const drawGrid = () => {
      ctx.strokeStyle = gridSnapping ? '#3b82f6' : '#e0e0e0';
      ctx.lineWidth = gridSnapping ? 1.5 / camera.zoom : 1 / camera.zoom;
      ctx.globalAlpha = gridSnapping ? 0.4 : 0.15;
      const startX = Math.floor((-camera.panX - canvas.width / 2 / camera.zoom) / gridSize) * gridSize;
      const endX = Math.ceil((-camera.panX + canvas.width / 2 / camera.zoom) / gridSize) * gridSize;
      const startY = Math.floor((-camera.panY - canvas.height / 2 / camera.zoom) / gridSize) * gridSize;
      const endY = Math.ceil((-camera.panY + canvas.height / 2 / camera.zoom) / gridSize) * gridSize;

      for (let x = startX; x <= endX; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, startY);
        ctx.lineTo(x, endY);
        ctx.stroke();
      }

      for (let y = startY; y <= endY; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    if (renderMode === 'editor') {
      drawGrid();
    }

    const filteredObjects = getFilteredObjects();

    if (filteredObjects.length === 0 && selectedAreaId) {
      ctx.fillStyle = '#6b7280';
      ctx.font = `${16 / camera.zoom}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No objects in this area yet', 0, 0);
    }

    if (wallStartPoint) {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(wallStartPoint.worldX, wallStartPoint.worldY, 5 / camera.zoom, 0, Math.PI * 2);
      ctx.fill();
    }

    if (renderMode === 'editor' && gridSnapping) {
      const walls = filteredObjects.filter(obj => obj.type === 'wall');
      walls.forEach(wall => {
        const halfLen = wall.width / 2;
        const rad = (wall.rotation * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        const start = {
          x: wall.worldX - halfLen * cos,
          y: wall.worldY - halfLen * sin,
        };
        const end = {
          x: wall.worldX + halfLen * cos,
          y: wall.worldY + halfLen * sin,
        };

        ctx.fillStyle = '#3b82f6';
        ctx.globalAlpha = 0.6;

        ctx.beginPath();
        ctx.arc(start.x, start.y, 4 / camera.zoom, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(end.x, end.y, 4 / camera.zoom, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 1;
      });
    }

    filteredObjects.forEach(obj => {
      const worldX = obj.worldX ?? 0;
      const worldY = obj.worldY ?? 0;
      const width = obj.width ?? 80;
      const height = obj.height ?? 80;
      const rotation = obj.rotation ?? 0;

      if ((obj.worldX === undefined || obj.worldY === undefined) && import.meta.env.DEV) {
        console.warn('[FloorplanCanvas] Object missing position:', obj.id, obj.type);
      }

      ctx.save();
      ctx.translate(worldX, worldY);
      ctx.rotate((rotation * Math.PI) / 180);

      if (obj.type === 'table') {
        const tableId = obj.properties?.tableId;
        const status = tableStatusMap?.[tableId || ''];
        const isHovered = renderMode === 'customer' && hoveredObjectId === obj.id;
        const capacity = obj.properties?.capacity || obj.capacity || 2;

        let fillColor = '#6b7280';
        let strokeColor = '#374151';
        let opacity = 1;
        let glowColor = null;

        if (renderMode === 'customer') {
          if (status === 'green') {
            fillColor = isHovered ? '#34d399' : '#10b981';
            strokeColor = 'rgba(16, 185, 129, 0.3)';
            glowColor = isHovered ? 'rgba(16, 185, 129, 0.4)' : 'rgba(16, 185, 129, 0.2)';
          } else if (status === 'yellow') {
            fillColor = isHovered ? '#fbbf24' : '#f59e0b';
            strokeColor = 'rgba(245, 158, 11, 0.3)';
            glowColor = isHovered ? 'rgba(245, 158, 11, 0.4)' : 'rgba(245, 158, 11, 0.2)';
          } else if (status === 'red') {
            fillColor = '#cbd5e1';
            strokeColor = 'rgba(148, 163, 184, 0.2)';
            opacity = 0.4;
          }
        } else {
          if (status === 'green') {
            fillColor = isHovered ? '#059669' : '#10b981';
            strokeColor = '#374151';
          } else if (status === 'yellow') {
            fillColor = '#f59e0b';
            strokeColor = '#374151';
          } else if (status === 'red') {
            fillColor = '#94a3b8';
            strokeColor = '#64748b';
          }
        }

        if (selectedObjectId === obj.id) {
          if (renderMode === 'customer') {
            strokeColor = '#d97706';
            ctx.shadowColor = 'rgba(217, 119, 6, 0.5)';
            ctx.shadowBlur = 20 / camera.zoom;
          } else {
            fillColor = '#3b82f6';
            strokeColor = '#2563eb';
          }
        } else if (renderMode === 'editor' && isHovered) {
          fillColor = '#60a5fa';
          strokeColor = '#3b82f6';
        }

        ctx.globalAlpha = opacity;

        if (renderMode === 'customer') {
          if (glowColor && (status === 'green' || status === 'yellow')) {
            const glowSize = isHovered ? 32 : 24;
            const baseAlpha = isHovered ? 0.45 : 0.35;

            ctx.shadowColor = `rgba(0, 0, 0, ${baseAlpha})`;
            ctx.shadowBlur = glowSize / camera.zoom;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = (isHovered ? 8 : 6) / camera.zoom;
          } else if (status === 'red') {
            ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
            ctx.shadowBlur = 16 / camera.zoom;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 4 / camera.zoom;
          } else {
            ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
            ctx.shadowBlur = 18 / camera.zoom;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 6 / camera.zoom;
          }
        } else if (renderMode === 'editor') {
          ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
          ctx.shadowBlur = 10 / camera.zoom;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 3 / camera.zoom;
        }

        ctx.fillStyle = fillColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = renderMode === 'customer' ? 2.5 / camera.zoom : 2 / camera.zoom;

        const scale = renderMode === 'customer'
          ? (selectedObjectId === obj.id ? 1.03 : (isHovered ? 1.02 : 1))
          : 1;
        if (scale !== 1) {
          ctx.scale(scale, scale);
        }

        if (obj.shape === 'circle' || !obj.shape) {
          ctx.beginPath();
          ctx.arc(0, 0, width / 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else {
          const cornerRadius = renderMode === 'customer' ? 8 / camera.zoom : 0;
          const x = -width / 2;
          const y = -height / 2;

          if (cornerRadius > 0) {
            ctx.beginPath();
            ctx.moveTo(x + cornerRadius, y);
            ctx.lineTo(x + width - cornerRadius, y);
            ctx.arcTo(x + width, y, x + width, y + cornerRadius, cornerRadius);
            ctx.lineTo(x + width, y + height - cornerRadius);
            ctx.arcTo(x + width, y + height, x + width - cornerRadius, y + height, cornerRadius);
            ctx.lineTo(x + cornerRadius, y + height);
            ctx.arcTo(x, y + height, x, y + height - cornerRadius, cornerRadius);
            ctx.lineTo(x, y + cornerRadius);
            ctx.arcTo(x, y, x + cornerRadius, y, cornerRadius);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          } else {
            ctx.fillRect(x, y, width, height);
            ctx.strokeRect(x, y, width, height);
          }
        }

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        if (renderMode === 'customer' && selectedObjectId === obj.id) {
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 3 / camera.zoom;

          if (obj.shape === 'circle' || !obj.shape) {
            ctx.beginPath();
            ctx.arc(0, 0, width / 2 + 3 / camera.zoom, 0, Math.PI * 2);
            ctx.stroke();
          } else {
            const cornerRadius = 8 / camera.zoom;
            const x = -width / 2;
            const y = -height / 2;
            const offset = 3 / camera.zoom;
            ctx.beginPath();
            ctx.moveTo(x + cornerRadius - offset, y - offset);
            ctx.lineTo(x + width - cornerRadius + offset, y - offset);
            ctx.arcTo(x + width + offset, y - offset, x + width + offset, y + cornerRadius - offset, cornerRadius);
            ctx.lineTo(x + width + offset, y + height - cornerRadius + offset);
            ctx.arcTo(x + width + offset, y + height + offset, x + width - cornerRadius + offset, y + height + offset, cornerRadius);
            ctx.lineTo(x + cornerRadius - offset, y + height + offset);
            ctx.arcTo(x - offset, y + height + offset, x - offset, y + height - cornerRadius + offset, cornerRadius);
            ctx.lineTo(x - offset, y + cornerRadius - offset);
            ctx.arcTo(x - offset, y - offset, x + cornerRadius - offset, y - offset, cornerRadius);
            ctx.closePath();
            ctx.stroke();
          }
        } else if (renderMode === 'customer' && glowColor && (status === 'green' || status === 'yellow')) {
          const glowIntensity = isHovered ? 0.25 : 0.15;
          ctx.strokeStyle = glowColor.replace(/[\d.]+\)$/, `${glowIntensity})`);
          ctx.lineWidth = (isHovered ? 4 : 3) / camera.zoom;

          if (obj.shape === 'circle' || !obj.shape) {
            ctx.beginPath();
            ctx.arc(0, 0, width / 2 + (isHovered ? 2 : 1) / camera.zoom, 0, Math.PI * 2);
            ctx.stroke();
          } else {
            const cornerRadius = 8 / camera.zoom;
            const x = -width / 2;
            const y = -height / 2;
            const offset = (isHovered ? 2 : 1) / camera.zoom;
            ctx.beginPath();
            ctx.moveTo(x + cornerRadius - offset, y - offset);
            ctx.lineTo(x + width - cornerRadius + offset, y - offset);
            ctx.arcTo(x + width + offset, y - offset, x + width + offset, y + cornerRadius - offset, cornerRadius);
            ctx.lineTo(x + width + offset, y + height - cornerRadius + offset);
            ctx.arcTo(x + width + offset, y + height + offset, x + width - cornerRadius + offset, y + height + offset, cornerRadius);
            ctx.lineTo(x + cornerRadius - offset, y + height + offset);
            ctx.arcTo(x - offset, y + height + offset, x - offset, y + height - cornerRadius + offset, cornerRadius);
            ctx.lineTo(x - offset, y + cornerRadius - offset);
            ctx.arcTo(x - offset, y - offset, x + cornerRadius - offset, y - offset, cornerRadius);
            ctx.closePath();
            ctx.stroke();
          }
        }

        if (renderMode === 'customer' && status !== 'red') {
          const highlightGradient = obj.shape === 'circle' || !obj.shape
            ? ctx.createRadialGradient(0, -width / 6, 0, 0, 0, width / 2)
            : ctx.createLinearGradient(0, -height / 2, 0, height / 2);

          highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
          highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

          ctx.fillStyle = highlightGradient;

          if (obj.shape === 'circle' || !obj.shape) {
            ctx.beginPath();
            ctx.arc(0, 0, width / 2, 0, Math.PI * 2);
            ctx.fill();
          } else {
            const cornerRadius = 8 / camera.zoom;
            const x = -width / 2;
            const y = -height / 2;
            ctx.beginPath();
            ctx.moveTo(x + cornerRadius, y);
            ctx.lineTo(x + width - cornerRadius, y);
            ctx.arcTo(x + width, y, x + width, y + cornerRadius, cornerRadius);
            ctx.lineTo(x + width, y + height - cornerRadius);
            ctx.arcTo(x + width, y + height, x + width - cornerRadius, y + height, cornerRadius);
            ctx.lineTo(x + cornerRadius, y + height);
            ctx.arcTo(x, y + height, x, y + height - cornerRadius, cornerRadius);
            ctx.lineTo(x, y + cornerRadius);
            ctx.arcTo(x, y, x + cornerRadius, y, cornerRadius);
            ctx.closePath();
            ctx.fill();
          }
        }

        if (renderMode === 'customer') {
          const minFontSize = 10;
          const maxFontSize = 16;
          const baseFontSize = Math.min(Math.max(14 / camera.zoom, minFontSize), maxFontSize);

          ctx.fillStyle = status === 'red' ? 'rgba(71, 85, 105, 0.9)' : 'rgba(255, 255, 255, 0.95)';
          ctx.font = `bold ${baseFontSize}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          const tableName = obj.properties?.tableNumber || obj.label || obj.name || '';
          const labelY = -8 / camera.zoom;
          const capacityY = 8 / camera.zoom;

          if (tableName) {
            ctx.fillText(tableName, 0, labelY);
          }

          ctx.font = `${Math.min(baseFontSize * 0.85, maxFontSize * 0.85)}px sans-serif`;
          ctx.fillText(`${capacity}`, 0, tableName ? capacityY : 0);
        } else {
          ctx.fillStyle = '#ffffff';
          ctx.font = `${14 / camera.zoom}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(obj.name || '', 0, 0);
        }

        if (scale !== 1) {
          ctx.scale(1 / scale, 1 / scale);
        }

        ctx.globalAlpha = 1;

        const seatRadius = (obj.shape === 'circle' || !obj.shape) ? width / 2 : Math.sqrt(width * width + height * height) / 2;
        const seatOffset = seatRadius + 12 / camera.zoom;

        const showSeats = renderMode === 'customer' ? isHovered && (status === 'green' || status === 'yellow') : true;

        if (showSeats) {
          const seatSize = renderMode === 'customer' ? 3 / camera.zoom : 4 / camera.zoom;
          ctx.fillStyle = renderMode === 'customer'
            ? (status === 'green' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(245, 158, 11, 0.4)')
            : 'rgba(59, 130, 246, 0.6)';

          for (let i = 0; i < capacity; i++) {
            const angle = (i * 2 * Math.PI) / capacity - Math.PI / 2;
            const seatX = Math.cos(angle) * seatOffset;
            const seatY = Math.sin(angle) * seatOffset;

            ctx.beginPath();
            ctx.arc(seatX, seatY, seatSize, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else if (obj.type === 'wall') {
        const isSelected = selectedObjectId === obj.id && renderMode !== 'customer';

        if (renderMode === 'customer') {
          ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
          ctx.shadowBlur = 8 / camera.zoom;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 3 / camera.zoom;
          ctx.strokeStyle = 'rgba(62, 56, 48, 0.75)';
          ctx.lineWidth = (height * 0.7) / camera.zoom;
        } else {
          ctx.strokeStyle = isSelected ? '#3b82f6' : '#374151';
          ctx.lineWidth = height / camera.zoom;
        }

        ctx.beginPath();
        ctx.moveTo(-width / 2, 0);
        ctx.lineTo(width / 2, 0);
        ctx.stroke();

        if (renderMode === 'customer') {
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
        }

        if (isSelected && renderMode !== 'customer') {
          const handleSize = 8 / camera.zoom;
          ctx.fillStyle = '#3b82f6';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2 / camera.zoom;

          ctx.beginPath();
          ctx.arc(width / 2, 0, handleSize, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(-width / 2, 0, handleSize, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#10b981';
          ctx.beginPath();
          ctx.arc(0, -width / 4, handleSize, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      } else if (obj.type === 'door') {
        if (renderMode === 'customer') {
          ctx.strokeStyle = 'rgba(139, 69, 19, 0.25)';
          ctx.lineWidth = 2 / camera.zoom;
        } else {
          ctx.strokeStyle = '#8b4513';
          ctx.lineWidth = 3 / camera.zoom;
        }
        ctx.strokeRect(-width / 2, -height / 2, width, height);
      } else if (obj.type === 'window') {
        if (renderMode === 'customer') {
          ctx.strokeStyle = 'rgba(70, 130, 180, 0.25)';
          ctx.lineWidth = 2 / camera.zoom;
        } else {
          ctx.strokeStyle = '#4682b4';
          ctx.lineWidth = 3 / camera.zoom;
        }
        ctx.strokeRect(-width / 2, -height / 2, width, height);
      } else if (obj.type === 'wc') {
        if (renderMode === 'customer') {
          ctx.fillStyle = 'rgba(224, 224, 224, 0.3)';
          ctx.fillRect(-width / 2, -height / 2, width, height);
          ctx.strokeStyle = 'rgba(55, 65, 81, 0.15)';
          ctx.lineWidth = 1.5 / camera.zoom;
        } else {
          ctx.fillStyle = '#e0e0e0';
          ctx.fillRect(-width / 2, -height / 2, width, height);
          ctx.strokeStyle = '#374151';
          ctx.lineWidth = 2 / camera.zoom;
        }
        ctx.strokeRect(-width / 2, -height / 2, width, height);
      }

      ctx.restore();
    });

    if (renderMode === 'customer') {
      const bounds = getContentBounds();
      if (bounds.minX !== Infinity) {
        const padding = 40;
        const roomX = bounds.minX - padding;
        const roomY = bounds.minY - padding;
        const roomWidth = bounds.maxX - bounds.minX + padding * 2;
        const roomHeight = bounds.maxY - bounds.minY + padding * 2;

        ctx.strokeStyle = 'rgba(139, 92, 46, 0.25)';
        ctx.lineWidth = 2 / camera.zoom;
        ctx.setLineDash([8 / camera.zoom, 4 / camera.zoom]);
        ctx.strokeRect(roomX, roomY, roomWidth, roomHeight);
        ctx.setLineDash([]);
      }
    }

    ctx.restore();

    if (renderMode === 'customer') {
      const bounds = getContentBounds();
      if (bounds.minX !== Infinity) {
        const padding = 40;
        const roomWorldX = bounds.minX - padding;
        const roomWorldY = bounds.minY - padding;
        const roomWorldWidth = bounds.maxX - bounds.minX + padding * 2;
        const roomWorldHeight = bounds.maxY - bounds.minY + padding * 2;

        const screenRoomX = (roomWorldX - camera.panX) * camera.zoom;
        const screenRoomY = (roomWorldY - camera.panY) * camera.zoom;
        const screenRoomWidth = roomWorldWidth * camera.zoom;
        const screenRoomHeight = roomWorldHeight * camera.zoom;

        const fadeWidth = 80;

        ctx.save();
        ctx.scale(dpr, dpr);

        const gradient = ctx.createRadialGradient(
          screenRoomX + screenRoomWidth / 2,
          screenRoomY + screenRoomHeight / 2,
          Math.min(screenRoomWidth, screenRoomHeight) / 2,
          screenRoomX + screenRoomWidth / 2,
          screenRoomY + screenRoomHeight / 2,
          Math.max(screenRoomWidth, screenRoomHeight) / 2 + fadeWidth
        );
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
        gradient.addColorStop(0.7, 'rgba(0, 0, 0, 0)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.35)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);

        ctx.restore();
      }
    }
  }, [layout, camera, canvasSize, selectedObjectId, getFilteredObjects, selectedAreaId, wallStartPoint, tableStatusMap, hoveredObjectId, renderMode, getContentBounds]);

  const selectedObject = React.useMemo(() => {
    if (!selectedObjectId) return null;
    return layout.objects.find(obj => obj.id === selectedObjectId);
  }, [selectedObjectId, layout.objects]);

  const isDebug = import.meta.env.DEV && new URLSearchParams(window.location.search).has('debug');

  const canvasCursor = React.useMemo(() => {
    if (renderMode === 'customer') {
      return hoveredObjectId ? 'pointer' : 'default';
    }

    // RMB pan in progress
    if (isPanning) {
      return 'grabbing';
    }

    if (mode === 'pan') {
      return isDragging ? 'grabbing' : 'grab';
    }

    if (mode === 'edit') {
      if (hoveredObjectId) {
        return 'move';
      }
      return 'crosshair';
    }

    return 'default';
  }, [renderMode, mode, hoveredObjectId, isDragging, isPanning]);

  const debugClampInfo = React.useMemo(() => {
    if (!isDebug || renderMode !== 'customer') return null;

    const { minX, maxX, minY, maxY } = getContentBounds();
    if (minX === Infinity) return null;

    const paddingWorld = 120;
    const viewWorldW = canvasSize.width / camera.zoom;
    const viewWorldH = canvasSize.height / camera.zoom;

    let minPanX = minX - paddingWorld;
    let maxPanX = maxX + paddingWorld - viewWorldW;
    let minPanY = minY - paddingWorld;
    let maxPanY = maxY + paddingWorld - viewWorldH;

    if (maxPanX < minPanX) {
      const center = (minPanX + maxPanX) / 2;
      minPanX = center;
      maxPanX = center;
    }

    if (maxPanY < minPanY) {
      const center = (minPanY + maxPanY) / 2;
      minPanY = center;
      maxPanY = center;
    }

    return { minPanX, maxPanX, minPanY, maxPanY, viewWorldW, viewWorldH };
  }, [isDebug, renderMode, getContentBounds, canvasSize, camera.zoom]);

  return (
    <div className={`relative w-full h-full ${renderMode === 'customer' ? 'map-shell' : ''}`}>
      {renderMode === 'customer' && (
        <div className="map-background" />
      )}
      <div
        ref={containerRef}
        className={`map-viewport ${renderMode === 'customer' ? '' : 'relative w-full h-full bg-gray-100'}`}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full touch-none"
          style={{
            touchAction: 'none',
            backgroundColor: renderMode === 'customer' ? 'transparent' : undefined,
            cursor: canvasCursor
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
          onContextMenu={renderMode === 'editor' ? (e) => e.preventDefault() : undefined}
        />

      {renderMode === 'customer' && (
        <>
          {!selectedObject && (
            <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 text-white text-sm pointer-events-none">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                </svg>
                <span>Tap a table to select</span>
              </div>
            </div>
          )}

          {selectedObject && selectedObject.type === 'table' && (
            <div className="absolute top-3 left-3 bg-amber-600 backdrop-blur-sm rounded-lg px-4 py-3 text-white shadow-lg border border-amber-400/30">
              <div className="space-y-2">
                <div className="flex items-center gap-2 font-semibold text-base">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Table {selectedObject.properties?.tableNumber || selectedObject.label || 'Selected'}</span>
                </div>
                <div className="text-sm space-y-1 text-amber-50">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <span>Seats {selectedObject.properties?.capacity || selectedObject.capacity || 2}</span>
                  </div>
                  {tableStatusMap && selectedObject.properties?.tableId && (
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        tableStatusMap[selectedObject.properties.tableId] === 'green' ? 'bg-green-400' :
                        tableStatusMap[selectedObject.properties.tableId] === 'yellow' ? 'bg-yellow-400' :
                        'bg-gray-400'
                      }`} />
                      <span>
                        {tableStatusMap[selectedObject.properties.tableId] === 'green' ? 'Available' :
                         tableStatusMap[selectedObject.properties.tableId] === 'yellow' ? 'Alternative time' :
                         'Unavailable'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <button
            onClick={handleRecenter}
            className="absolute top-3 right-3 bg-white/90 hover:bg-white rounded-md shadow-sm px-3 py-1.5 text-xs font-medium text-gray-700 hover:text-gray-900 transition-colors"
          >
            Recenter
          </button>

          {import.meta.env.DEV && isDebug && debugClampInfo && (
            <div className="absolute bottom-3 left-3 bg-white/95 rounded-lg shadow-md px-3 py-2 text-xs font-mono text-gray-700 space-y-1">
              <div className="font-semibold mb-1">Camera (Top-Left)</div>
              <div>panX: {camera.panX.toFixed(1)}</div>
              <div>panY: {camera.panY.toFixed(1)}</div>
              <div>zoom: {camera.zoom.toFixed(2)}</div>
              <div className="font-semibold mt-2 mb-1">Clamp Bounds</div>
              <div>minPanX: {debugClampInfo.minPanX.toFixed(1)}</div>
              <div>maxPanX: {debugClampInfo.maxPanX.toFixed(1)}</div>
              <div>minPanY: {debugClampInfo.minPanY.toFixed(1)}</div>
              <div>maxPanY: {debugClampInfo.maxPanY.toFixed(1)}</div>
              <div className="font-semibold mt-2 mb-1">Viewport</div>
              <div>viewW: {debugClampInfo.viewWorldW.toFixed(1)}</div>
              <div>viewH: {debugClampInfo.viewWorldH.toFixed(1)}</div>
            </div>
          )}
        </>
      )}

      {renderMode === 'editor' && (
        <>
          <div className="absolute bottom-4 right-4 bg-white rounded-lg shadow-md px-4 py-2">
            <span className="text-sm font-medium">Zoom: {Math.round(camera.zoom * 100)}%</span>
          </div>

          {import.meta.env.DEV && isDebug && (
            <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-md px-3 py-2 text-xs text-gray-600 space-y-1">
              <div>Objects: {layout.objects.length} total</div>
              {selectedAreaId && (
                <div>Filtered: {getFilteredObjects().length} in area</div>
              )}
              <div>Mode: {mode}</div>
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );
}
