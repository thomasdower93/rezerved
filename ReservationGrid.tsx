import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Users, Clock, Calendar, X, ChevronLeft, ChevronRight, Zap } from 'lucide-react';
import { Reservation, Table, Restaurant } from '../lib/types';

// ─── Public types ────────────────────────────────────────────────────────────

export interface ReservationGridProps {
  reservations: Reservation[];
  tables: Table[];
  restaurant: Restaurant | null;
  selectedDate: string;
  onReservationClick: (id: string) => void;
}

// ─── Layout constants ─────────────────────────────────────────────────────────

const SLOT_W = 76;       // px per 15-minute slot
const LABEL_W = 164;     // px for sticky left label column
const ROW_H = 68;        // px per table row
const COVER_ROW_H = 46;  // px for incoming covers row
const HEADER_H = 36;     // px for time header
const BLOCK_INSET = 4;   // top/bottom inset of block inside row
const SCROLL_STEP = 400; // px per Earlier/Later button click

// ─── Time helpers ─────────────────────────────────────────────────────────────

function localMins(isoStr: string): number {
  const d = new Date(isoStr);
  return d.getHours() * 60 + d.getMinutes();
}

function fmt12hm(h: number, m: number): string {
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function fmt12(isoStr: string): string {
  const d = new Date(isoStr);
  return fmt12hm(d.getHours(), d.getMinutes());
}

function slotKey(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ─── Style helpers ────────────────────────────────────────────────────────────

function getBlockColors(r: Reservation, isLinked: boolean) {
  const dim = isLinked ? 'opacity-50' : '';
  const dash = isLinked ? 'border-dashed' : 'border-solid';
  if (r.status === 'cancelled')
    return `bg-red-950/70 border-red-600/40 text-red-300 ${dim} ${dash}`;
  if (r.source === 'quick_visit')
    return `bg-teal-950/80 border-teal-500/60 text-teal-50 ${dim} ${dash}`;
  if (r.journey_stage === 'table_cleared')
    return `bg-emerald-950/80 border-emerald-500/60 text-emerald-100 ${dim} ${dash}`;
  if (r.journey_stage)
    return `bg-amber-950/80 border-amber-500/60 text-amber-100 ${dim} ${dash}`;
  return `bg-blue-950/80 border-blue-500/60 text-blue-50 ${dim} ${dash}`;
}

function getStatusLabel(r: Reservation): string {
  if (r.status === 'cancelled') return 'Cancelled';
  if (r.source === 'quick_visit') return 'Quick Visit';
  if (r.journey_stage === 'table_cleared') return 'Completed';
  if (r.journey_stage) return 'Seated';
  return 'Booked';
}

function getCoverCellClass(covers: number): string {
  if (covers <= 4) return 'text-blue-300 bg-blue-500/15 border border-blue-500/30';
  if (covers <= 10) return 'text-amber-300 bg-amber-500/15 border border-amber-500/35';
  return 'text-red-300 bg-red-500/15 border border-red-500/40';
}

function getPopoverStatusColor(r: Reservation): string {
  if (r.status === 'cancelled') return 'text-red-400';
  if (r.source === 'quick_visit') return 'text-teal-400';
  if (r.journey_stage === 'table_cleared') return 'text-emerald-400';
  if (r.journey_stage) return 'text-amber-400';
  return 'text-blue-400';
}

// ─── Tooltip state ────────────────────────────────────────────────────────────

interface TooltipState {
  reservationId: string;
  x: number;
  y: number;
}

// ─── Document-level wheel hook ────────────────────────────────────────────────
//
// Attaches a single { passive: false, capture: true } wheel listener to the
// document while the component is mounted. When a wheel event fires, it walks
// up from the event target to find the nearest element marked with
// data-reservation-grid-scroll="true". If found, and if that element has real
// horizontal overflow, the vertical deltaY is converted to scrollLeft movement
// and preventDefault() is called to suppress page scroll.
//
// This approach is immune to:
//   - ancestor overflow-hidden clipping the child's scrollWidth
//   - React's passive synthetic event system ignoring preventDefault()
//   - stale refs after date changes or conditional remounts
//   - the component being unmounted while switching dashboard views

function useDocumentWheelToGridScroll(selectedDate: string) {
  useEffect(() => {
    function handleWheel(e: WheelEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const scrollContainer = target.closest(
        '[data-reservation-grid-scroll="true"]'
      ) as HTMLElement | null;
      if (!scrollContainer) return;

      const canScrollH = scrollContainer.scrollWidth > scrollContainer.clientWidth;

      if (import.meta.env.DEV) {
        console.debug('[Grid wheel]', {
          selectedDate,
          scrollLeft: scrollContainer.scrollLeft,
          scrollWidth: scrollContainer.scrollWidth,
          clientWidth: scrollContainer.clientWidth,
          canScrollH,
          deltaY: e.deltaY,
          deltaX: e.deltaX,
        });
      }

      if (!canScrollH) return;
      // Let native horizontal trackpad swipes pass through.
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;

      e.preventDefault();
      scrollContainer.scrollLeft += e.deltaY;
    }

    document.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => document.removeEventListener('wheel', handleWheel, { capture: true });
  }, [selectedDate]);
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ReservationGrid({
  reservations,
  tables,
  restaurant,
  selectedDate,
  onReservationClick,
}: ReservationGridProps) {
  const [activePopover, setActivePopover] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Attach document-level wheel → horizontal scroll on every render cycle.
  useDocumentWheelToGridScroll(selectedDate);

  // Reset scroll to start of service whenever date changes.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, [selectedDate]);

  // ── Table name helper ───────────────────────────────────────────────────────

  const getTableName = useCallback((r: Reservation): string => {
    const primary = tables.find(t => t.id === r.table_id)?.name ?? 'Unknown';
    if (!r.joined_table_ids || r.joined_table_ids.length <= 1) return primary;
    const names = r.joined_table_ids
      .map(id => tables.find(t => t.id === id)?.name)
      .filter(Boolean) as string[];
    return names.length > 1 ? names.join(' + ') : primary;
  }, [tables]);

  // ── Derived lists ───────────────────────────────────────────────────────────

  const activeReservations = useMemo(
    () => reservations.filter(r => r.status !== 'cancelled'),
    [reservations]
  );
  const cancelledReservations = useMemo(
    () => reservations.filter(r => r.status === 'cancelled'),
    [reservations]
  );

  // ── Grid slot range ─────────────────────────────────────────────────────────
  //
  // Fixed 09:00–22:00 on every date regardless of opening hours or bookings.
  // 13 hours × 4 slots = 52 slots × 76px = 3952px — always wider than any
  // normal viewport, guaranteeing real horizontal overflow on every date.

  const GRID_START_MINS = 9 * 60;   // 09:00
  const GRID_END_MINS   = 22 * 60;  // 22:00 (timeline runs to 10 PM marker)

  const { gridStartMins, gridEndMins, allSlots } = useMemo(() => {
    const slots: Array<{ h: number; m: number }> = [];
    for (let cur = GRID_START_MINS; cur < GRID_END_MINS; cur += 15) {
      slots.push({ h: Math.floor(cur / 60), m: cur % 60 });
    }
    return { gridStartMins: GRID_START_MINS, gridEndMins: GRID_END_MINS, allSlots: slots };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Both width and minWidth set explicitly so the inner div never shrinks to
  // fit its container, guaranteeing scrollWidth > clientWidth at any viewport.
  const timelineW = allSlots.length * SLOT_W;

  // ── Pixel position helpers ──────────────────────────────────────────────────

  const blockLeft = (r: Reservation): number => {
    const rStart = localMins(r.start_time);
    return ((Math.max(rStart, gridStartMins) - gridStartMins) / 15) * SLOT_W;
  };

  const blockWidth = (r: Reservation): number => {
    const rStart = localMins(r.start_time);
    const rEnd   = r.end_time ? localMins(r.end_time) : rStart + 90;
    const clampedStart = Math.max(rStart, gridStartMins);
    const clampedEnd   = Math.min(rEnd,   gridEndMins);
    const mins = Math.max(clampedEnd - clampedStart, 15);
    return Math.max((mins / 15) * SLOT_W, SLOT_W * 0.8);
  };

  // ── Slot map: incoming covers ───────────────────────────────────────────────

  const slotMap = useMemo(() => {
    const map: Record<string, { covers: number; bookings: Reservation[] }> = {};
    for (const s of allSlots) map[slotKey(s.h, s.m)] = { covers: 0, bookings: [] };
    for (const r of activeReservations) {
      const d = new Date(r.start_time);
      const key = slotKey(d.getHours(), Math.floor(d.getMinutes() / 15) * 15);
      if (map[key]) {
        map[key].covers += r.party_size;
        map[key].bookings.push(r);
      }
    }
    return map;
  }, [allSlots, activeReservations]);

  // ── Summary stats ───────────────────────────────────────────────────────────

  const { totalCovers, totalBookings, peakLabel, peakCovers } = useMemo(() => {
    const tc = activeReservations.reduce((s, r) => s + r.party_size, 0);
    const tb = activeReservations.length;
    let pk = '', pc = 0;
    for (const [k, v] of Object.entries(slotMap)) {
      if (v.covers > pc) { pc = v.covers; pk = k; }
    }
    const pl = pk
      ? (() => { const [hh, mm] = pk.split(':').map(Number); return fmt12hm(hh, mm); })()
      : null;
    return { totalCovers: tc, totalBookings: tb, peakLabel: pl, peakCovers: pc };
  }, [activeReservations, slotMap]);

  // ── Table ordering ──────────────────────────────────────────────────────────

  const sortedTables = useMemo(
    () => [...tables].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    [tables]
  );

  // ── Unassigned reservations ─────────────────────────────────────────────────

  const unassigned = useMemo(
    () => reservations.filter(r => !r.table_id || !tables.find(t => t.id === r.table_id)),
    [reservations, tables]
  );

  // ── Manual scroll buttons ───────────────────────────────────────────────────

  const scrollBy = useCallback((delta: number) => {
    if (scrollRef.current) scrollRef.current.scrollLeft += delta;
  }, []);

  // ── Close popover / tooltip on outside click ────────────────────────────────

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActivePopover(null);
        setTooltip(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Reservation block renderer ──────────────────────────────────────────────

  const getAccentColor = (r: Reservation) => {
    if (r.status === 'cancelled') return 'bg-red-500/70';
    if (r.source === 'quick_visit') return 'bg-teal-400/80';
    if (r.journey_stage === 'table_cleared') return 'bg-emerald-400/80';
    if (r.journey_stage) return 'bg-amber-400/80';
    return 'bg-blue-400/80';
  };

  const renderBlock = (r: Reservation, isLinked = false) => {
    const left      = blockLeft(r);
    const width     = blockWidth(r);
    const tableName = getTableName(r);
    const blockH    = ROW_H - BLOCK_INSET * 2;
    // Progressive content based on available width
    const showCovers = width >= SLOT_W * 1.2;
    const showTime   = width >= SLOT_W * 2;
    const showTable  = width >= SLOT_W * 2.8;
    const colors     = getBlockColors(r, isLinked);
    const accent     = getAccentColor(r);

    return (
      <button
        key={r.id + (isLinked ? '-linked' : '')}
        style={{ position: 'absolute', left, top: BLOCK_INSET, width, height: blockH, zIndex: isLinked ? 1 : 2 }}
        onClick={() => { setTooltip(null); onReservationClick(r.id); }}
        onMouseEnter={(e) => {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setTooltip({ reservationId: r.id, x: rect.left, y: rect.bottom + 6 });
        }}
        onMouseLeave={() => setTooltip(null)}
        className={`rounded-md border text-left cursor-pointer transition-all overflow-hidden
          hover:brightness-125 hover:scale-[1.01] active:scale-[0.99] ${colors}`}
        title={`${r.customer_name} · ${r.party_size} covers · ${fmt12(r.start_time)}${r.end_time ? ' – ' + fmt12(r.end_time) : ''} · ${tableName}`}
      >
        {/* Colored left accent stripe */}
        <div className="flex h-full">
          <div className={`w-1 flex-shrink-0 ${accent}`} />
          <div className="flex-1 px-2 py-1 flex flex-col justify-center gap-px overflow-hidden">
            {isLinked ? (
              <>
                <span className="text-[10px] font-medium opacity-60 truncate leading-tight">Linked</span>
                <span className="text-[11px] font-bold truncate leading-tight">{r.customer_name}</span>
                {showTable && <span className="text-[10px] opacity-50 truncate leading-tight">{tableName}</span>}
              </>
            ) : r.source === 'quick_visit' ? (
              <>
                <div className="flex items-center justify-between gap-1 min-w-0">
                  <span className="flex items-center gap-1 text-[11px] font-bold leading-tight truncate flex-1">
                    <Zap className="w-2.5 h-2.5 flex-shrink-0 text-teal-400" />
                    {r.customer_name === 'Quick Visit' ? 'Quick Visit' : r.customer_name}
                  </span>
                  {showCovers && (
                    <span className="flex-shrink-0 flex items-center gap-0.5 text-[10px] font-bold opacity-85 tabular-nums">
                      <Users className="w-2.5 h-2.5" />{r.party_size}
                    </span>
                  )}
                </div>
                {showTime && (
                  <div className="text-[10px] opacity-70 tabular-nums truncate leading-tight">
                    {fmt12(r.start_time)}{r.end_time ? `–${fmt12(r.end_time)}` : ''}
                  </div>
                )}
                {showTable && tableName && (
                  <div className="text-[10px] opacity-55 truncate leading-tight">{tableName}</div>
                )}
              </>
            ) : (
              <>
                {/* Row 1: name + party size */}
                <div className="flex items-center justify-between gap-1 min-w-0">
                  <span className="text-[12px] font-bold leading-tight truncate flex-1">{r.customer_name}</span>
                  {showCovers && (
                    <span className="flex-shrink-0 flex items-center gap-0.5 text-[10px] font-bold opacity-85 tabular-nums">
                      <Users className="w-2.5 h-2.5" />{r.party_size}
                    </span>
                  )}
                </div>
                {/* Row 2: time range */}
                {showTime && (
                  <div className="text-[10px] opacity-70 tabular-nums truncate leading-tight">
                    {fmt12(r.start_time)}{r.end_time ? `–${fmt12(r.end_time)}` : ''}
                  </div>
                )}
                {/* Row 3: table */}
                {showTable && tableName && (
                  <div className="text-[10px] opacity-55 truncate leading-tight">{tableName}</div>
                )}
              </>
            )}
          </div>
        </div>
      </button>
    );
  };

  // ── Tooltip reservation ─────────────────────────────────────────────────────

  const tooltipReservation = tooltip
    ? reservations.find(r => r.id === tooltip.reservationId)
    : null;

  // ── No tables ───────────────────────────────────────────────────────────────

  if (tables.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center">
          <Calendar className="w-7 h-7 text-slate-600" />
        </div>
        <p className="text-slate-400 font-medium">No tables configured yet</p>
        <p className="text-sm text-slate-600">Add tables in Table Layout to use Grid View.</p>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div ref={containerRef} className="space-y-4">

      {/* Summary + scroll controls */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="text-sm text-slate-300">
            <span className="font-bold text-white tabular-nums">{totalCovers}</span>
            <span className="text-slate-500 ml-1">covers</span>
          </span>
        </div>
        <div className="w-px h-4 bg-slate-700 hidden sm:block" />
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="text-sm text-slate-300">
            <span className="font-bold text-white tabular-nums">{totalBookings}</span>
            <span className="text-slate-500 ml-1">{totalBookings === 1 ? 'booking' : 'bookings'}</span>
          </span>
        </div>
        {peakLabel && peakCovers > 0 && (
          <>
            <div className="w-px h-4 bg-slate-700 hidden sm:block" />
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span className="text-sm text-slate-300">
                Peak: <span className="font-bold text-amber-300">{peakLabel}</span>
                <span className="text-slate-500 ml-1">· {peakCovers} covers</span>
              </span>
            </div>
          </>
        )}
        {cancelledReservations.length > 0 && (
          <>
            <div className="w-px h-4 bg-slate-700 hidden sm:block" />
            <span className="text-sm text-slate-500">
              <span className="tabular-nums">{cancelledReservations.length}</span> cancelled
            </span>
          </>
        )}

        {/* Earlier / Later scroll buttons */}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => scrollBy(-SCROLL_STEP)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-700 border border-slate-700 transition-colors"
            title="Scroll timeline earlier"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Earlier
          </button>
          <button
            onClick={() => scrollBy(SCROLL_STEP)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-700 border border-slate-700 transition-colors"
            title="Scroll timeline later"
          >
            Later
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="rounded-xl border border-slate-700 bg-slate-900/50" style={{ overflowX: 'clip', overflowY: 'visible' }}>
        <div className="flex">

          {/* ── Sticky left label column ──────────────────────────────────────── */}
          <div
            className="flex-shrink-0 z-30 border-r-2 border-slate-700"
            style={{ width: LABEL_W, background: '#0f172a' }}
          >
            <div
              className="flex items-end pb-2 px-4 border-b-2 border-slate-700"
              style={{ height: HEADER_H, background: '#0f172a' }}
            >
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Table</span>
            </div>
            <div
              className="flex flex-col justify-center px-4 border-b-2 border-slate-600"
              style={{ height: COVER_ROW_H, background: '#0f172a' }}
            >
              <span className="text-xs font-bold text-slate-200 leading-tight">Incoming Covers</span>
              <span className="text-[10px] text-slate-500 leading-tight mt-0.5">Arrivals · 15 min</span>
            </div>
            {unassigned.length > 0 && (
              <div
                className="flex flex-col justify-center px-4 border-b border-slate-700/70"
                style={{ height: ROW_H, background: '#0f172a' }}
              >
                <span className="text-xs font-bold text-amber-400/80 leading-tight">Unassigned</span>
                <span className="text-[10px] text-slate-500 mt-0.5">No table set</span>
              </div>
            )}
            {sortedTables.map((table, tIdx) => (
              <div
                key={table.id}
                className="flex flex-col justify-center px-4 border-b border-slate-700/50"
                style={{
                  height: ROW_H,
                  background: tIdx % 2 === 0 ? '#0f172a' : 'rgba(15,23,42,0.85)',
                }}
              >
                <span className="text-[13px] font-bold text-slate-100 leading-tight truncate">{table.name}</span>
                <span className="text-[10px] text-slate-500 mt-0.5">
                  {table.capacity} seat{table.capacity !== 1 ? 's' : ''}
                </span>
              </div>
            ))}
          </div>

          {/* ── Horizontally scrollable timeline ─────────────────────────────── */}
          {/*
            data-reservation-grid-scroll="true" marks this as the target for
            the document-level wheel handler. scrollLeft is manipulated directly
            there, so it works regardless of ancestor overflow rules.
          */}
          <div
            ref={scrollRef}
            data-reservation-grid-scroll="true"
            className="flex-1 overflow-x-auto"
            style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
          >
            {/* Both width and minWidth set to the same fixed pixel value.
                This guarantees scrollWidth > clientWidth on every date,
                including empty days and dates with only a few bookings. */}
            <div style={{ width: timelineW, minWidth: timelineW, position: 'relative' }}>

              {/* Time header */}
              <div
                className="flex border-b border-slate-700/80 sticky top-0 z-20"
                style={{ height: HEADER_H, background: '#0f172a' }}
              >
                {allSlots.map(({ h, m }) => {
                  const isHour     = m === 0;
                  const isHalfHour = m === 30;
                  const label = isHour
                    ? `${h % 12 || 12}${h >= 12 ? 'p' : 'a'}`
                    : isHalfHour
                      ? ':30'
                      : `:${m.toString().padStart(2, '0')}`;
                  return (
                    <div
                      key={slotKey(h, m)}
                      style={{ width: SLOT_W, flexShrink: 0 }}
                      className={`flex items-end pb-1.5 border-r
                        ${isHour ? 'border-r-slate-600 justify-start pl-1.5' : 'border-r-slate-700/25 justify-end pr-1'}`}
                    >
                      <span className={`tabular-nums leading-none
                        ${isHour      ? 'text-[11px] font-bold text-slate-100'
                        : isHalfHour  ? 'text-[9px] font-medium text-slate-500'
                        :               'text-[8px] font-normal text-slate-700'}`}
                      >
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Incoming Covers row */}
              <div
                className="flex border-b-2 border-slate-600 sticky z-10"
                style={{ top: HEADER_H, height: COVER_ROW_H, background: '#0f172a' }}
              >
                {allSlots.map(({ h, m }) => {
                  const key      = slotKey(h, m);
                  const slot     = slotMap[key];
                  const covers   = slot?.covers ?? 0;
                  const bookings = slot?.bookings ?? [];
                  const isOpen   = activePopover === `covers-${key}`;
                  const isHour   = m === 0;

                  return (
                    <div
                      key={key}
                      style={{ width: SLOT_W, flexShrink: 0, position: 'relative' }}
                      className={`flex items-center justify-center border-r px-1 ${isHour ? 'border-r-slate-600' : 'border-r-slate-700/30'}`}
                    >
                      {covers > 0 ? (
                        <button
                          onClick={() => setActivePopover(isOpen ? null : `covers-${key}`)}
                          className={`w-full rounded-lg px-1 py-1.5 flex flex-col items-center gap-0.5 transition-all hover:brightness-125 ${getCoverCellClass(covers)}`}
                        >
                          <span className="text-sm font-bold tabular-nums leading-none">{covers}</span>
                          <span className="text-[9px] opacity-70 leading-none whitespace-nowrap">
                            {bookings.length} bkg{bookings.length !== 1 ? 's' : ''}
                          </span>
                        </button>
                      ) : (
                        <span className="text-slate-700 select-none">·</span>
                      )}
                      {isOpen && (
                        <div
                          className="absolute left-0 top-full mt-1 z-50 w-72 rounded-xl border border-slate-600 shadow-2xl shadow-black/60 overflow-hidden"
                          style={{ background: '#1e293b' }}
                        >
                          <div className="px-3 py-2 border-b border-slate-700 flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-200">
                              {fmt12hm(h, m)}
                              <span className="text-slate-500 ml-2">· {covers} covers</span>
                            </span>
                            <button onClick={() => setActivePopover(null)} className="text-slate-500 hover:text-slate-300 transition-colors">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="divide-y divide-slate-700/50 max-h-72 overflow-y-auto">
                            {bookings.map(r => (
                              <button
                                key={r.id}
                                onClick={() => { setActivePopover(null); onReservationClick(r.id); }}
                                className="w-full text-left px-3 py-3 hover:bg-slate-700/40 transition-colors"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <span className="text-sm font-semibold text-white leading-snug">{r.customer_name}</span>
                                  <span className="flex-shrink-0 flex items-center gap-1 text-xs text-slate-400 tabular-nums">
                                    <Users className="w-3 h-3" />{r.party_size}
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                  <span className="text-xs text-slate-400 tabular-nums">{fmt12(r.start_time)}</span>
                                  <span className="text-slate-600">·</span>
                                  <span className="text-xs text-slate-400">{getTableName(r)}</span>
                                  <span className="text-slate-600">·</span>
                                  <span className={`text-xs font-medium ${getPopoverStatusColor(r)}`}>
                                    {getStatusLabel(r)}
                                  </span>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Unassigned row */}
              {unassigned.length > 0 && (
                <div
                  className="border-b border-slate-700/70 relative"
                  style={{ height: ROW_H, background: 'rgba(251,191,36,0.025)' }}
                >
                  <HourDividers allSlots={allSlots} slotW={SLOT_W} />
                  {unassigned.map(r => renderBlock(r, false))}
                </div>
              )}

              {/* Table rows */}
              {sortedTables.map((table, tIdx) => {
                const primaryReservations = reservations.filter(r => r.table_id === table.id);
                const linkedReservations  = reservations.filter(r =>
                  r.table_id !== table.id && r.joined_table_ids?.includes(table.id)
                );
                return (
                  <div
                    key={table.id}
                    className="border-b border-slate-700/50 relative"
                    style={{
                      height: ROW_H,
                      background: tIdx % 2 === 0 ? 'transparent' : 'rgba(15,23,42,0.6)',
                    }}
                  >
                    <HourDividers allSlots={allSlots} slotW={SLOT_W} />
                    {primaryReservations.map(r => renderBlock(r, false))}
                    {linkedReservations.map(r => renderBlock(r, true))}
                  </div>
                );
              })}

            </div>
          </div>
        </div>
      </div>

      {/* Hover tooltip */}
      {tooltip && tooltipReservation && (
        <BookingTooltip
          ref={tooltipRef}
          reservation={tooltipReservation}
          tableName={getTableName(tooltipReservation)}
          anchorX={tooltip.x}
          anchorY={tooltip.y}
        />
      )}
    </div>
  );
}

// ─── HourDividers ─────────────────────────────────────────────────────────────

function HourDividers({ allSlots, slotW }: { allSlots: Array<{ h: number; m: number }>; slotW: number }) {
  return (
    <div className="absolute inset-0 flex pointer-events-none">
      {allSlots.map(({ h, m }) => (
        <div
          key={slotKey(h, m)}
          style={{ width: slotW, flexShrink: 0 }}
          className={`h-full border-r ${m === 0 ? 'border-r-slate-600/70' : 'border-r-slate-700/20'}`}
        />
      ))}
    </div>
  );
}

// ─── BookingTooltip ───────────────────────────────────────────────────────────

interface BookingTooltipProps {
  reservation: Reservation;
  tableName: string;
  anchorX: number;
  anchorY: number;
}

const BookingTooltip = React.forwardRef<HTMLDivElement, BookingTooltipProps>(
  ({ reservation: r, tableName, anchorX, anchorY }, ref) => {
    const vw = window.innerWidth;
    const tooltipW = 260;
    const left = Math.min(anchorX, vw - tooltipW - 8);

    return (
      <div
        ref={ref}
        className="fixed z-[9999] rounded-xl border border-slate-600 shadow-2xl shadow-black/70 overflow-hidden pointer-events-none"
        style={{ left, top: anchorY, width: tooltipW, background: '#1e293b' }}
      >
        <div className="px-3 py-3">
          <div className="flex items-start justify-between gap-2 mb-2">
            <span className="text-sm font-bold text-white leading-snug">{r.customer_name}</span>
            <span className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold text-slate-300 tabular-nums">
              <Users className="w-3 h-3" />{r.party_size}
            </span>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Clock className="w-3 h-3 text-slate-500 flex-shrink-0" />
              <span className="text-xs text-slate-300 tabular-nums">
                {fmt12(r.start_time)}{r.end_time ? ` – ${fmt12(r.end_time)}` : ''}
              </span>
            </div>
            {tableName && <div className="text-xs text-slate-400 pl-5">{tableName}</div>}
            {r.customer_phone && <div className="text-xs text-slate-500 pl-5 tabular-nums">{r.customer_phone}</div>}
            {r.reservation_code && <div className="text-xs text-slate-600 font-mono pl-5">{r.reservation_code}</div>}
            <div className="pt-1">
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                r.status === 'cancelled'              ? 'bg-red-500/15 text-red-400'
                : r.journey_stage === 'table_cleared' ? 'bg-emerald-500/15 text-emerald-400'
                : r.journey_stage                     ? 'bg-amber-500/15 text-amber-400'
                :                                       'bg-blue-500/15 text-blue-400'
              }`}>
                {r.status === 'cancelled'              ? 'Cancelled'
                  : r.journey_stage === 'table_cleared' ? 'Completed'
                  : r.journey_stage                     ? 'Seated'
                  :                                       'Booked'}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }
);
BookingTooltip.displayName = 'BookingTooltip';
