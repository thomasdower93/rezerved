import React, { useEffect, useState, useRef } from 'react';
import { FloorplanCanvasV2 } from './FloorplanCanvasV2';
import { supabase } from '../lib/supabase';
import { getLayoutAsV2, cleanupOrphanedObjects } from '../services/legacyAdapter';
import { getTables } from '../services/tables';
import { getAreas } from '../services/areas';
import { V2LayoutData, TableAvailability } from '../lib/types';

interface CustomerFloorplanViewProps {
  restaurantId: string;
  areaId?: string;
  tables: TableAvailability[];
  onTableSelect: (table: TableAvailability) => void;
  onFloorplanLoaded?: (floorplanInfo: { id: string; version: number; engine: string }) => void;
}

export function CustomerFloorplanView({
  restaurantId,
  areaId,
  tables,
  onTableSelect,
  onFloorplanLoaded,
}: CustomerFloorplanViewProps) {
  const [layout, setLayout] = useState<V2LayoutData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState({
    restaurantId: '',
    selectedAreaId: '',
    queryStarted: '',
    queryEnded: '',
    areas: 0,
    objects: 0,
    tables: 0,
    walls: 0,
    errorMessage: '',
  });
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!restaurantId) {
      setError('Missing restaurantId');
      setLoading(false);
      setDebugInfo(prev => ({
        ...prev,
        restaurantId: 'MISSING',
        errorMessage: 'Restaurant ID is required',
      }));
      return;
    }

    loadFloorplan();

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [restaurantId]);

  const loadFloorplan = async () => {
    const queryStarted = new Date().toISOString();

    setLoading(true);
    setError(null);

    try {
      timeoutRef.current = setTimeout(() => {
        setError('Timeout loading floorplan');
        setLoading(false);
        setDebugInfo(prev => ({
          ...prev,
          errorMessage: 'Query timeout (6s)',
          queryEnded: new Date().toISOString(),
        }));
      }, 6000);

      if (import.meta.env.DEV) {
        console.log('[CustomerFloorplanView] Loading floorplan for restaurant:', restaurantId);
      }

      const { data: floorplan, error: floorplanError } = await supabase
        .from('floorplans')
        .select('id, restaurant_id, version, engine, layout_data, created_at')
        .eq('restaurant_id', restaurantId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      if (floorplanError) {
        console.error('[CustomerFloorplanView] Supabase error:', floorplanError);
        setError(`Database error: ${floorplanError.message}`);
        setDebugInfo({
          restaurantId,
          selectedAreaId: areaId || 'none',
          queryStarted,
          queryEnded: new Date().toISOString(),
          areas: 0,
          objects: 0,
          tables: 0,
          walls: 0,
          errorMessage: `${floorplanError.code}: ${floorplanError.message}`,
        });
        return;
      }

      if (!floorplan) {
        if (import.meta.env.DEV) {
          console.log('[CustomerFloorplanView] No floorplan found, creating empty layout');
        }

        const areas = await getAreas(restaurantId);
        const emptyLayout: V2LayoutData = {
          version: 2,
          world: {
            bounds: { minX: -5000, maxX: 5000, minY: -5000, maxY: 5000 },
          },
          camera: { panX: 0, panY: 0, zoom: 1 },
          objects: [],
        };

        setLayout(emptyLayout);
        setDebugInfo({
          restaurantId,
          selectedAreaId: areaId || 'none',
          queryStarted,
          queryEnded: new Date().toISOString(),
          areas: areas.length,
          objects: 0,
          tables: 0,
          walls: 0,
          errorMessage: 'No layout published yet',
        });
        return;
      }

      let v2Layout = getLayoutAsV2(floorplan.layout_data);

      const allTables = await getTables(restaurantId);
      const validTableIds = new Set(allTables.map(t => t.id));

      const areas = await getAreas(restaurantId);
      const validAreaIds = new Set(areas.map(a => a.id));

      v2Layout = cleanupOrphanedObjects(v2Layout, validTableIds, validAreaIds);

      // Enrich layout objects with current table data (capacity, name) from database
      const tableMap = new Map(allTables.map(t => [t.id, t]));
      let enrichedCount = 0;
      v2Layout = {
        ...v2Layout,
        objects: v2Layout.objects.map(obj => {
          if ((obj.type === 'table' || obj.type === 'booth') && obj.properties?.tableId) {
            const currentTable = tableMap.get(obj.properties.tableId);
            if (currentTable) {
              enrichedCount++;
              if (import.meta.env.DEV && obj.capacity !== currentTable.capacity) {
                console.log('[CustomerFloorplanView] Updating stale capacity:', {
                  tableId: currentTable.id,
                  tableName: currentTable.name,
                  oldCapacity: obj.capacity,
                  newCapacity: currentTable.capacity,
                });
              }
              return {
                ...obj,
                capacity: currentTable.capacity,
                name: currentTable.name,
                properties: {
                  ...obj.properties,
                  capacity: currentTable.capacity,
                  tableNumber: currentTable.name,
                },
              };
            }
          }
          return obj;
        }),
      };

      if (import.meta.env.DEV) {
        console.log('[CustomerFloorplanView] Enriched table objects with current capacity:', {
          enrichedCount,
          totalTables: allTables.length,
        });
      }

      const areaCount = validAreaIds.size;
      const objectCount = v2Layout.objects.length;
      const tableCount = v2Layout.objects.filter(o => o.type === 'table').length;
      const wallCount = v2Layout.objects.filter(o => o.type === 'wall').length;

      setDebugInfo({
        restaurantId,
        selectedAreaId: areaId || 'none',
        queryStarted,
        queryEnded: new Date().toISOString(),
        areas: areaCount,
        objects: objectCount,
        tables: tableCount,
        walls: wallCount,
        errorMessage: '',
      });

      if (import.meta.env.DEV) {
        console.log('[CustomerFloorplanView] Loaded floorplan:', {
          version: floorplan.version,
          engine: floorplan.engine,
          areas: areaCount,
          objects: objectCount,
          tables: tableCount,
          walls: wallCount,
        });
      }

      onFloorplanLoaded?.({
        id: floorplan.id,
        version: floorplan.version,
        engine: floorplan.engine,
      });

      setLayout(v2Layout);
    } catch (error) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[CustomerFloorplanView] Failed to load floorplan:', error);
      setError(`Failed to load floorplan: ${errorMessage}`);
      setDebugInfo({
        restaurantId: restaurantId || 'MISSING',
        selectedAreaId: areaId || 'none',
        queryStarted,
        queryEnded: new Date().toISOString(),
        areas: 0,
        objects: 0,
        tables: 0,
        walls: 0,
        errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleObjectClick = (objectId: string | null) => {
    console.log('[CustomerFloorplanView] Object clicked:', objectId);

    if (!objectId || !layout) {
      console.log('[CustomerFloorplanView] No objectId or layout');
      return;
    }

    const object = layout.objects.find(o => o.id === objectId && (o.type === 'table' || o.type === 'booth'));
    if (!object) {
      console.log('[CustomerFloorplanView] Object not found or not a table/booth');
      return;
    }

    const tableId = object.properties?.tableId;
    console.log('[CustomerFloorplanView] Table object found, tableId:', tableId);

    if (!tableId) {
      console.log('[CustomerFloorplanView] No tableId in properties');
      return;
    }

    const table = tables.find(t => t.id === tableId);
    console.log('[CustomerFloorplanView] Table data:', table);

    if (table) {
      console.log('[CustomerFloorplanView] Table eligible:', table.status === 'green' || table.status === 'yellow');
      if (table.status === 'green' || table.status === 'yellow') {
        console.log('[CustomerFloorplanView] Calling onTableSelect');
        onTableSelect(table);
      } else {
        console.log('[CustomerFloorplanView] Table status not eligible:', table.status);
      }
    } else {
      console.log('[CustomerFloorplanView] Table not found in tables array');
    }
  };

  const tableStatusMap: Record<string, 'green' | 'yellow' | 'red'> = {};
  tables.forEach(table => {
    tableStatusMap[table.id] = table.status;
  });

  const isDebug = import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-stone-50 via-amber-50/20 to-stone-100 rounded-xl">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-stone-600 font-medium">Loading floorplan...</div>
          {isDebug && debugInfo.restaurantId && (
            <div className="mt-4 text-xs text-stone-400">
              Restaurant: {debugInfo.restaurantId}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-stone-50 via-amber-50/20 to-stone-100 rounded-xl">
        <div className="text-center max-w-md">
          <div className="text-red-600 font-medium mb-2">Error Loading Floorplan</div>
          <div className="text-stone-600 text-sm mb-4">{error}</div>
          {isDebug && (
            <div className="bg-white rounded-lg shadow p-3 text-left text-xs space-y-1">
              <div className="font-medium text-gray-700 mb-2">Debug Info:</div>
              <div>Restaurant ID: {debugInfo.restaurantId}</div>
              <div>Selected Area: {debugInfo.selectedAreaId}</div>
              <div>Query Started: {debugInfo.queryStarted}</div>
              <div>Query Ended: {debugInfo.queryEnded}</div>
              <div className="text-red-600">Error: {debugInfo.errorMessage}</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!layout) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-stone-50 via-amber-50/20 to-stone-100 rounded-xl">
        <div className="text-stone-500">No layout data available</div>
      </div>
    );
  }

  if (layout.objects.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-stone-50 via-amber-50/20 to-stone-100 rounded-xl">
        <div className="text-center">
          <div className="text-stone-600 font-medium mb-2">No Layout Published Yet</div>
          <div className="text-stone-500 text-sm">The restaurant layout will appear here once configured.</div>
          {isDebug && (
            <div className="mt-4 text-xs text-stone-400">
              Areas: {debugInfo.areas} | Objects: {debugInfo.objects}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative rounded-xl border border-stone-200/50 shadow-inner">
      <div className="customer-floorplan-viewport">
        <div className="customer-floorplan-wood" aria-hidden="true" />
        <div className="customer-floorplan-canvas">
          <FloorplanCanvasV2
            layout={layout}
            mode="pan"
            editable={false}
            selectedAreaId={areaId}
            fitToContentOnLoad={true}
            tableStatusMap={tableStatusMap}
            renderMode="customer"
            onObjectSelect={handleObjectClick}
          />
        </div>
      </div>

      {isDebug && (
        <div className="absolute top-4 left-4 bg-white/90 rounded-lg shadow px-3 py-2 text-xs space-y-0.5 z-10">
          <div className="font-medium text-gray-700 mb-1">Debug Info:</div>
          <div>Restaurant: {debugInfo.restaurantId}</div>
          <div>Area: {debugInfo.selectedAreaId}</div>
          <div>Areas: {debugInfo.areas} | Objects: {debugInfo.objects} | Tables: {debugInfo.tables} | Walls: {debugInfo.walls}</div>
          <div>Query: {debugInfo.queryStarted ? new Date(debugInfo.queryStarted).toLocaleTimeString() : 'N/A'} → {debugInfo.queryEnded ? new Date(debugInfo.queryEnded).toLocaleTimeString() : 'N/A'}</div>
          {debugInfo.errorMessage && <div className="text-red-600">Error: {debugInfo.errorMessage}</div>}
        </div>
      )}
    </div>
  );
}
