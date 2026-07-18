import React, { useEffect, useState, useRef, useCallback } from 'react';
import { TableAvailability, StructuralElement, TableCombinationTemplate } from '../lib/types';
import { supabase } from '../lib/supabase';
import { useMobile } from '../hooks/useMobile';
import { Link2, Users, X } from 'lucide-react';

interface CustomerTableMapNewProps {
  tables: TableAvailability[];
  onTableClick: (table: TableAvailability) => void;
  areaId?: string;
  partySize?: number;
}

interface PremiumTableProps {
  table: TableAvailability;
  onClick: () => void;
  isFocused: boolean;
  isMuted: boolean;
  isBestFit: boolean;
  showLabels: boolean;
  partySize?: number;
  isInSelectedCombination?: boolean;
}

function PremiumTable({ table, onClick, isFocused, isMuted, isBestFit, showLabels, partySize, isInSelectedCombination }: PremiumTableProps) {
  const [isHovered, setIsHovered] = useState(false);

  const getStatusColors = () => {
    if (isInSelectedCombination) {
      return {
        bg: 'bg-gradient-to-br from-blue-50 to-blue-100',
        border: 'border-blue-400',
        ring: 'ring-blue-400',
        shadow: 'shadow-blue-200/50',
        glow: 'shadow-blue-300/60'
      };
    }
    if (table.status === 'green') {
      return {
        bg: 'bg-gradient-to-br from-emerald-50 to-emerald-100',
        border: 'border-emerald-300',
        ring: 'ring-emerald-400',
        shadow: 'shadow-emerald-200/50',
        glow: 'shadow-emerald-300/60'
      };
    }
    if (table.status === 'yellow') {
      return {
        bg: 'bg-gradient-to-br from-amber-50 to-amber-100',
        border: 'border-amber-300',
        ring: 'ring-amber-400',
        shadow: 'shadow-amber-200/50',
        glow: 'shadow-amber-300/60'
      };
    }
    return {
      bg: 'bg-gradient-to-br from-slate-100 to-slate-200',
      border: 'border-slate-300',
      ring: 'ring-slate-400',
      shadow: 'shadow-slate-200/50',
      glow: 'shadow-slate-300/60'
    };
  };

  const colors = getStatusColors();
  const isClickable = table.status !== 'red' || (table.joinedCombinations?.some(c => c.available) ?? false);
  const isUnavailable = table.status === 'red' && !isClickable;

  const baseSize = 60;
  const width = baseSize * (table.scale_x ?? 1);
  const height = baseSize * (table.scale_y ?? 1);

  const shapeClass = table.shape === 'circle' ? 'rounded-full' : 'rounded-2xl';

  // Show + indicator only when table is in at least one active online combination
  const hasOnlineCombo = table.joinedCombinations && table.joinedCombinations.length > 0;

  // Capacity label: "6+" if has online combo, else "6"
  const capacityLabel = hasOnlineCombo
    ? `${table.capacity}+`
    : `${table.capacity}`;

  return (
    <div
      className={`absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ease-out
        ${isUnavailable ? 'opacity-35' : isMuted ? 'opacity-30 scale-95' : 'opacity-100'}
        ${isClickable ? 'cursor-pointer' : 'cursor-not-allowed'}
        ${isHovered && isClickable && !isFocused ? 'scale-110 z-30' : 'z-20'}
        ${isFocused || isInSelectedCombination ? 'scale-115 z-40' : ''}
      `}
      style={{
        left: `${table.pos_x}%`,
        top: `${table.pos_y}%`,
        width: `${width}px`,
        height: `${height}px`,
        transform: `translate(-50%, -50%) rotate(${table.rotation ?? 0}deg)`,
      }}
      onClick={onClick}
      onMouseEnter={() => !isUnavailable && setIsHovered(true)}
      onMouseLeave={() => !isUnavailable && setIsHovered(false)}
    >
      {isBestFit && (
        <div
          className={`absolute inset-0 ${shapeClass} border-2 border-blue-400 animate-pulse pointer-events-none`}
          style={{ transform: 'scale(1.3)' }}
        />
      )}

      <div
        className={`
          w-full h-full ${shapeClass} ${colors.bg} border-2 ${colors.border}
          transition-all duration-300 ease-out
          ${isHovered && isClickable && !isFocused ? `shadow-lg ${colors.glow}` : `shadow-md ${colors.shadow}`}
          ${isFocused || isInSelectedCombination ? `ring-4 ${colors.ring} ring-opacity-60 shadow-xl ${colors.glow}` : ''}
          flex items-center justify-center
          backdrop-blur-sm
          relative
        `}
        style={{
          boxShadow: isFocused || isInSelectedCombination
            ? `0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)`
            : isHovered && isClickable
            ? `0 8px 20px -4px rgba(0, 0, 0, 0.1), 0 4px 8px -4px rgba(0, 0, 0, 0.06)`
            : `0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05)`
        }}
      >
        {showLabels && (
          <div className="text-center select-none pointer-events-none">
            <div className={`text-xs font-semibold ${hasOnlineCombo ? 'text-amber-700' : 'text-slate-700'}`}>
              {capacityLabel}
            </div>
          </div>
        )}

        {/* + badge when has online combo and not showing labels */}
        {!showLabels && hasOnlineCombo && (
          <div
            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-amber-500/90 flex items-center justify-center pointer-events-none z-10"
            style={{ fontSize: 8, color: '#fff', fontWeight: 700 }}
          >
            +
          </div>
        )}

        {table.availability_status === 'held' && table.status === 'yellow' && (
          <div className="absolute -top-2 -right-2 bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-md pointer-events-none z-10">
            HELD
          </div>
        )}
        {table.availability_status === 'booked' && table.status === 'yellow' && (
          <div className="absolute -top-2 -right-2 bg-slate-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-md pointer-events-none z-10">
            BOOKED
          </div>
        )}
        {table.availability_status === 'booked' && table.status === 'red' && (
          <div className="absolute -top-2 -right-2 bg-slate-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-md pointer-events-none z-10">
            BOOKED
          </div>
        )}
        {table.is_held_by_me && (
          <div className="absolute -top-2 -right-2 bg-green-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-md pointer-events-none z-10">
            ON HOLD
          </div>
        )}
      </div>

      {(isHovered || isFocused) && (
        <div className="absolute -bottom-14 left-1/2 -translate-x-1/2 bg-slate-900/95 text-white px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap pointer-events-none shadow-xl backdrop-blur-sm z-50 max-w-[200px]">
          <div className="font-semibold">
            {table.name} · {capacityLabel} {table.capacity === 1 ? 'seat' : 'seats'}
          </div>
          {table.status === 'green' && !table.is_held_by_me && <div className="text-emerald-300 text-[10px] mt-0.5">Available</div>}
          {table.is_held_by_me && <div className="text-green-300 text-[10px] mt-0.5">On hold for you</div>}
          {table.status === 'yellow' && table.availability_status === 'held' && <div className="text-amber-300 text-[10px] mt-0.5">Held by another guest</div>}
          {table.status === 'yellow' && table.availability_status === 'booked' && <div className="text-amber-300 text-[10px] mt-0.5">Booked — Alternative times available</div>}
          {table.status === 'red' && !hasOnlineCombo && <div className="text-slate-400 text-[10px] mt-0.5">{table.reason || 'Not Available'}</div>}
          {hasOnlineCombo && <div className="text-amber-300 text-[10px] mt-0.5">Can be joined for larger parties</div>}
        </div>
      )}
    </div>
  );
}

function LightStructuralElements({ elements }: { elements: StructuralElement[] }) {
  return (
    <>
      {elements.map((element) => {
        const baseStyles = {
          position: 'absolute' as const,
          left: `${element.pos_x}%`,
          top: `${element.pos_y}%`,
          width: `${element.width}%`,
          height: `${element.height}%`,
          transform: `translate(-50%, -50%) rotate(${element.rotation || 0}deg)`,
        };

        if (element.type === 'wall') {
          return (
            <div
              key={element.id}
              className="border-2 border-slate-200 bg-slate-100/30 pointer-events-none rounded-sm"
              style={baseStyles}
            />
          );
        }

        if (element.type === 'window') {
          return (
            <div
              key={element.id}
              className="border-2 border-blue-200 bg-gradient-to-b from-blue-50/40 to-transparent pointer-events-none backdrop-blur-[1px] rounded-sm"
              style={baseStyles}
            />
          );
        }

        if (element.type === 'door') {
          return (
            <div
              key={element.id}
              className="border-2 border-slate-300 border-dashed bg-transparent pointer-events-none rounded-sm"
              style={baseStyles}
            />
          );
        }

        return null;
      })}
    </>
  );
}

// ── Joined combination popup ──────────────────────────────────────────────────

interface CombinationPopupProps {
  table: TableAvailability;
  partySize: number;
  onSelectCombination: (combo: TableCombinationTemplate) => void;
  onSelectSingle: () => void;
  onClose: () => void;
}

function CombinationPopup({ table, partySize, onSelectCombination, onSelectSingle, onClose }: CombinationPopupProps) {
  const availableCombos = (table.joinedCombinations || []).filter(c => c.available && c.template.combined_capacity >= partySize);
  const unavailableCombos = (table.joinedCombinations || []).filter(c => !c.available);
  const singleFits = table.capacity >= partySize - 1; // matchesPartySize logic

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <p className="font-semibold text-slate-900 text-sm">{table.name}</p>
            <p className="text-xs text-slate-500 mt-0.5">Seats {table.capacity} normally</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {/* Single table option */}
          {table.status === 'green' && (
            <button
              onClick={onSelectSingle}
              className="w-full text-left px-4 py-3 rounded-xl border-2 border-emerald-200 bg-emerald-50 hover:border-emerald-400 transition-colors"
            >
              <div className="flex items-center gap-2 mb-0.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-sm font-semibold text-slate-800">Book this table alone</span>
              </div>
              <p className="text-xs text-slate-500 ml-4">Seats {table.capacity} guests</p>
            </button>
          )}

          {/* Available combinations */}
          {availableCombos.map(c => (
            <button
              key={c.template.id}
              onClick={() => onSelectCombination(c.template)}
              className="w-full text-left px-4 py-3 rounded-xl border-2 border-blue-200 bg-blue-50 hover:border-blue-400 transition-colors"
            >
              <div className="flex items-center gap-2 mb-0.5">
                <Link2 className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                <span className="text-sm font-semibold text-slate-800">{c.template.name}</span>
              </div>
              <p className="text-xs text-slate-500 ml-5">
                {(c.template.tables || []).map(t => t.name).join(' + ')} · {c.template.combined_capacity} seats combined
              </p>
            </button>
          ))}

          {/* Unavailable combinations */}
          {unavailableCombos.map(c => (
            <div
              key={c.template.id}
              className="px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 opacity-60"
            >
              <div className="flex items-center gap-2 mb-0.5">
                <Link2 className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                <span className="text-sm font-semibold text-slate-600">{c.template.name}</span>
              </div>
              <p className="text-xs text-slate-400 ml-5">
                {c.unavailableTableName
                  ? `${c.unavailableTableName} is unavailable at this time`
                  : 'Not available at this time'}
              </p>
            </div>
          ))}

          {/* Party size too large for single, no combo */}
          {table.status !== 'green' && availableCombos.length === 0 && (
            <div className="px-4 py-3 rounded-xl border border-slate-200 bg-slate-50">
              <p className="text-xs text-slate-500">
                {unavailableCombos.length > 0
                  ? `The joined table setup needed for your party of ${partySize} is unavailable right now.`
                  : `This table cannot seat your party of ${partySize}.`}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function CustomerTableMapNew({ tables, onTableClick, areaId, partySize }: CustomerTableMapNewProps) {
  const [structuralElements, setStructuralElements] = useState<StructuralElement[]>([]);
  const [focusedTableId, setFocusedTableId] = useState<string | null>(null);
  const [bestFitTableId, setBestFitTableId] = useState<string | null>(null);
  const [initialHighlightDone, setInitialHighlightDone] = useState(false);
  const [comboPopupTable, setComboPopupTable] = useState<TableAvailability | null>(null);
  const [selectedComboId, setSelectedComboId] = useState<string | null>(null);
  const isMobile = useMobile();

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // IDs of tables highlighted as part of the selected combination
  const highlightedTableIds = React.useMemo(() => {
    if (!selectedComboId) return new Set<string>();
    const combo = tables
      .flatMap(t => t.joinedCombinations || [])
      .find(c => c.template.id === selectedComboId);
    return new Set((combo?.template.tables || []).map(t => t.id));
  }, [selectedComboId, tables]);

  useEffect(() => {
    if (areaId) loadStructuralElements();
  }, [areaId]);

  useEffect(() => {
    if (isMobile && tables.length > 0 && partySize) {
      const bestTable = findBestFitTable();
      if (bestTable) {
        setBestFitTableId(bestTable.id);
        if (!initialHighlightDone) {
          setTimeout(() => setBestFitTableId(null), 1000);
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
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    tables.forEach(table => {
      minX = Math.min(minX, table.pos_x);
      maxX = Math.max(maxX, table.pos_x);
      minY = Math.min(minY, table.pos_y);
      maxY = Math.max(maxY, table.pos_y);
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
      if (!error && data) setStructuralElements(data);
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
    const hasOnlineCombos = (table.joinedCombinations || []).length > 0;

    // If party size requires a joined combination, show popup
    if (hasOnlineCombos && partySize) {
      const singleFits = table.status === 'green' && table.capacity >= partySize - 1;
      const needsCombo = !singleFits;
      const hasAvailableCombo = (table.joinedCombinations || []).some(c => c.available && c.template.combined_capacity >= partySize);

      if (needsCombo || (hasOnlineCombos && (table.status === 'red' || hasAvailableCombo))) {
        setComboPopupTable(table);
        setFocusedTableId(table.id);
        return;
      }
    }

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

  const handleSelectSingle = () => {
    if (!comboPopupTable) return;
    setSelectedComboId(null);
    setComboPopupTable(null);
    setFocusedTableId(null);
    onTableClick(comboPopupTable);
  };

  const handleSelectCombination = (combo: TableCombinationTemplate) => {
    if (!comboPopupTable) return;
    setSelectedComboId(combo.id);
    setComboPopupTable(null);
    setFocusedTableId(null);
    // Pass the primary table with the selectedCombination attached
    onTableClick({ ...comboPopupTable, selectedCombination: combo });
  };

  return (
    <div className="w-full">
      <div className="w-full mx-auto max-w-4xl">
        <div
          ref={containerRef}
          className="bg-gradient-to-br from-amber-50/30 via-stone-50 to-slate-50 rounded-3xl border border-slate-200/60 p-4 sm:p-8 relative aspect-video overflow-hidden touch-none shadow-lg"
          style={{
            backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(251, 191, 36, 0.03) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(148, 163, 184, 0.03) 0%, transparent 50%)'
          }}
          onClick={handleMapClick}
        >
          <div
            ref={canvasRef}
            className="w-full h-full relative"
            style={{
              willChange: 'transform',
              transition: isMobile ? 'none' : 'transform 0.3s ease-out'
            }}
          >
            <LightStructuralElements elements={isMobile ? [] : structuralElements} />

            {tables.map((table) => {
              const isFocused = focusedTableId === table.id;
              const isMuted = isMobile && focusedTableId !== null && focusedTableId !== table.id;
              const isBestFit = !focusedTableId && bestFitTableId === table.id;
              const isInSelectedCombination = highlightedTableIds.has(table.id);

              return (
                <div key={table.id} data-table-marker>
                  <PremiumTable
                    table={table}
                    onClick={() => handleTableClick(table)}
                    isFocused={isFocused}
                    isMuted={!!isMuted}
                    isBestFit={isBestFit}
                    showLabels={!isMobile || isFocused}
                    partySize={partySize}
                    isInSelectedCombination={isInSelectedCombination}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {isMobile ? (
        <div className="mt-6 text-center">
          <p className="text-sm text-slate-600 leading-relaxed">
            Tap a table to see details
          </p>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-3 bg-white/80 backdrop-blur-sm rounded-xl p-4 shadow-sm border border-emerald-200/50">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-50 to-emerald-100 border-2 border-emerald-300 flex-shrink-0 shadow-sm" />
            <div>
              <div className="font-semibold text-slate-900 text-sm leading-snug">Available</div>
              <div className="text-xs text-slate-600 leading-relaxed">Book this table now</div>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-white/80 backdrop-blur-sm rounded-xl p-4 shadow-sm border border-amber-200/50">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-50 to-amber-100 border-2 border-amber-300 flex-shrink-0 shadow-sm" />
            <div>
              <div className="font-semibold text-slate-900 text-sm leading-snug">Alternative Time</div>
              <div className="text-xs text-slate-600 leading-relaxed">Different time available</div>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-white/80 backdrop-blur-sm rounded-xl p-4 shadow-sm border border-slate-200/50">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 border-2 border-slate-300 flex-shrink-0 shadow-sm opacity-75" />
            <div>
              <div className="font-semibold text-slate-900 text-sm leading-snug">Unavailable</div>
              <div className="text-xs text-slate-600 leading-relaxed">Cannot be booked</div>
            </div>
          </div>
        </div>
      )}

      {comboPopupTable && partySize && (
        <CombinationPopup
          table={comboPopupTable}
          partySize={partySize}
          onSelectCombination={handleSelectCombination}
          onSelectSingle={handleSelectSingle}
          onClose={() => { setComboPopupTable(null); setFocusedTableId(null); }}
        />
      )}
    </div>
  );
}
