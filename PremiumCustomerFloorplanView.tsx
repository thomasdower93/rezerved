import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { PremiumFloorplanCanvas, PremiumFloorplanCanvasHandle } from './PremiumFloorplanCanvas';
import { IsometricFloorplanCanvas } from './IsometricFloorplanCanvas';
import { supabase } from '../lib/supabase';
import { getLayoutAsV2, cleanupOrphanedObjects } from '../services/legacyAdapter';
import { getTables } from '../services/tables';
import { getAreas } from '../services/areas';
import { V2LayoutData, TableAvailability, TableCombinationTemplate, RoomPolygon, V2LayoutObject } from '../lib/types';
import { Crosshair, Info, X, ZoomIn, ZoomOut, Star, Users, ChevronRight } from 'lucide-react';
import { matchesPartySize } from '../lib/utils';

const HELP_SEEN_KEY = 'rezerved_floorplan_help_seen';

interface PremiumCustomerFloorplanViewProps {
  restaurantId: string;
  areaId?: string;
  tables: TableAvailability[];
  partySize?: number;
  onTableSelect: (table: TableAvailability) => void;
  onFloorplanLoaded?: (floorplanInfo: { id: string; version: number; engine: string }) => void;
}

function computeRecommendedObject(
  layoutObjects: V2LayoutObject[],
  tables: TableAvailability[],
  partySize: number
): string | null {
  const greenTables = tables.filter(t => t.status === 'green' && t.capacity >= partySize);
  if (greenTables.length === 0) return null;

  const exactMatch = greenTables.filter(t => t.capacity === partySize);
  const candidates = exactMatch.length > 0 ? exactMatch : greenTables;

  const windows = layoutObjects.filter(o => o.type === 'window');

  const scored = candidates.map(t => {
    const obj = layoutObjects.find(o =>
      (o.type === 'table' || o.type === 'booth') && o.properties?.tableId === t.id
    );
    if (!obj) return { table: t, obj: null, score: 0 };

    const capacityPenalty = (t.capacity - partySize) * 2;

    let windowBonus = 0;
    if (windows.length > 0) {
      const minDist = Math.min(...windows.map(w => {
        const dx = obj.worldX - w.worldX;
        const dy = obj.worldY - w.worldY;
        return Math.sqrt(dx * dx + dy * dy);
      }));
      const windowThreshold = 180;
      if (minDist < windowThreshold) {
        windowBonus = Math.round((1 - minDist / windowThreshold) * 10);
      }
    }

    return { table: t, obj, score: windowBonus - capacityPenalty };
  });

  const best = scored
    .filter(s => s.obj !== null)
    .reduce((a, b) => b.score > a.score ? b : a);

  return best.obj?.id || null;
}

export function PremiumCustomerFloorplanView({
  restaurantId,
  areaId,
  tables,
  partySize = 2,
  onTableSelect,
  onFloorplanLoaded,
}: PremiumCustomerFloorplanViewProps) {
  const [layout, setLayout] = useState<V2LayoutData | null>(null);
  const [rooms, setRooms] = useState<RoomPolygon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  // Combination popup state — shown when customer taps a joinable-red table
  const [comboPopup, setComboPopup] = useState<{
    table: TableAvailability;
    combos: TableCombinationTemplate[];
    unavailableCombos: Array<{ template: TableCombinationTemplate; unavailableTableName?: string; nextAvailableTime?: string | null }>;
  } | null>(null);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 480);
  // Active online combo table IDs fetched independently so "+" shows even when can_be_joined isn't set
  const [onlineComboTableIds, setOnlineComboTableIds] = useState<Set<string>>(new Set());
  const viewMode = '2d' as const;
  const hintTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const mountedRef = useRef(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const floorplanRef = useRef<PremiumFloorplanCanvasHandle>(null);

  useEffect(() => {
    const seen = localStorage.getItem(HELP_SEEN_KEY);
    if (!seen) {
      setShowHint(true);
      hintTimerRef.current = setTimeout(() => {
        setShowHint(false);
        localStorage.setItem(HELP_SEEN_KEY, '1');
      }, 2800);
    }
    return () => {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    };
  }, []);

  const dismissHint = useCallback(() => {
    if (showHint) {
      setShowHint(false);
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
      localStorage.setItem(HELP_SEEN_KEY, '1');
    }
  }, [showHint]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 480);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (!restaurantId) {
      setError('Missing restaurantId');
      setLoading(false);
      return;
    }
    loadFloorplan();
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [restaurantId]);

  // Fetch active online combination table IDs independently — does not require can_be_joined flag
  useEffect(() => {
    if (!restaurantId) return;
    supabase
      .from('table_combination_templates')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .eq('active', true)
      .eq('allow_online_booking', true)
      .then(({ data: templates }) => {
        if (!templates || templates.length === 0) {
          console.log('[JoinedPlus] active online combinations', []);
          return;
        }
        const templateIds = templates.map(t => t.id);
        console.log('[JoinedPlus] active online combinations', templates);
        supabase
          .from('table_combination_template_tables')
          .select('table_id')
          .in('template_id', templateIds)
          .then(({ data: rows }) => {
            const ids = new Set<string>((rows || []).map(r => r.table_id));
            console.log('[JoinedPlus] joinable table ids', Array.from(ids));
            if (mountedRef.current) setOnlineComboTableIds(ids);
          });
      });
  }, [restaurantId]);

  const loadFloorplan = async () => {
    setLoading(true);
    setError(null);
    try {
      timeoutRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        setError('Timeout loading floorplan');
        setLoading(false);
      }, 8000);

      const { data: floorplan, error: floorplanError } = await supabase
        .from('floorplans')
        .select('id, restaurant_id, version, engine, layout_data, created_at')
        .eq('restaurant_id', restaurantId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (!mountedRef.current) return;

      if (floorplanError) {
        setError(`Database error: ${floorplanError.message}`);
        return;
      }

      if (!floorplan) {
        const emptyLayout: V2LayoutData = {
          version: 2,
          world: { bounds: { minX: -5000, maxX: 5000, minY: -5000, maxY: 5000 } },
          camera: { panX: 0, panY: 0, zoom: 1 },
          objects: [],
        };
        setLayout(emptyLayout);
        setRooms([]);
        return;
      }

      const storedRooms: RoomPolygon[] = (floorplan.layout_data as any)?.rooms || [];
      setRooms(storedRooms);

      let v2Layout = getLayoutAsV2(floorplan.layout_data);

      const [allTables, areas] = await Promise.all([
        getTables(restaurantId),
        getAreas(restaurantId),
      ]);

      const validTableIds = new Set(allTables.map(t => t.id));
      const validAreaIds = new Set(areas.map(a => a.id));

      v2Layout = cleanupOrphanedObjects(v2Layout, validTableIds, validAreaIds);

      const tableMap = new Map(allTables.map(t => [t.id, t]));
      v2Layout = {
        ...v2Layout,
        objects: v2Layout.objects.map(obj => {
          if ((obj.type === 'table' || obj.type === 'booth') && obj.properties?.tableId) {
            const currentTable = tableMap.get(obj.properties.tableId);
            if (currentTable) {
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

      onFloorplanLoaded?.({
        id: floorplan.id,
        version: floorplan.version,
        engine: floorplan.engine,
      });

      setLayout(v2Layout);
    } catch (err) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (!mountedRef.current) return;
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to load floorplan: ${msg}`);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const handleObjectClick = (objectId: string | null) => {
    if (!objectId || !layout) return;
    dismissHint();

    const object = layout.objects.find(o => o.id === objectId && (o.type === 'table' || o.type === 'booth'));
    if (!object) return;

    const tableId = object.properties?.tableId;
    if (!tableId) return;

    const table = tables.find(t => t.id === tableId);
    if (!table) return;

    // Joined-combo path: only engage when the party strictly exceeds this table's capacity.
    // matchesPartySize allows ±1 tolerance (e.g. a 6-seat table accepts parties of 5-6).
    // A party of 4 at a 6-seat table is not a match but also doesn't need a combo — normal
    // single-table rules apply (table shows red/capacity-mismatch, no combo offered).
    // Only parties larger than the table's hard capacity should be routed to joined combos.
    const partyExceedsTable = partySize > table.capacity;
    const allCombos = table.joinedCombinations || [];
    const hasCombos = allCombos.length > 0;

    if (partyExceedsTable && hasCombos) {
      // Party requires a joined setup — only consider combos that can actually seat the party.
      // Capacity-invalid combos are filtered here as defence-in-depth (they should already be
      // absent from joinedCombinations after the service-layer filter, but guard anyway).
      const capacityValidCombos = allCombos.filter(
        jc => jc.template.combined_capacity >= partySize
      );
      if (capacityValidCombos.length === 0) return; // no valid combo for this party — do nothing
      const availableCombos = capacityValidCombos.filter(jc => jc.available).map(jc => jc.template);
      const unavailableCombos = capacityValidCombos
        .filter(jc => !jc.available)
        .map(jc => ({
          template: jc.template,
          unavailableTableName: jc.unavailableTableName,
          nextAvailableTime: jc.nextAvailableTime,
        }));
      setComboPopup({ table, combos: availableCombos, unavailableCombos });
      return;
    }

    if (table.status === 'green' || table.status === 'yellow') {
      onTableSelect(table);
      return;
    }
    // Red table with no combo applicable — nothing to show
  };

  const tableStatusMap: Record<string, 'green' | 'yellow' | 'red'> = {};
  tables.forEach(table => {
    tableStatusMap[table.id] = table.status;
  });

  // Joined-table mode is only active when no valid single table can seat the party.
  // Single-table availability takes full priority — if any table is green and matches
  // the party size, joined mode is suppressed entirely.
  const joinedModeActive = useMemo(() => {
    if (onlineComboTableIds.size === 0) return false;
    const singleAvailable = tables.some(
      t => t.status === 'green' && matchesPartySize(t.capacity, partySize)
    );
    return !singleAvailable;
  }, [tables, partySize, onlineComboTableIds]);

  // Show "+" only when joined mode is active, party exceeds the table's own capacity,
  // AND at least one combo containing this table has sufficient combined capacity.
  const tableJoinableIds = useMemo(() => {
    if (!joinedModeActive) return undefined;
    const ids = new Set<string>();
    tables.forEach(t => {
      if (!onlineComboTableIds.has(t.id)) return;
      if (partySize <= t.capacity) return;
      // Only mark with "+" if a capacity-valid combo exists for this table
      const hasCapacityValidCombo = (t.joinedCombinations || []).some(
        jc => jc.template.combined_capacity >= partySize
      );
      if (hasCapacityValidCombo) {
        console.log('[JoinedPlus] table id match', { tableId: t.id, tableName: t.name, hasPlus: true });
        ids.add(t.id);
      }
    });
    return ids.size > 0 ? ids : undefined;
  }, [tables, partySize, onlineComboTableIds, joinedModeActive]);

  const recommendedObjectId = useMemo(() => {
    if (!layout) return null;
    return computeRecommendedObject(layout.objects, tables, partySize);
  }, [layout, tables, partySize]);

  const WINDOW_SEAT_THRESHOLD = 180;
  const windowSeatIds = useMemo(() => {
    if (!layout) return undefined;
    const windows = layout.objects.filter(o => o.type === 'window');
    if (windows.length === 0) return undefined;
    const ids = new Set<string>();
    layout.objects.forEach(obj => {
      if (obj.type !== 'table' && obj.type !== 'booth') return;
      const minDist = Math.min(...windows.map(w => {
        const wHalfW = (w.width || 0) / 2;
        const wHalfH = (w.height || 0) / 2;
        const dx = Math.max(0, Math.abs(obj.worldX - w.worldX) - wHalfW);
        const dy = Math.max(0, Math.abs(obj.worldY - w.worldY) - wHalfH);
        return Math.sqrt(dx * dx + dy * dy);
      }));
      if (minDist < WINDOW_SEAT_THRESHOLD) ids.add(obj.id);
    });
    return ids.size > 0 ? ids : undefined;
  }, [layout]);

  const windowViewDescriptionMap = useMemo(() => {
    if (!layout || !windowSeatIds) return undefined;
    const map: Record<string, string> = {};
    layout.objects.forEach(obj => {
      if ((obj.type === 'table' || obj.type === 'booth') && windowSeatIds.has(obj.id)) {
        const desc = obj.properties?.viewDescription as string | undefined;
        if (desc) map[obj.id] = desc;
      }
    });
    return Object.keys(map).length > 0 ? map : undefined;
  }, [layout, windowSeatIds]);

  const tagsMap = useMemo(() => {
    if (!layout) return undefined;
    const map: Record<string, string[]> = {};
    layout.objects.forEach(obj => {
      if ((obj.type === 'table' || obj.type === 'booth') && obj.properties?.tableId) {
        const tags: string[] = [];
        if (obj.type === 'booth') tags.push('Booth');
        if (obj.properties?.tags && Array.isArray(obj.properties.tags)) {
          tags.push(...obj.properties.tags);
        }
        if (tags.length > 0) map[obj.properties.tableId] = tags;
      }
    });
    return Object.keys(map).length > 0 ? map : undefined;
  }, [layout]);

  const tableUnavailableReasonMap = useMemo(() => {
    const map: Record<string, string> = {};
    tables.forEach(t => {
      if (t.status !== 'red') return;
      let label = 'Not available';
      if (t.detailed_reason === 'held_by_other') label = 'Being held';
      else if (t.detailed_reason === 'held_by_me') label = 'Your hold';
      else if (t.detailed_reason === 'booked_conflict') label = 'Already reserved';
      else if (t.detailed_reason === 'capacity_mismatch') label = `Seats ${t.capacity} — your party is ${partySize}`;
      else if (t.detailed_reason === 'past_time') label = 'Time passed';
      else if (t.detailed_reason === 'no_alternatives') label = 'No slots available';
      else if (t.reason) label = t.reason;
      map[t.id] = label;
    });
    return map;
  }, [tables, partySize]);

  const tableUnavailableTypeMap = useMemo(() => {
    const map: Record<string, 'booked' | 'size' | 'time' | 'held' | 'other'> = {};
    tables.forEach(t => {
      if (t.status !== 'red') return;
      if (t.detailed_reason === 'booked_conflict') map[t.id] = 'booked';
      else if (t.detailed_reason === 'capacity_mismatch') map[t.id] = 'size';
      else if (t.detailed_reason === 'past_time' || t.detailed_reason === 'no_alternatives') map[t.id] = 'time';
      else if (t.detailed_reason === 'held_by_other' || t.detailed_reason === 'held_by_me') map[t.id] = 'held';
      else map[t.id] = 'other';
    });
    return map;
  }, [tables]);

  const availableCount = useMemo(() => tables.filter(t => t.status === 'green').length, [tables]);
  const altCount = useMemo(() => tables.filter(t => t.status === 'yellow').length, [tables]);
  const totalBookable = availableCount + altCount;
  const showScarcity = totalBookable > 0 && totalBookable <= 3;
  const hasWindowSeats = windowSeatIds && windowSeatIds.size > 0;

  // Derive recommended table data for the mobile strip
  const recommendedTable = useMemo(() => {
    if (!recommendedObjectId || !layout) return null;
    const obj = layout.objects.find(o => o.id === recommendedObjectId);
    if (!obj?.properties?.tableId) return null;
    return tables.find(t => t.id === obj.properties!.tableId) || null;
  }, [recommendedObjectId, layout, tables]);

  const recommendedIsWindow = useMemo(() => {
    if (!recommendedObjectId || !windowSeatIds) return false;
    return windowSeatIds.has(recommendedObjectId);
  }, [recommendedObjectId, windowSeatIds]);

  const recommendedViewDesc = useMemo(() => {
    if (!recommendedObjectId || !windowViewDescriptionMap) return undefined;
    return windowViewDescriptionMap[recommendedObjectId];
  }, [recommendedObjectId, windowViewDescriptionMap]);

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center rounded-xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #18181f 0%, #111115 100%)' }}>
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-app-accent/60 border-t-app-accent rounded-full animate-spin mx-auto mb-3" />
          <div className="text-white/50 text-sm font-medium tracking-wide">Loading floor plan</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center rounded-xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #18181f 0%, #111115 100%)' }}>
        <div className="text-center max-w-sm px-6">
          <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center mx-auto mb-3 border border-red-500/25">
            <span className="text-red-400 text-lg font-bold">!</span>
          </div>
          <div className="text-white/70 font-semibold mb-1.5 text-sm">Unable to Load Floor Plan</div>
          <div className="text-white/35 text-xs mb-4 leading-relaxed">{error}</div>
          <button
            onClick={loadFloorplan}
            className="px-5 py-2 bg-app-accent/90 hover:bg-app-accent text-black font-semibold rounded-lg transition-colors text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const hasBookableObjects = layout?.objects.some(o => o.type === 'table' || o.type === 'booth');

  if (!layout || !hasBookableObjects) {
    return (
      <div className="w-full h-full flex items-center justify-center rounded-xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #18181f 0%, #111115 100%)' }}>
        <div className="text-center">
          <div className="text-white/40 font-medium mb-1.5 text-sm">No Floor Plan Available</div>
          <div className="text-white/25 text-xs">The restaurant layout will appear here once configured.</div>
        </div>
      </div>
    );
  }

  // Canvas overlay contents — shared between mobile and desktop
  const mapOverlays = (
    <>
      {showScarcity && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <div
            className="text-white/90 text-xs font-semibold px-4 py-1.5 rounded-full whitespace-nowrap border"
            style={{
              background: 'rgba(10,8,6,0.82)',
              backdropFilter: 'blur(10px)',
              borderColor: availableCount > 0 ? 'rgba(52,211,153,0.35)' : 'rgba(251,191,36,0.35)',
              boxShadow: availableCount > 0 ? '0 0 16px rgba(52,211,153,0.15)' : '0 0 16px rgba(251,191,36,0.15)',
              color: availableCount > 0 ? 'rgba(185,235,215,0.95)' : 'rgba(240,210,145,0.95)',
              animation: 'fadeIn 0.5s ease-out',
            }}
          >
            {availableCount > 0
              ? `Only ${availableCount} ${availableCount === 1 ? 'table' : 'tables'} available`
              : `${altCount} ${altCount === 1 ? 'table' : 'tables'} at nearby times`}
          </div>
        </div>
      )}

      {viewMode === '2d' && (
        <div className="absolute bottom-3 right-3 flex flex-col gap-1.5 z-10">
          <button
            onClick={() => floorplanRef.current?.zoomIn()}
            title="Zoom in"
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:opacity-90 active:scale-95"
            style={{ background: 'rgba(8,8,12,0.60)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.50)', boxShadow: '0 1px 8px rgba(0,0,0,0.3)' }}
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => floorplanRef.current?.zoomOut()}
            title="Zoom out"
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:opacity-90 active:scale-95"
            style={{ background: 'rgba(8,8,12,0.60)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.50)', boxShadow: '0 1px 8px rgba(0,0,0,0.3)' }}
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => floorplanRef.current?.reCenter()}
            title="Re-centre view"
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:opacity-90 active:scale-95"
            style={{ background: 'rgba(8,8,12,0.60)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.50)', boxShadow: '0 1px 8px rgba(0,0,0,0.3)' }}
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="absolute bottom-3 left-3 z-10">
        <button
          onClick={() => setShowLegend(v => !v)}
          className="flex items-center gap-1.5 h-7 px-2.5 rounded-full transition-all active:scale-95"
          style={{
            background: showLegend ? 'rgba(165,132,42,0.18)' : 'rgba(8,8,12,0.58)',
            backdropFilter: 'blur(10px)',
            border: showLegend ? '1px solid rgba(185,150,52,0.35)' : '1px solid rgba(255,255,255,0.07)',
            color: showLegend ? 'rgba(205,172,80,0.92)' : 'rgba(255,255,255,0.42)',
            boxShadow: '0 1px 8px rgba(0,0,0,0.3)',
          }}
        >
          <Info className="w-3.5 h-3.5" />
          <span className="text-xs font-medium">Legend</span>
        </button>

        {showLegend && (
          <div
            className="absolute bottom-10 left-0 rounded-2xl p-4 min-w-[220px]"
            style={{
              background: 'rgba(8,8,12,0.95)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255,255,255,0.09)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
              animation: 'fadeIn 0.18s ease-out',
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-white/35 text-[10px] font-semibold uppercase tracking-widest">What the colours mean</span>
              <button onClick={() => setShowLegend(false)} className="text-white/30 hover:text-white/60 transition-colors ml-3">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-5 h-5 rounded-full" style={{ background: '#1a1a24', border: '1.5px solid rgba(120,168,140,0.55)', boxShadow: '0 0 6px rgba(120,168,140,0.18)' }} />
                <div>
                  <div className="text-white/80 text-sm leading-tight">Available now</div>
                  <div className="text-white/35 text-xs">Tap to choose this table</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-5 h-5 rounded-full" style={{ background: '#1a1a24', border: '1.5px solid rgba(185,150,68,0.50)', boxShadow: '0 0 6px rgba(185,150,68,0.15)' }} />
                <div>
                  <div className="text-white/70 text-sm leading-tight">Different time available</div>
                  <div className="text-white/30 text-xs">Tap to see alternatives</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-5 h-5 rounded-full" style={{ background: '#0e0e12', opacity: 0.6, border: '1px solid rgba(60,60,65,0.35)' }} />
                <div>
                  <div className="text-white/28 text-sm leading-tight">Not available</div>
                  <div className="text-white/20 text-xs">Tap to see why</div>
                </div>
              </div>
              {hasWindowSeats && (
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full" style={{ background: 'rgba(8,16,26,0.9)', border: '1.5px solid rgba(100,145,175,0.45)' }} />
                  <div>
                    <div className="text-white/55 text-sm leading-tight">Window seat</div>
                    <div className="text-white/25 text-xs">Natural light &amp; view</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showHint && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
          style={{ animation: 'fadeIn 0.3s ease-out' }}
        >
          <div
            className="text-white/80 text-xs sm:text-sm px-5 py-2.5 rounded-full font-medium tracking-wide"
            style={{
              background: 'rgba(8,8,12,0.8)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.12)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
            }}
          >
            Drag to pan · Pinch or scroll to zoom · Tap to select
          </div>
        </div>
      )}

      {/* Joined-table combination popup */}
      {comboPopup && (
        <div
          className="absolute inset-0 flex items-end sm:items-center justify-center z-30 p-4"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', animation: 'fadeIn 0.18s ease-out' }}
          onClick={() => setComboPopup(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-5"
            style={{
              background: 'rgba(12,10,8,0.98)',
              border: '1px solid rgba(255,255,255,0.10)',
              boxShadow: '0 16px 48px rgba(0,0,0,0.7)',
              animation: 'fadeIn 0.2s ease-out',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-white/80 font-semibold text-base">
                {comboPopup.combos.length > 0 ? 'Join tables' : 'Tables unavailable'}
              </span>
              <button onClick={() => setComboPopup(null)} className="text-white/35 hover:text-white/60 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-white/40 text-xs mb-4 leading-relaxed">
              {comboPopup.combos.length > 0
                ? `${comboPopup.table.name} can be joined with nearby tables to accommodate your group.`
                : `These tables are not available at the selected time.`}
            </p>
            <div className="space-y-2">
              {/* Available combinations */}
              {comboPopup.combos.map(combo => {
                const tableNames = (combo.tables || []).map(t => t.name).join(' + ');
                return (
                  <button
                    key={combo.id}
                    onClick={() => {
                      const tableWithCombo: TableAvailability = {
                        ...comboPopup.table,
                        selectedCombination: combo,
                      };
                      setComboPopup(null);
                      onTableSelect(tableWithCombo);
                    }}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl transition-all active:scale-[0.98]"
                    style={{
                      background: 'rgba(185,150,52,0.10)',
                      border: '1px solid rgba(185,150,52,0.30)',
                    }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(185,150,52,0.18)', border: '1px solid rgba(185,150,52,0.40)' }}>
                        <Users className="w-3.5 h-3.5" style={{ color: 'rgba(215,180,90,0.90)' }} />
                      </div>
                      <div className="min-w-0 text-left">
                        <div className="text-sm font-semibold truncate" style={{ color: 'rgba(240,215,155,0.95)' }}>
                          {tableNames || combo.name}
                        </div>
                        <div className="text-xs" style={{ color: 'rgba(185,155,90,0.65)' }}>
                          Seats {combo.combined_capacity} combined
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(185,150,52,0.55)' }} />
                  </button>
                );
              })}

              {/* Unavailable combinations — show next available as a selectable option */}
              {comboPopup.unavailableCombos.map(({ template: combo, unavailableTableName, nextAvailableTime }) => {
                const tableNames = (combo.tables || []).map(t => t.name).join(' + ');
                return (
                  <div key={combo.id} className="space-y-2">
                    {/* Unavailable info card */}
                    <div
                      className="w-full flex items-start gap-3 px-4 py-3 rounded-xl"
                      style={{
                        background: 'rgba(120,40,40,0.18)',
                        border: '1px solid rgba(200,80,80,0.25)',
                      }}
                    >
                      <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5" style={{ background: 'rgba(200,80,80,0.15)', border: '1px solid rgba(200,80,80,0.30)' }}>
                        <Users className="w-3.5 h-3.5" style={{ color: 'rgba(220,120,120,0.90)' }} />
                      </div>
                      <div className="min-w-0 text-left">
                        <div className="text-sm font-semibold truncate" style={{ color: 'rgba(220,180,180,0.85)' }}>
                          {tableNames || combo.name}
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: 'rgba(200,120,120,0.70)' }}>
                          {unavailableTableName
                            ? `${unavailableTableName} is unavailable at this time.`
                            : `Not available at the selected time.`}
                        </div>
                      </div>
                    </div>

                    {/* Next available — selectable button that proceeds to booking */}
                    {nextAvailableTime && (
                      <button
                        onClick={() => {
                          const tableWithCombo: TableAvailability = {
                            ...comboPopup.table,
                            selectedCombination: combo,
                            alternativeTime: nextAvailableTime,
                            alternativeDirection: 'after',
                            suggested_start: (() => {
                              const [h, m] = nextAvailableTime.split(':').map(Number);
                              // Build a date using the table's existing suggested_start date or today
                              const base = comboPopup.table.suggested_start
                                ? new Date(comboPopup.table.suggested_start)
                                : new Date();
                              base.setHours(h, m, 0, 0);
                              return base.toISOString();
                            })(),
                          };
                          setComboPopup(null);
                          onTableSelect(tableWithCombo);
                        }}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl transition-all active:scale-[0.98]"
                        style={{
                          background: 'rgba(185,150,52,0.10)',
                          border: '1px solid rgba(185,150,52,0.30)',
                        }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(185,150,52,0.18)', border: '1px solid rgba(185,150,52,0.40)' }}>
                            <Users className="w-3.5 h-3.5" style={{ color: 'rgba(215,180,90,0.90)' }} />
                          </div>
                          <div className="min-w-0 text-left">
                            <div className="text-sm font-semibold" style={{ color: 'rgba(240,215,155,0.95)' }}>
                              {tableNames || combo.name} · {nextAvailableTime}
                            </div>
                            <div className="text-xs" style={{ color: 'rgba(185,155,90,0.65)' }}>
                              Next available · Seats {combo.combined_capacity}
                            </div>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(185,150,52,0.55)' }} />
                      </button>
                    )}
                  </div>
                );
              })}

              {comboPopup.combos.length === 0 && comboPopup.unavailableCombos.length === 0 && (
                <div className="text-white/40 text-xs text-center py-3">
                  No joined table options available.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );

  // Recommendation dock — rendered below the canvas on all screen sizes
  const recDock = recommendedTable ? (
    <button
      aria-label={`Recommended table: ${recommendedTable.name}, seats ${recommendedTable.capacity}${recommendedIsWindow ? ', window seat' : ''}, ${recommendedTable.status === 'green' ? 'available' : 'alternative time available'}. Tap to select.`}
      onClick={() => onTableSelect(recommendedTable)}
      className="flex-shrink-0 w-full flex items-center gap-3 px-3 sm:px-5 py-2.5 sm:py-3 active:opacity-80 transition-opacity"
      style={{
        background: 'linear-gradient(90deg, rgba(38,28,8,0.98) 0%, rgba(28,20,6,0.98) 100%)',
        borderTop: '1px solid rgba(205,170,62,0.28)',
        boxShadow: '0 -2px 12px rgba(0,0,0,0.35)',
      }}
    >
      <div
        className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center"
        style={{ background: 'rgba(205,170,62,0.15)', border: '1.5px solid rgba(205,170,62,0.60)' }}
      >
        <Star className="w-3.5 h-3.5 fill-current" style={{ color: 'rgba(225,195,80,0.92)' }} />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <div className="text-xs sm:text-sm font-semibold leading-tight" style={{ color: 'rgba(242,220,162,0.96)' }}>
          Recommended for your party
        </div>
        <div className="text-xs leading-tight mt-0.5" style={{ color: 'rgba(195,168,112,0.72)' }}>
          {recommendedTable.name} · Seats {recommendedTable.capacity}
          {recommendedIsWindow && <span> · {recommendedViewDesc || 'Window seat'}</span>}
        </div>
      </div>
      <div
        className="flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full"
        style={{
          background: recommendedTable.status === 'green' ? 'rgba(52,120,80,0.35)' : 'rgba(140,100,30,0.35)',
          border: recommendedTable.status === 'green' ? '1px solid rgba(80,180,120,0.35)' : '1px solid rgba(205,160,50,0.35)',
          color: recommendedTable.status === 'green' ? 'rgba(130,210,165,0.95)' : 'rgba(225,190,90,0.95)',
        }}
      >
        {recommendedTable.status === 'green' ? 'Available' : 'Alt. time'}
      </div>
    </button>
  ) : null;

  return (
    <div
      className="w-full h-full flex flex-col"
      onPointerDown={dismissHint}
      onTouchStart={dismissHint}
    >
      {/* Canvas area — flex-1 so it fills all space above the strip */}
      <div
        className="relative rounded-xl overflow-hidden"
        style={{ flex: '1 1 0', minHeight: 0, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)' }}
      >
        {viewMode === '2d' ? (
          <PremiumFloorplanCanvas
            layout={layout}
            rooms={rooms}
            renderMode="customer"
            selectedAreaId={areaId}
            fitToContentOnLoad={true}
            customerViewportBounds={layout.customerViewportBounds}
            suppressRecommendationBadge={!!recommendedObjectId}
            tableStatusMap={tableStatusMap}
            tableUnavailableReasonMap={tableUnavailableReasonMap}
            tableUnavailableTypeMap={tableUnavailableTypeMap}
            tableJoinableIds={tableJoinableIds}
            partySize={partySize}
            recommendedObjectId={recommendedObjectId}
            windowSeatIds={windowSeatIds}
            windowViewDescriptionMap={windowViewDescriptionMap}
            tagsMap={tagsMap}
            onObjectSelect={handleObjectClick}
            canvasRef={floorplanRef}
          />
        ) : (
          <IsometricFloorplanCanvas
            layout={layout}
            rooms={rooms}
            tableStatusMap={tableStatusMap}
            recommendedObjectId={recommendedObjectId}
            windowSeatIds={windowSeatIds}
            tagsMap={tagsMap}
            selectedAreaId={areaId}
            onObjectSelect={handleObjectClick}
          />
        )}
        {mapOverlays}
      </div>

      {/* Recommendation dock — sits below the canvas, never overlaid */}
      {recDock}
    </div>
  );
}
