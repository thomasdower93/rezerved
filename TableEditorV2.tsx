import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Save, Move, CreditCard as Edit3, AlertTriangle, RotateCcw, Plus, Minus, DoorOpen, Square, Bath, MousePointer2, Trash2, RotateCw, Undo2, Redo2, Grid3x3 } from 'lucide-react';
import { Button } from './Button';
import { Input } from './Input';
import { Select } from './Select';
import { FloorplanCanvasV2 } from './FloorplanCanvasV2';
import { Floorplan, V2LayoutData, V2LayoutObject, InteractionMode, EditorMode, V2Camera, Area } from '../lib/types';
import { getOrCreateLegacyFloorplan, saveFloorplan, getAllFloorplans, rollbackToFloorplan } from '../services/floorplans';
import { getLayoutAsV2, isV1LayoutData, cleanupOrphanedObjects } from '../services/legacyAdapter';
import { getAreas, createArea, deleteArea } from '../services/areas';
import { syncV2LayoutToDatabase, getTables } from '../services/tables';
import { useMobile } from '../hooks/useMobile';

type Tool = 'select' | 'add_table' | 'wall' | 'door' | 'window' | 'wc';

interface TableEditorV2Props {
  restaurantId: string;
  editorMode?: EditorMode;
  onBack?: () => void;
}

const GRID_SIZE = 20;
const SNAP_THRESHOLD = 15;

export function TableEditorV2({ restaurantId, editorMode = 'layout', onBack }: TableEditorV2Props) {
  const isMobile = useMobile();
  const [floorplan, setFloorplan] = useState<Floorplan | null>(null);
  const [layout, setLayout] = useState<V2LayoutData | null>(null);
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('edit');
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showLegacyWarning, setShowLegacyWarning] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [allFloorplans, setAllFloorplans] = useState<Floorplan[]>([]);
  const [showRollbackMenu, setShowRollbackMenu] = useState(false);
  const [areas, setAreas] = useState<Area[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [wallStart, setWallStart] = useState<{ worldX: number; worldY: number } | null>(null);
  const [gridSnapping, setGridSnapping] = useState(true);

  const [history, setHistory] = useState<V2LayoutData[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isUndoingRef = useRef(false);

  const snapToGrid = (value: number): number => {
    if (!gridSnapping) return value;
    return Math.round(value / GRID_SIZE) * GRID_SIZE;
  };

  const findNearbyWallEndpoint = (worldX: number, worldY: number): { x: number; y: number } | null => {
    if (!layout) return null;

    const walls = layout.objects.filter(obj => obj.type === 'wall');
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

      const distToStart = Math.sqrt((worldX - start.x) ** 2 + (worldY - start.y) ** 2);
      const distToEnd = Math.sqrt((worldX - end.x) ** 2 + (worldY - end.y) ** 2);

      if (distToStart < SNAP_THRESHOLD) return start;
      if (distToEnd < SNAP_THRESHOLD) return end;
    }

    return null;
  };

  const updateLayout = (newLayout: V2LayoutData) => {
    if (!isUndoingRef.current) {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(newLayout);
      if (newHistory.length > 50) newHistory.shift();
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
    setLayout(newLayout);
    setHasUnsavedChanges(true);
  };

  const undo = () => {
    if (historyIndex > 0) {
      isUndoingRef.current = true;
      setHistoryIndex(historyIndex - 1);
      setLayout(history[historyIndex - 1]);
      setHasUnsavedChanges(true);
      setTimeout(() => {
        isUndoingRef.current = false;
      }, 0);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      isUndoingRef.current = true;
      setHistoryIndex(historyIndex + 1);
      setLayout(history[historyIndex + 1]);
      setHasUnsavedChanges(true);
      setTimeout(() => {
        isUndoingRef.current = false;
      }, 0);
    }
  };

  useEffect(() => {
    loadFloorplan();
    loadAllFloorplans();
    loadAreas();
  }, [restaurantId]);

  useEffect(() => {
    if (isMobile) {
      setInteractionMode('pan');
    }
  }, [isMobile]);

  useEffect(() => {
    if (editorMode === 'service' || !layout) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedObjectId) {
          e.preventDefault();
          handleObjectDelete();
        }
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        setSelectedObjectId(null);
        setWallStart(null);
        setActiveTool('select');
      }

      if (selectedObjectId && layout) {
        const obj = layout.objects.find(o => o.id === selectedObjectId);
        if (!obj) return;

        const step = e.shiftKey ? 10 : 1;

        if (e.key === 'ArrowUp') {
          e.preventDefault();
          handleObjectMove(selectedObjectId, obj.worldX, obj.worldY - step);
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          handleObjectMove(selectedObjectId, obj.worldX, obj.worldY + step);
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          handleObjectMove(selectedObjectId, obj.worldX - step, obj.worldY);
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          handleObjectMove(selectedObjectId, obj.worldX + step, obj.worldY);
        }
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'd' && selectedObjectId && layout) {
        e.preventDefault();
        const obj = layout.objects.find(o => o.id === selectedObjectId);
        if (obj) {
          const newObj = {
            ...obj,
            id: `${obj.type}_${Date.now()}`,
            worldX: obj.worldX + 20,
            worldY: obj.worldY + 20,
          };
          updateLayout({ ...layout, objects: [...layout.objects, newObj] });
          setSelectedObjectId(newObj.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedObjectId, layout, editorMode, historyIndex, history]);

  const loadAreas = async () => {
    try {
      const areasData = await getAreas(restaurantId);
      setAreas(areasData);
      if (areasData.length > 0 && !selectedAreaId) {
        setSelectedAreaId(areasData[0].id);
      }
    } catch (error) {
      console.error('Failed to load areas:', error);
    }
  };

  const loadFloorplan = async () => {
    try {
      setIsLoading(true);
      const fp = await getOrCreateLegacyFloorplan(restaurantId);
      setFloorplan(fp);

      const v2Layout = getLayoutAsV2(fp.layout_data);

      const areasData = await getAreas(restaurantId);
      const validAreaIds = new Set(areasData.map(a => a.id));

      const tables = await getTables(restaurantId);
      const validTableIds = new Set(tables.map(t => t.id));

      let cleanedLayout = cleanupOrphanedObjects(v2Layout, validTableIds, validAreaIds);

      if (areasData.length > 0 && cleanedLayout.objects.some(obj => !obj.areaId)) {
        const defaultAreaId = areasData[0].id;
        cleanedLayout = {
          ...cleanedLayout,
          objects: cleanedLayout.objects.map(obj => ({
            ...obj,
            areaId: obj.areaId || defaultAreaId,
          })),
        };
      }

      setLayout(cleanedLayout);
      setHistory([cleanedLayout]);
      setHistoryIndex(0);

      if (fp.version === 1 && editorMode === 'layout') {
        setShowLegacyWarning(true);
      }
    } catch (error) {
      console.error('Failed to load floorplan:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAllFloorplans = async () => {
    try {
      const fps = await getAllFloorplans(restaurantId);
      setAllFloorplans(fps);
    } catch (error) {
      console.error('Failed to load floorplans:', error);
    }
  };

  const handleSave = async () => {
    if (!layout || !floorplan) return;

    try {
      setIsSaving(true);

      const isUpgrade = floorplan.version === 1;

      const syncedLayout = await syncV2LayoutToDatabase(restaurantId, layout);
      setLayout(syncedLayout);

      await saveFloorplan(
        restaurantId,
        syncedLayout,
        2,
        'v2',
        isUpgrade ? floorplan.id : undefined
      );

      setHasUnsavedChanges(false);
      setShowLegacyWarning(false);

      await loadFloorplan();
      await loadAllFloorplans();

      alert(isUpgrade
        ? 'Layout upgraded to V2 and saved successfully!'
        : 'Layout saved successfully!');
    } catch (error) {
      console.error('Failed to save floorplan:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to save layout: ${errorMessage}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRollback = async (floorplanId: string) => {
    if (!confirm('Are you sure you want to revert to this layout version? Any unsaved changes will be lost.')) {
      return;
    }

    try {
      await rollbackToFloorplan(floorplanId);
      await loadFloorplan();
      await loadAllFloorplans();
      setShowRollbackMenu(false);
      setHasUnsavedChanges(false);
      alert('Layout reverted successfully!');
    } catch (error) {
      console.error('Failed to rollback:', error);
      alert('Failed to revert layout. Please try again.');
    }
  };

  const handleObjectMove = (objectId: string, worldX: number, worldY: number) => {
    if (!layout) return;

    const updatedObjects = layout.objects.map(obj =>
      obj.id === objectId ? { ...obj, worldX, worldY } : obj
    );

    updateLayout({ ...layout, objects: updatedObjects });
  };

  const handleObjectUpdate = (objectId: string, updates: Partial<V2LayoutObject>) => {
    if (!layout) return;

    const updatedObjects = layout.objects.map(obj =>
      obj.id === objectId ? { ...obj, ...updates } : obj
    );

    updateLayout({ ...layout, objects: updatedObjects });
  };

  const handleObjectDelete = () => {
    if (!layout || !selectedObjectId) return;

    if (!confirm('Are you sure you want to delete this object?')) return;

    const updatedObjects = layout.objects.filter(obj => obj.id !== selectedObjectId);
    updateLayout({ ...layout, objects: updatedObjects });
    setSelectedObjectId(null);
  };

  const handleCanvasClick = (worldX: number, worldY: number) => {
    if (!layout || editorMode === 'service') return;

    if (activeTool === 'select') {
      return;
    }

    const snappedX = snapToGrid(worldX);
    const snappedY = snapToGrid(worldY);

    if (activeTool === 'add_table') {
      const newTable: V2LayoutObject = {
        id: `table_${Date.now()}`,
        type: 'table',
        worldX: snappedX,
        worldY: snappedY,
        width: 100,
        height: 100,
        rotation: 0,
        zIndex: layout.objects.length,
        locked: false,
        name: `Table ${layout.objects.filter(o => o.type === 'table').length + 1}`,
        capacity: 4,
        shape: 'circle',
        areaId: selectedAreaId || undefined,
      };

      updateLayout({ ...layout, objects: [...layout.objects, newTable] });
      setSelectedObjectId(newTable.id);
    } else if (activeTool === 'wall') {
      if (!wallStart) {
        const snapPoint = findNearbyWallEndpoint(worldX, worldY);
        const startX = snapPoint ? snapPoint.x : snappedX;
        const startY = snapPoint ? snapPoint.y : snappedY;
        setWallStart({ worldX: startX, worldY: startY });
      } else {
        const snapPoint = findNearbyWallEndpoint(worldX, worldY);
        const endX = snapPoint ? snapPoint.x : snappedX;
        const endY = snapPoint ? snapPoint.y : snappedY;

        const dx = endX - wallStart.worldX;
        const dy = endY - wallStart.worldY;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);

        const centerX = (wallStart.worldX + endX) / 2;
        const centerY = (wallStart.worldY + endY) / 2;

        const newWall: V2LayoutObject = {
          id: `wall_${Date.now()}`,
          type: 'wall',
          worldX: centerX,
          worldY: centerY,
          width: length,
          height: 10,
          rotation: angle,
          zIndex: 0,
          locked: false,
          areaId: selectedAreaId || undefined,
        };

        updateLayout({ ...layout, objects: [...layout.objects, newWall] });
        setWallStart(null);
      }
    } else if (activeTool === 'door' || activeTool === 'window' || activeTool === 'wc') {
      const newObject: V2LayoutObject = {
        id: `${activeTool}_${Date.now()}`,
        type: activeTool,
        worldX: snappedX,
        worldY: snappedY,
        width: activeTool === 'wc' ? 80 : 60,
        height: activeTool === 'wc' ? 80 : 20,
        rotation: 0,
        zIndex: 1,
        locked: false,
        areaId: selectedAreaId || undefined,
      };

      updateLayout({ ...layout, objects: [...layout.objects, newObject] });
      setSelectedObjectId(newObject.id);
    }
  };

  const handleCameraChange = (camera: V2Camera) => {
    if (!layout) return;
    setLayout({ ...layout, camera });
  };

  const toggleInteractionMode = () => {
    if (editorMode === 'service') return;
    setInteractionMode(prev => prev === 'pan' ? 'edit' : 'pan');
    if (interactionMode === 'pan') {
      setActiveTool('select');
    }
  };

  const handleToolChange = (tool: Tool) => {
    setActiveTool(tool);
    if (tool !== 'select') {
      setInteractionMode('edit');
    }
    setWallStart(null);
  };

  const handleAddArea = async () => {
    const name = prompt('Enter area name:');
    if (!name) return;

    try {
      const newArea = await createArea(restaurantId, name);
      await loadAreas();
      setSelectedAreaId(newArea.id);
    } catch (error) {
      console.error('Failed to create area:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create area. Please try again.';
      alert(errorMessage);
    }
  };

  const handleDeleteArea = async (areaId: string) => {
    if (areas.length <= 1) {
      alert('Cannot delete the last area. A restaurant must have at least one area.');
      return;
    }

    const areaToDelete = areas.find(a => a.id === areaId);
    if (!areaToDelete) return;

    const objectsInArea = layout?.objects.filter(obj => obj.areaId === areaId) || [];
    if (objectsInArea.length > 0) {
      const confirmed = confirm(
        `This area contains ${objectsInArea.length} object(s) (tables, walls, etc.). Deleting this area will also delete all objects in it. Are you sure?`
      );
      if (!confirmed) return;
    } else {
      const confirmed = confirm(`Are you sure you want to delete the area "${areaToDelete.name}"?`);
      if (!confirmed) return;
    }

    try {
      await deleteArea(areaId);

      if (layout && objectsInArea.length > 0) {
        const updatedObjects = layout.objects.filter(obj => obj.areaId !== areaId);
        updateLayout({ ...layout, objects: updatedObjects });
      }

      const updatedAreas = areas.filter(a => a.id !== areaId);
      setAreas(updatedAreas);

      if (selectedAreaId === areaId && updatedAreas.length > 0) {
        setSelectedAreaId(updatedAreas[0].id);
      }
    } catch (error) {
      console.error('Failed to delete area:', error);
      alert('Failed to delete area. Please try again.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading layout...</p>
        </div>
      </div>
    );
  }

  if (!layout) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-gray-600">Failed to load layout</p>
          {onBack && (
            <Button onClick={onBack} className="mt-4">
              Go Back
            </Button>
          )}
        </div>
      </div>
    );
  }

  const isReadOnly = editorMode === 'service';
  const selectedObject = selectedObjectId ? layout.objects.find(o => o.id === selectedObjectId) : null;

  const tools: { id: Tool; icon: React.ReactNode; label: string }[] = [
    { id: 'select', icon: <MousePointer2 className="w-4 h-4" />, label: 'Select' },
    { id: 'add_table', icon: <Plus className="w-4 h-4" />, label: 'Table' },
    { id: 'wall', icon: <Minus className="w-4 h-4 rotate-90" />, label: 'Wall' },
    { id: 'door', icon: <DoorOpen className="w-4 h-4" />, label: 'Door' },
    { id: 'window', icon: <Square className="w-4 h-4" />, label: 'Window' },
    { id: 'wc', icon: <Bath className="w-4 h-4" />, label: 'WC' },
  ];

  return (
    <div className="flex flex-col bg-gray-50" style={{ height: 'calc(100vh - 8rem)' }}>
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">
                {editorMode === 'service' ? 'Service View' : 'Edit Table Layout'}
              </h1>
              {!isReadOnly && (
                <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                  hasUnsavedChanges
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-green-100 text-green-700'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    hasUnsavedChanges ? 'bg-amber-500' : 'bg-green-500'
                  }`}></span>
                  {hasUnsavedChanges ? 'Unsaved' : 'Saved'}
                </span>
              )}
            </div>
            {floorplan && (
              <p className="text-sm text-gray-600">
                Version {floorplan.version} ({floorplan.engine})
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isReadOnly && (
            <>
              <Button
                onClick={undo}
                disabled={historyIndex <= 0}
                variant="outline"
                size="sm"
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="w-4 h-4" />
              </Button>

              <Button
                onClick={redo}
                disabled={historyIndex >= history.length - 1}
                variant="outline"
                size="sm"
                title="Redo (Ctrl+Y)"
              >
                <Redo2 className="w-4 h-4" />
              </Button>

              <Button
                onClick={() => setGridSnapping(!gridSnapping)}
                variant={gridSnapping ? 'default' : 'outline'}
                size="sm"
                title="Toggle Grid Snapping (20px grid)"
                className="gap-2"
              >
                <Grid3x3 className="w-4 h-4" />
                <span className="text-xs font-medium">
                  Snap: {gridSnapping ? 'ON' : 'OFF'}
                </span>
              </Button>
            </>
          )}

          {!isReadOnly && allFloorplans.length > 1 && (
            <div className="relative">
              <Button
                onClick={() => setShowRollbackMenu(!showRollbackMenu)}
                variant="outline"
                size="sm"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                History
              </Button>

              {showRollbackMenu && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                  <div className="p-2 border-b border-gray-200">
                    <p className="text-sm font-medium">Layout History</p>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {allFloorplans.map((fp) => (
                      <button
                        key={fp.id}
                        onClick={() => handleRollback(fp.id)}
                        disabled={fp.is_active}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${
                          fp.is_active ? 'bg-blue-50 text-blue-700' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span>
                            V{fp.version} ({fp.engine})
                          </span>
                          {fp.is_active && (
                            <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded">
                              Active
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {new Date(fp.created_at).toLocaleString()}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!isReadOnly && (
            <>
              {isMobile && (
                <Button
                  onClick={toggleInteractionMode}
                  variant="outline"
                  size="sm"
                >
                  {interactionMode === 'pan' ? (
                    <>
                      <Move className="w-4 h-4 mr-2" />
                      Pan Mode
                    </>
                  ) : (
                    <>
                      <Edit3 className="w-4 h-4 mr-2" />
                      Edit Mode
                    </>
                  )}
                </Button>
              )}

              <Button
                onClick={handleSave}
                disabled={isSaving || !hasUnsavedChanges}
                size="sm"
              >
                <Save className="w-4 h-4 mr-2" />
                {isSaving ? 'Saving...' : 'Save Layout'}
              </Button>
            </>
          )}
        </div>
      </div>

      {showLegacyWarning && !isReadOnly && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-800">
              Legacy Layout Detected
            </p>
            <p className="text-sm text-yellow-700 mt-1">
              This layout will be upgraded to V2 when you save. A backup of the current version will be preserved for rollback.
            </p>
          </div>
          <button
            onClick={() => setShowLegacyWarning(false)}
            className="text-yellow-600 hover:text-yellow-800"
          >
            ×
          </button>
        </div>
      )}

      {!isReadOnly && areas.length > 0 && (
        <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Area:</span>
          {areas.map((area) => (
            <div key={area.id} className="relative group">
              <button
                onClick={() => setSelectedAreaId(area.id)}
                className={`px-3 py-1 rounded-md text-sm transition-colors ${
                  selectedAreaId === area.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                } ${areas.length > 1 ? 'pr-7' : ''}`}
              >
                {area.name}
              </button>
              {areas.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteArea(area.id);
                  }}
                  className={`absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-black/10 transition-colors ${
                    selectedAreaId === area.id ? 'text-white' : 'text-gray-500'
                  }`}
                  title={`Delete ${area.name}`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={handleAddArea}
            className="px-3 py-1 rounded-md text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            Add Area
          </button>
          {wallStart && (
            <span className="ml-auto text-sm text-blue-600 font-medium">
              Click again to finish wall
            </span>
          )}
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {!isReadOnly && (
          <div className="w-56 bg-white border-r border-gray-200 p-4 space-y-4 overflow-y-auto flex-shrink-0">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Tools</p>
              <div className="space-y-1">
                {tools.map((tool) => (
                  <button
                    key={tool.id}
                    onClick={() => handleToolChange(tool.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                      activeTool === tool.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {tool.icon}
                    <span className="text-sm">{tool.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {selectedObject && (
              <div className="pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-700">Properties</p>
                  <button
                    onClick={handleObjectDelete}
                    className="p-1 text-red-600 hover:bg-red-50 rounded"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3">
                  {selectedObject.type === 'table' && (
                    <>
                      <div>
                        <label className="text-xs text-gray-600">Table Number</label>
                        <Input
                          value={selectedObject.name || ''}
                          onChange={(e) => handleObjectUpdate(selectedObject.id, { name: e.target.value })}
                          className="mt-1"
                          placeholder="e.g., T1, Table 5"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">Capacity</label>
                        <Input
                          type="number"
                          min="1"
                          max="20"
                          value={selectedObject.capacity || 4}
                          onChange={(e) => handleObjectUpdate(selectedObject.id, { capacity: parseInt(e.target.value) || 1 })}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600 mb-2 block">Shape</label>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleObjectUpdate(selectedObject.id, { shape: 'circle' })}
                            className={`flex-1 p-3 rounded-lg border-2 transition-all ${
                              (selectedObject.shape || 'circle') === 'circle'
                                ? 'border-blue-600 bg-blue-50'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                            title="Circle"
                          >
                            <div className="w-8 h-8 mx-auto rounded-full border-2 border-current"></div>
                          </button>
                          <button
                            onClick={() => handleObjectUpdate(selectedObject.id, { shape: 'square' })}
                            className={`flex-1 p-3 rounded-lg border-2 transition-all ${
                              selectedObject.shape === 'square'
                                ? 'border-blue-600 bg-blue-50'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                            title="Square"
                          >
                            <div className="w-8 h-8 mx-auto border-2 border-current"></div>
                          </button>
                          <button
                            onClick={() => handleObjectUpdate(selectedObject.id, { shape: 'rectangle' })}
                            className={`flex-1 p-3 rounded-lg border-2 transition-all ${
                              selectedObject.shape === 'rectangle'
                                ? 'border-blue-600 bg-blue-50'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                            title="Rectangle"
                          >
                            <div className="w-10 h-6 mx-auto border-2 border-current"></div>
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`reservable-${selectedObject.id}`}
                          checked={selectedObject.properties?.reservable !== false}
                          onChange={(e) => handleObjectUpdate(selectedObject.id, {
                            properties: { ...selectedObject.properties, reservable: e.target.checked }
                          })}
                          className="rounded"
                        />
                        <label htmlFor={`reservable-${selectedObject.id}`} className="text-xs text-gray-600">
                          Reservable
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`joinable-${selectedObject.id}`}
                          checked={selectedObject.properties?.joinable === true}
                          onChange={(e) => handleObjectUpdate(selectedObject.id, {
                            properties: { ...selectedObject.properties, joinable: e.target.checked }
                          })}
                          className="rounded"
                        />
                        <label htmlFor={`joinable-${selectedObject.id}`} className="text-xs text-gray-600">
                          Can be joined with others
                        </label>
                      </div>
                    </>
                  )}

                  <div>
                    <label className="text-xs text-gray-600">Width</label>
                    <Input
                      type="number"
                      value={Math.round(selectedObject.width)}
                      onChange={(e) => handleObjectUpdate(selectedObject.id, { width: parseInt(e.target.value) })}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-gray-600">Height</label>
                    <Input
                      type="number"
                      value={Math.round(selectedObject.height)}
                      onChange={(e) => handleObjectUpdate(selectedObject.id, { height: parseInt(e.target.value) })}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-gray-600 mb-2 block">Rotation</label>
                    <div className="flex items-center gap-2 mb-2">
                      <Input
                        type="number"
                        value={Math.round(selectedObject.rotation)}
                        onChange={(e) => handleObjectUpdate(selectedObject.id, { rotation: parseInt(e.target.value) })}
                        className="flex-1"
                      />
                      <button
                        onClick={() => handleObjectUpdate(selectedObject.id, { rotation: (selectedObject.rotation + 45) % 360 })}
                        className="p-2 bg-gray-100 hover:bg-gray-200 rounded"
                        title="Rotate 45°"
                      >
                        <RotateCw className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      {[0, 45, 90, 180].map((angle) => (
                        <button
                          key={angle}
                          onClick={() => handleObjectUpdate(selectedObject.id, { rotation: angle })}
                          className={`px-2 py-1 text-xs rounded transition-colors ${
                            Math.round(selectedObject.rotation) === angle
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                          }`}
                        >
                          {angle}°
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-gray-200">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`locked-${selectedObject.id}`}
                        checked={selectedObject.locked || false}
                        onChange={(e) => handleObjectUpdate(selectedObject.id, { locked: e.target.checked })}
                        className="rounded"
                      />
                      <label htmlFor={`locked-${selectedObject.id}`} className="text-xs text-gray-600">
                        Lock position (prevents dragging)
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex-1 relative">
          <FloorplanCanvasV2
            layout={layout}
            mode={isReadOnly ? 'pan' : interactionMode}
            editable={!isReadOnly}
            selectedObjectId={selectedObjectId}
            selectedAreaId={selectedAreaId}
            wallStartPoint={wallStart}
            gridSnapping={gridSnapping}
            gridSize={GRID_SIZE}
            onObjectSelect={setSelectedObjectId}
            onObjectMove={handleObjectMove}
            onObjectUpdate={handleObjectUpdate}
            onCameraChange={handleCameraChange}
            onCanvasClick={handleCanvasClick}
          />

          {!isReadOnly && !isMobile && (
            <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium">Edit Mode</span>
                </div>
                <div className="h-4 w-px bg-gray-300"></div>
                <div className="text-xs text-gray-600">
                  {activeTool === 'select' && 'Select'}
                  {activeTool === 'add_table' && 'Add Table'}
                  {activeTool === 'wall' && 'Draw Wall'}
                  {activeTool === 'door' && 'Add Door'}
                  {activeTool === 'window' && 'Add Window'}
                  {activeTool === 'wc' && 'Add WC'}
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-500 space-y-0.5">
                <div>RMB drag: Pan • Del: Delete</div>
                <div>Arrows: Move • Cmd+D: Duplicate</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {isMobile && !isReadOnly && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-white rounded-full shadow-lg px-6 py-3 flex items-center gap-4">
          <button
            onClick={toggleInteractionMode}
            className={`p-3 rounded-full transition-colors ${
              interactionMode === 'pan'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            <Move className="w-5 h-5" />
          </button>
          <button
            onClick={toggleInteractionMode}
            className={`p-3 rounded-full transition-colors ${
              interactionMode === 'edit'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            <Edit3 className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}
