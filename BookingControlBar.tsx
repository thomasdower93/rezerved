import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, Clock, Users, ChevronDown, ChevronUp, Check, RefreshCw } from 'lucide-react';

// ─── Shared portal-dropdown ───────────────────────────────────────────────────
//
// The outside-click handler uses mousedown. Without special handling, clicking
// an option fires: mousedown (outside-click closes portal) → click (option
// handler fires on now-unmounted node → no-op). Fix: track the portal div node
// and bail out of the outside-click handler when the target is inside it.

interface DropdownPortalProps {
  anchorRef: React.RefObject<HTMLElement>;
  portalNodeRef: React.MutableRefObject<HTMLDivElement | null>;
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  minWidth?: number;
}

function DropdownPortal({
  anchorRef,
  portalNodeRef,
  isOpen,
  onClose,
  children,
  minWidth = 200,
}: DropdownPortalProps) {
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, openUp: false });

  const reposition = useCallback(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const dropdownHeight = 320;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < dropdownHeight && rect.top > dropdownHeight;
    const width = Math.max(rect.width, minWidth);
    const rawLeft = rect.left;
    const maxLeft = window.innerWidth - width - 8;
    const left = Math.max(8, Math.min(rawLeft, maxLeft));
    setPos({ top: openUp ? rect.top : rect.bottom + 4, left, width, openUp });
  }, [anchorRef, minWidth]);

  useEffect(() => {
    if (!isOpen) return;
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [isOpen, reposition]);

  useEffect(() => {
    if (!isOpen) return;

    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      if (portalNodeRef.current?.contains(t)) return;
      onClose();
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    const tid = setTimeout(() => {
      document.addEventListener('mousedown', handler);
      document.addEventListener('keydown', keyHandler);
    }, 0);

    return () => {
      clearTimeout(tid);
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [isOpen, onClose, anchorRef, portalNodeRef]);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={portalNodeRef}
      style={{
        position: 'fixed',
        top: pos.openUp ? undefined : pos.top,
        bottom: pos.openUp ? window.innerHeight - pos.top : undefined,
        left: pos.left,
        width: pos.width,
        zIndex: 9999,
      }}
    >
      {children}
    </div>,
    document.body
  );
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getDateOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const tomorrowStr = new Date(today.getTime() + 86400000).toISOString().split('T')[0];
  for (let i = 0; i < 90; i++) {
    const d = new Date(today.getTime() + i * 86400000);
    const value = d.toISOString().split('T')[0];
    const month = d.toLocaleDateString('en-US', { month: 'short' });
    const dow = d.toLocaleDateString('en-US', { weekday: 'short' });
    const day = d.getDate();
    let label = `${dow}, ${month} ${day}`;
    if (value === todayStr) label = `Today, ${month} ${day}`;
    else if (value === tomorrowStr) label = `Tomorrow, ${month} ${day}`;
    options.push({ value, label });
  }
  return options;
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const tomorrowStr = new Date(today.getTime() + 86400000).toISOString().split('T')[0];
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  const day = d.getDate();
  if (dateStr === todayStr) return `Today, ${month} ${day}`;
  if (dateStr === tomorrowStr) return `Tomorrow, ${month} ${day}`;
  const dow = d.toLocaleDateString('en-US', { weekday: 'short' });
  return `${dow}, ${month} ${day}`;
}

function formatTimeDisplay(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const dh = h % 12 || 12;
  return `${dh}:${m.toString().padStart(2, '0')} ${ampm}`;
}

// ─── Shared dropdown panel ────────────────────────────────────────────────────
// Matches the DateSelector dropdown: dark-blur panel, app-border, rounded-xl, shadow-2xl

function DropdownPanel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      className="rounded-xl border border-app-border/40 shadow-2xl overflow-hidden"
      style={{
        background: 'rgba(20,18,16,0.98)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── Shared trigger button ────────────────────────────────────────────────────

interface TriggerProps {
  isOpen: boolean;
  onClick: () => void;
  anchorRef: React.RefObject<HTMLButtonElement>;
  icon: React.ReactNode;
  label: string;
}

function Trigger({ isOpen, onClick, anchorRef, icon, label }: TriggerProps) {
  return (
    <button
      ref={anchorRef}
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl transition-all duration-150 text-left flex-1 min-w-0 ${
        isOpen
          ? 'bg-app-accent/10 border border-app-accent/40'
          : 'bg-app-bg-tertiary border border-app-border hover:border-app-accent/30 hover:bg-app-accent/5'
      }`}
      style={{ cursor: 'pointer' }}
    >
      <span className="text-app-accent flex-shrink-0">{icon}</span>
      <span className="text-xs font-medium text-app-text truncate flex-1">{label}</span>
      <ChevronDown
        className={`w-3 h-3 flex-shrink-0 text-app-text-secondary transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
      />
    </button>
  );
}

// ─── DateDropdown ─────────────────────────────────────────────────────────────

interface DateDropdownProps {
  value: string;
  onChange: (date: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

function DateDropdown({ value, onChange, isOpen, onToggle, onClose }: DateDropdownProps) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const portalNodeRef = useRef<HTMLDivElement | null>(null);
  const options = getDateOptions();

  return (
    <>
      <Trigger
        isOpen={isOpen}
        onClick={onToggle}
        anchorRef={anchorRef}
        icon={<Calendar className="w-3.5 h-3.5" />}
        label={formatDateShort(value)}
      />

      <DropdownPortal
        anchorRef={anchorRef as React.RefObject<HTMLElement>}
        portalNodeRef={portalNodeRef}
        isOpen={isOpen}
        onClose={onClose}
        minWidth={260}
      >
        <DropdownPanel>
          <div style={{ maxHeight: 280, overflowY: 'auto' }} className="py-1.5">
            {options.map(opt => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onChange(opt.value); onClose(); }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                    isSelected
                      ? 'text-app-accent font-medium'
                      : 'text-app-text-secondary hover:text-app-text'
                  }`}
                  style={{
                    background: isSelected ? 'rgba(212,145,93,0.15)' : undefined,
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => {
                    if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)';
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) (e.currentTarget as HTMLElement).style.background = '';
                  }}
                >
                  {isSelected
                    ? <Check className="w-3.5 h-3.5 flex-shrink-0 text-app-accent" />
                    : <span className="w-3.5 h-3.5 flex-shrink-0" />}
                  {opt.label}
                </button>
              );
            })}
          </div>
        </DropdownPanel>
      </DropdownPortal>
    </>
  );
}

// ─── TimeDropdown ─────────────────────────────────────────────────────────────

interface TimeDropdownProps {
  value: string;
  onCommit: (time: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

function TimeDropdown({ value, onCommit, isOpen, onToggle, onClose }: TimeDropdownProps) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const portalNodeRef = useRef<HTMLDivElement | null>(null);
  const INTERVAL = 15;

  const parseTime = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return { h: isNaN(h) ? 19 : h, m: isNaN(m) ? 0 : m };
  };

  const [draft, setDraft] = useState(() => parseTime(value));

  useEffect(() => {
    if (!isOpen) setDraft(parseTime(value));
  }, [value, isOpen]);

  const isPM = draft.h >= 12;
  const displayH = draft.h % 12 || 12;

  const adjustH = (delta: number) => {
    setDraft(prev => {
      let nh = displayH + delta;
      if (nh > 12) nh = 1;
      if (nh < 1) nh = 12;
      const h24 = isPM ? (nh === 12 ? 12 : nh + 12) : (nh === 12 ? 0 : nh);
      return { ...prev, h: h24 };
    });
  };

  const adjustM = (delta: number) => {
    setDraft(prev => {
      let nm = prev.m + delta;
      if (nm >= 60) nm = 0;
      if (nm < 0) nm = 60 - INTERVAL;
      nm = Math.round(nm / INTERVAL) * INTERVAL;
      if (nm >= 60) nm = 0;
      return { ...prev, m: nm };
    });
  };

  const toggleAMPM = () => {
    setDraft(prev => ({ ...prev, h: prev.h >= 12 ? prev.h - 12 : prev.h + 12 }));
  };

  const handleDone = () => {
    const timeStr = `${draft.h.toString().padStart(2, '0')}:${draft.m.toString().padStart(2, '0')}`;
    onCommit(timeStr);
    onClose();
  };

  const spinBtn = 'w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-white/10 active:bg-white/15 cursor-pointer text-app-text-secondary hover:text-app-text';

  return (
    <>
      <Trigger
        isOpen={isOpen}
        onClick={onToggle}
        anchorRef={anchorRef}
        icon={<Clock className="w-3.5 h-3.5" />}
        label={formatTimeDisplay(value)}
      />

      <DropdownPortal
        anchorRef={anchorRef as React.RefObject<HTMLElement>}
        portalNodeRef={portalNodeRef}
        isOpen={isOpen}
        onClose={onClose}
        minWidth={220}
      >
        <DropdownPanel style={{ padding: '16px' }}>
          <div className="flex items-center justify-center gap-3 mb-4">
            {/* Hour */}
            <div className="flex flex-col items-center gap-1">
              <button type="button" onClick={() => adjustH(1)} className={spinBtn}>
                <ChevronUp className="w-4 h-4" />
              </button>
              <div
                className="w-13 h-11 flex items-center justify-center rounded-lg border border-app-border"
                style={{ width: 52, height: 44, background: 'rgba(255,255,255,0.06)' }}
              >
                <span className="text-xl font-bold text-app-text">
                  {displayH.toString().padStart(2, '0')}
                </span>
              </div>
              <button type="button" onClick={() => adjustH(-1)} className={spinBtn}>
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>

            <span className="text-xl font-bold text-app-text-tertiary">:</span>

            {/* Minute */}
            <div className="flex flex-col items-center gap-1">
              <button type="button" onClick={() => adjustM(INTERVAL)} className={spinBtn}>
                <ChevronUp className="w-4 h-4" />
              </button>
              <div
                className="flex items-center justify-center rounded-lg border border-app-border"
                style={{ width: 52, height: 44, background: 'rgba(255,255,255,0.06)' }}
              >
                <span className="text-xl font-bold text-app-text">
                  {draft.m.toString().padStart(2, '0')}
                </span>
              </div>
              <button type="button" onClick={() => adjustM(-INTERVAL)} className={spinBtn}>
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>

            {/* AM/PM */}
            <div className="flex flex-col gap-1 ml-1">
              {(['AM', 'PM'] as const).map(period => {
                const active = (period === 'PM') === isPM;
                return (
                  <button
                    key={period}
                    type="button"
                    onClick={toggleAMPM}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      active
                        ? 'text-white'
                        : 'text-app-text-secondary hover:text-app-text'
                    }`}
                    style={{
                      background: active ? 'rgb(var(--color-accent))' : 'rgba(255,255,255,0.06)',
                    }}
                  >
                    {period}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={handleDone}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 cursor-pointer bg-app-accent hover:bg-app-accent-hover text-white"
          >
            Done
          </button>
        </DropdownPanel>
      </DropdownPortal>
    </>
  );
}

// ─── GuestDropdown ────────────────────────────────────────────────────────────

interface GuestDropdownProps {
  value: number;
  onChange: (size: number) => void;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  min?: number;
  max?: number;
}

function GuestDropdown({ value, onChange, isOpen, onToggle, onClose, min = 1, max = 10 }: GuestDropdownProps) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const portalNodeRef = useRef<HTMLDivElement | null>(null);
  const options = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  return (
    <>
      <Trigger
        isOpen={isOpen}
        onClick={onToggle}
        anchorRef={anchorRef}
        icon={<Users className="w-3.5 h-3.5" />}
        label={`${value} ${value === 1 ? 'Guest' : 'Guests'}`}
      />

      <DropdownPortal
        anchorRef={anchorRef as React.RefObject<HTMLElement>}
        portalNodeRef={portalNodeRef}
        isOpen={isOpen}
        onClose={onClose}
        minWidth={160}
      >
        <DropdownPanel>
          <div style={{ maxHeight: 260, overflowY: 'auto' }} className="py-1.5">
            {options.map(size => {
              const isSelected = size === value;
              return (
                <button
                  key={size}
                  type="button"
                  onClick={() => { onChange(size); onClose(); }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                    isSelected
                      ? 'text-app-accent font-medium'
                      : 'text-app-text-secondary hover:text-app-text'
                  }`}
                  style={{
                    background: isSelected ? 'rgba(212,145,93,0.15)' : undefined,
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => {
                    if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)';
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) (e.currentTarget as HTMLElement).style.background = '';
                  }}
                >
                  {isSelected
                    ? <Check className="w-3.5 h-3.5 flex-shrink-0 text-app-accent" />
                    : <span className="w-3.5 h-3.5 flex-shrink-0" />}
                  {size} {size === 1 ? 'Guest' : 'Guests'}
                </button>
              );
            })}
          </div>
        </DropdownPanel>
      </DropdownPortal>
    </>
  );
}

// ─── BookingControlBar ────────────────────────────────────────────────────────

export interface BookingParams {
  date: string;
  time: string;
  partySize: number;
}

interface BookingControlBarProps {
  params: BookingParams;
  onParamsChange: (params: BookingParams) => void;
  isUpdating?: boolean;
  className?: string;
}

type OpenDropdown = 'date' | 'time' | 'guests' | null;

export function BookingControlBar({
  params,
  onParamsChange,
  isUpdating = false,
  className = '',
}: BookingControlBarProps) {
  const [open, setOpen] = useState<OpenDropdown>(null);

  const toggle = (name: OpenDropdown) =>
    setOpen(prev => (prev === name ? null : name));

  const close = () => setOpen(null);

  return (
    <div
      className={`flex items-center gap-2 p-2 rounded-2xl bg-app-bg-tertiary border border-app-border ${className}`}
    >
      <DateDropdown
        value={params.date}
        onChange={date => onParamsChange({ ...params, date })}
        isOpen={open === 'date'}
        onToggle={() => toggle('date')}
        onClose={close}
      />

      <div className="w-px self-stretch bg-app-border" />

      <TimeDropdown
        value={params.time}
        onCommit={time => onParamsChange({ ...params, time })}
        isOpen={open === 'time'}
        onToggle={() => toggle('time')}
        onClose={close}
      />

      <div className="w-px self-stretch bg-app-border" />

      <GuestDropdown
        value={params.partySize}
        onChange={partySize => onParamsChange({ ...params, partySize })}
        isOpen={open === 'guests'}
        onToggle={() => toggle('guests')}
        onClose={close}
      />

      {isUpdating && (
        <>
          <div className="w-px self-stretch bg-app-border" />
          <div className="flex items-center gap-1.5 px-2 flex-shrink-0">
            <RefreshCw className="w-3 h-3 animate-spin text-app-accent" />
            <span className="text-xs text-app-text-secondary">Updating…</span>
          </div>
        </>
      )}
    </div>
  );
}
