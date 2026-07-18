import React, { useEffect, useState, useRef, useCallback } from 'react';
import { TableAvailability, StructuralElement } from '../lib/types';
import { TableMarker } from './TableMarker';
import { StructuralElements } from './StructuralElements';
import { supabase } from '../lib/supabase';
import { useMobile } from '../hooks/useMobile';
import { Circle, HelpCircle } from 'lucide-react';

interface CustomerTableMapProps {
  tables: TableAvailability[];
  onTableClick: (table: TableAvailability) => void;
  areaId?: string;
  partySize?: number;
}

export function CustomerTableMap({ tables, onTableClick, areaId, partySize }: CustomerTableMapProps) {
  const [structuralElements, setStructuralElements] = useState<StructuralElement[]>([]);
  const [focusedTableId, setFocusedTableId] = useState<string | null>(null);
  const [bestFitTableId, setBestFitTableId] = useState<string | null>(null);
  const [showLegend, setShowLegend] = useState(false);
  const [initialHighlightDone, setInitialHighlightDone] = useState(false);
  const isMobile = useMobile();

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (areaId) {
      loadStructuralElements();
    }
  }, [areaId]);

  useEffect(() => {
    if (isMobile && tables.length > 0 && partySize) {
      const bestTable = findBestFitTable();
      if (bestTable) {
        setBestFitTableId(bestTable.id);
        if (!initialHighlightDone) {
          setTimeout(() => {
            setBestFitTableId(null);
          }, 1000);
          setInitialHighlightDone(true);
        }
      }
    }
  }, [tables, partySize, isMobile, initialHighlightDone]);

  useEffect(() => {
    if (isMobile && canvasRef.current && containerRef.current && tables.length > 0) {
      applyAutoScale();
    }
  }, [isMobile, tables]);

  const findBestFitTable = useCallback((): TableAvailability | null => {
    if (!partySize) return null;

    const availableTables = tables.filter(t => t.status === 'green');
    if (availableTables.length === 0) return null;

    let bestMatch = availableTables[0];
    let minDiff = Math.abs(bestMatch.capacity - partySize);

    for (const table of availableTables) {
      const diff = Math.abs(table.capacity - partySize);
      if (diff < minDiff || (diff === minDiff && table.capacity >= partySize && table.capacity < bestMatch.capacity)) {
        bestMatch = table;
        minDiff = diff;
      }
    }

    return bestMatch;
  }, [tables, partySize]);

  const applyAutoScale = useCallback(() => {
    if (!containerRef.current || !canvasRef.current || tables.length === 0) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    tables.forEach(table => {
      const x = table.pos_x;
      const y = table.pos_y;

      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    });

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const contentCenterX = (minX + maxX) / 2;
    const contentCenterY = (minY + maxY) / 2;

    const padding = 15;
    const scaleX = contentWidth > 0 ? ((100 - padding * 2) / contentWidth) : 1;
    const scaleY = contentHeight > 0 ? ((100 - padding * 2) / contentHeight) : 1;
    const scale = Math.min(scaleX, scaleY, 1);

    const offsetX = 50 - contentCenterX;
    const offsetY = 50 - contentCenterY;

    canvasRef.current.style.transform = `translate(${offsetX}%, ${offsetY}%) scale(${scale})`;
    canvasRef.current.style.transformOrigin = 'center center';
  }, [tables]);

  const loadStructuralElements = async () => {
    if (!areaId) return;

    try {
      const { data, error } = await supabase
        .from('structural_elements')
        .select('*')
        .eq('area_id', areaId);

      if (!error && data) {
        setStructuralElements(data);
      }
    } catch (error) {
      console.error('Failed to load structural elements:', error);
    }
  };

  const handleMapClick = (e: React.MouseEvent) => {
    if (focusedTableId) {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-table-marker]')) {
        setFocusedTableId(null);
      }
    }
  };

  const handleTableClick = (table: TableAvailability) => {
    if (table.status === 'red') {
      setFocusedTableId(table.id);
      return;
    }

    if (isMobile) {
      if (focusedTableId === table.id) {
        onTableClick(table);
      } else {
        setFocusedTableId(table.id);
      }
    } else {
      onTableClick(table);
    }
  };

  const getAvailabilityText = (table: TableAvailability) => {
    if (table.status === 'green') return 'Available';
    if (table.status === 'yellow') return 'Alternative Time';
    return table.reason || 'Not Available';
  };

  return (
    <div className="w-full">
      <div className="w-full mx-auto max-w-4xl">
        <div
          ref={containerRef}
          className="bg-slate-50 rounded-2xl border border-slate-200 p-4 sm:p-8 relative aspect-video overflow-hidden touch-none shadow-sm"
          onClick={handleMapClick}
        >
          {focusedTableId && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white px-4 py-3 rounded-xl text-sm font-medium shadow-lg pointer-events-none max-w-xs text-center">
              {(() => {
                const focusedTable = tables.find(t => t.id === focusedTableId);
                if (!focusedTable) return null;
                const isRedTable = focusedTable.status === 'red';
                return (
                  <>
                    <div className="font-semibold mb-1 leading-snug">
                      {focusedTable.name} • {focusedTable.capacity} {focusedTable.capacity === 1 ? 'seat' : 'seats'}
                    </div>
                    {isRedTable ? (
                      <div className="text-xs text-slate-300 leading-relaxed">{focusedTable.reason || 'Not Available'}</div>
                    ) : (
                      <div className="text-xs text-slate-200 leading-relaxed">
                        {getAvailabilityText(focusedTable)}{isMobile ? ' • Tap again to book' : ''}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          <div
            ref={canvasRef}
            className="w-full h-full relative"
            style={{
              willChange: 'transform',
              transition: isMobile ? 'none' : 'transform 0.3s ease-out'
            }}
          >
            <StructuralElements
              elements={isMobile ? [] : structuralElements}
              selectedElementId={null}
              isStaffMode={false}
              isCustomerView={true}
            />

            {tables.map((table) => {
              const isFocused = focusedTableId === table.id;
              const isMuted = isMobile && focusedTableId && focusedTableId !== table.id;
              const isBestFit = !focusedTableId && bestFitTableId === table.id;
              const isRedTable = table.status === 'red';

              return (
                <div
                  key={table.id}
                  data-table-marker
                  className={`absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-200 z-10 cursor-pointer ${
                    isMuted ? 'opacity-40' : 'opacity-100'
                  } ${!isMobile && !isRedTable && !isFocused ? 'hover:scale-110' : ''}`}
                  style={{
                    left: `${table.pos_x}%`,
                    top: `${table.pos_y}%`,
                    minWidth: isMobile ? '48px' : undefined,
                    minHeight: isMobile ? '48px' : undefined,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTableClick(table);
                  }}
                >
                  {isBestFit && (
                    <div className="absolute inset-0 rounded-full border-2 border-blue-500 animate-pulse pointer-events-none" style={{ transform: 'scale(1.3)' }} />
                  )}
                  <TableMarker
                    name={table.name}
                    capacity={table.capacity}
                    shape={table.shape}
                    status={table.status}
                    scaleX={table.scale_x ?? 1}
                    scaleY={table.scale_y ?? 1}
                    rotation={table.rotation ?? 0}
                    showLabels={!isMobile || isFocused}
                    isFocused={isFocused}
                    isMuted={isMuted}
                    isCustomerView={true}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {isMobile ? (
        <div className="mt-6 text-center">
          <p className="text-sm text-slate-500 leading-relaxed">
            Tap a table to see details
          </p>
          {showLegend && (
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="flex flex-col items-center gap-2 bg-white rounded-lg p-3 shadow-sm border border-slate-100">
                <div className="relative">
                  <Circle className="w-6 h-6 fill-gray-800 text-gray-900 stroke-2" />
                  <div className="absolute -inset-1 rounded-full border-2 border-green-500" />
                </div>
                <div className="text-xs font-medium text-slate-700">Available</div>
              </div>
              <div className="flex flex-col items-center gap-2 bg-white rounded-lg p-3 shadow-sm border border-slate-100">
                <div className="relative">
                  <Circle className="w-6 h-6 fill-gray-800 text-gray-900 stroke-2" />
                  <div className="absolute -inset-1 rounded-full border-2 border-amber-500" />
                </div>
                <div className="text-xs font-medium text-slate-700">Alt. Time</div>
              </div>
              <div className="flex flex-col items-center gap-2 bg-white rounded-lg p-3 shadow-sm border border-slate-100">
                <Circle className="w-6 h-6 fill-gray-700 text-gray-700 stroke-2 opacity-85" />
                <div className="text-xs font-medium text-slate-700">Unavailable</div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-3 bg-white rounded-lg p-4 shadow-sm border border-slate-100">
            <div className="relative flex-shrink-0">
              <Circle className="w-8 h-8 fill-gray-800 text-gray-900 stroke-2" />
              <div className="absolute -inset-1 rounded-full border-2 border-green-500" />
            </div>
            <div>
              <div className="font-semibold text-slate-900 text-base leading-snug">Available</div>
              <div className="text-sm text-slate-500 leading-relaxed">Book this table now</div>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-white rounded-lg p-4 shadow-sm border border-slate-100">
            <div className="relative flex-shrink-0">
              <Circle className="w-8 h-8 fill-gray-800 text-gray-900 stroke-2" />
              <div className="absolute -inset-1 rounded-full border-2 border-amber-500" />
            </div>
            <div>
              <div className="font-semibold text-slate-900 text-base leading-snug">Alternative Time</div>
              <div className="text-sm text-slate-500 leading-relaxed">Different time available</div>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-white rounded-lg p-4 shadow-sm border border-slate-100">
            <Circle className="w-8 h-8 fill-gray-700 text-gray-700 stroke-2 opacity-85 flex-shrink-0" />
            <div>
              <div className="font-semibold text-slate-900 text-base leading-snug">Unavailable</div>
              <div className="text-sm text-slate-500 leading-relaxed">Cannot be booked</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
