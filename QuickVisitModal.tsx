import React, { useState, useEffect, useMemo } from 'react';
import { X, Zap, Users, Clock, AlertTriangle, CheckCircle2, ChevronDown } from 'lucide-react';
import { Table, Reservation } from '../lib/types';
import { supabase } from '../lib/supabase';
import { createReservation } from '../services/reservations';

// ─── Types ────────────────────────────────────────────────────────────────────

interface QuickVisitModalProps {
  restaurantId: string;
  tables: Table[];
  onClose: () => void;
  onCreated: () => void;
}

interface ConflictInfo {
  hasConflict: boolean;
  nextBookingTime: string | null;
}

const DURATION_OPTIONS = [
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '45 min', value: 45 },
  { label: '60 min', value: 60 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLocalDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getNowTime() {
  const now = new Date();
  // Round up to next 5-minute mark so it's never in the past
  const mins = Math.ceil((now.getMinutes() + 1) / 5) * 5;
  const adjusted = new Date(now);
  adjusted.setMinutes(mins);
  adjusted.setSeconds(0);
  return `${String(adjusted.getHours()).padStart(2, '0')}:${String(adjusted.getMinutes() % 60).padStart(2, '0')}`;
}

function addMinutesToTime(timeStr: string, minutes: number): string {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function fmt12(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function timeToMins(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function isoToTimeStr(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ─── Conflict checking ────────────────────────────────────────────────────────

async function checkTableConflict(
  restaurantId: string,
  tableId: string,
  date: string,
  startTime: string,
  durationMins: number,
): Promise<ConflictInfo> {
  const startMins = timeToMins(startTime);
  const endMins   = startMins + durationMins;

  // Load all reservations for this table on this date
  const dayStart = `${date}T00:00:00`;
  const dayEnd   = `${date}T23:59:59`;

  const { data } = await supabase
    .from('reservations')
    .select('start_time, end_time, status')
    .eq('restaurant_id', restaurantId)
    .eq('table_id', tableId)
    .neq('status', 'cancelled')
    .gte('start_time', dayStart)
    .lte('start_time', dayEnd)
    .order('start_time', { ascending: true });

  if (!data || data.length === 0) return { hasConflict: false, nextBookingTime: null };

  let hasConflict = false;
  let nextBookingTime: string | null = null;

  for (const r of data as Reservation[]) {
    const rStart = timeToMins(isoToTimeStr(r.start_time));
    const rEnd   = r.end_time ? timeToMins(isoToTimeStr(r.end_time)) : rStart + 90;

    // Overlap: new window [startMins, endMins) intersects [rStart, rEnd)
    if (startMins < rEnd && endMins > rStart) {
      hasConflict = true;
    }

    // Next booking after the visit ends
    if (rStart >= endMins && !nextBookingTime) {
      nextBookingTime = fmt12(isoToTimeStr(r.start_time));
    }
  }

  return { hasConflict, nextBookingTime };
}

// ─── Table suggestion logic ───────────────────────────────────────────────────

interface TableSuggestion {
  table: Table;
  available: boolean;
  conflict: ConflictInfo;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function QuickVisitModal({ restaurantId, tables, onClose, onCreated }: QuickVisitModalProps) {
  const [partySize, setPartySize]       = useState(2);
  const [startTime, setStartTime]       = useState(getNowTime);
  const [duration, setDuration]         = useState(30);
  const [selectedTableId, setTableId]   = useState('');
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes]               = useState('');

  const [tableSuggestions, setTableSuggestions] = useState<TableSuggestion[]>([]);
  const [loadingTables, setLoadingTables]         = useState(false);
  const [selectedConflict, setSelectedConflict]   = useState<ConflictInfo | null>(null);
  const [overrideConflict, setOverrideConflict]   = useState(false);

  const [submitting, setSubmitting]   = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess]         = useState(false);
  const [successTable, setSuccessTable] = useState('');

  const date = getLocalDate();
  const endTime = addMinutesToTime(startTime, duration);

  // Eligible tables: capacity >= partySize
  const eligibleTables = useMemo(
    () => [...tables]
      .filter(t => t.capacity >= partySize)
      .sort((a, b) => a.capacity - b.capacity || a.name.localeCompare(b.name)),
    [tables, partySize]
  );

  // Re-check conflicts whenever party size, time, or duration changes
  useEffect(() => {
    if (eligibleTables.length === 0) { setTableSuggestions([]); return; }
    let cancelled = false;
    setLoadingTables(true);
    Promise.all(
      eligibleTables.map(async t => {
        const conflict = await checkTableConflict(restaurantId, t.id, date, startTime, duration);
        return { table: t, available: !conflict.hasConflict, conflict };
      })
    ).then(results => {
      if (cancelled) return;
      setTableSuggestions(results);
      setLoadingTables(false);

      // Auto-select first available if current selection is unavailable
      const firstAvailable = results.find(r => r.available);
      if (firstAvailable && !results.find(r => r.table.id === selectedTableId)?.available) {
        setTableId(firstAvailable.table.id);
        setSelectedConflict(null);
        setOverrideConflict(false);
      }
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partySize, startTime, duration, restaurantId, date]);

  // Update conflict info when table selection changes
  useEffect(() => {
    const match = tableSuggestions.find(s => s.table.id === selectedTableId);
    if (match) {
      setSelectedConflict(match.conflict);
      if (match.available) setOverrideConflict(false);
    }
  }, [selectedTableId, tableSuggestions]);

  const canSubmit = selectedTableId && (!selectedConflict?.hasConflict || overrideConflict);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const name = customerName.trim() || 'Quick Visit';
      await createReservation(
        restaurantId,
        selectedTableId,
        date,
        startTime,
        partySize,
        { customer_name: name, customer_phone: '', customer_email: '', notes },
        {
          source: 'quick_visit',
          preorderItems: [],
          preorderTotal: 0,
        }
      );

      // Immediately seat the reservation via journey update
      // We fetch the newly created reservation by finding it
      const { data: created } = await supabase
        .from('reservations')
        .select('id')
        .eq('restaurant_id', restaurantId)
        .eq('table_id', selectedTableId)
        .eq('source', 'quick_visit')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (created) {
        await supabase
          .from('reservations')
          .update({ journey_stage: 'seated', journey_started_at: new Date().toISOString() })
          .eq('id', created.id);
      }

      const tableName = tables.find(t => t.id === selectedTableId)?.name ?? '';
      setSuccessTable(tableName);
      setSuccess(true);
      onCreated();
    } catch (err) {
      console.error('[QuickVisit] create failed:', err);
      setSubmitError(err instanceof Error ? err.message : 'Failed to create quick visit');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Backdrop + modal ────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/80 bg-slate-900">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-500/15 border border-teal-500/30 flex items-center justify-center">
              <Zap className="w-4 h-4 text-teal-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white leading-tight">Quick Visit</h2>
              <p className="text-[11px] text-slate-500 leading-tight">Seat now, no full details needed</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {success ? (
          <SuccessScreen tableName={successTable} partySize={partySize} startTime={startTime} endTime={endTime} onClose={onClose} onAnother={() => { setSuccess(false); setCustomerName(''); setNotes(''); setStartTime(getNowTime()); setDuration(30); setOverrideConflict(false); }} />
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">

            {submitError && (
              <div className="flex items-start gap-2.5 p-3 bg-red-500/10 border border-red-500/25 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-300">{submitError}</p>
              </div>
            )}

            {/* Party size + duration row */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Party size">
                <CounterInput value={partySize} min={1} max={20} onChange={setPartySize} />
              </Field>
              <Field label="Visit length">
                <div className="grid grid-cols-2 gap-1">
                  {DURATION_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setDuration(opt.value)}
                      className={`py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        duration === opt.value
                          ? 'bg-teal-500/20 border-teal-500/50 text-teal-300'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </Field>
            </div>

            {/* Time */}
            <Field label={`Start time → ends ${fmt12(endTime)}`}>
              <div className="relative">
                <input
                  type="time"
                  value={startTime}
                  onChange={e => { setStartTime(e.target.value); setOverrideConflict(false); }}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500/50 transition-colors"
                />
              </div>
            </Field>

            {/* Table selection */}
            <Field label="Table">
              {eligibleTables.length === 0 ? (
                <p className="text-xs text-slate-500 italic">No tables fit a party of {partySize}.</p>
              ) : loadingTables ? (
                <div className="flex items-center gap-2 py-2">
                  <div className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs text-slate-500">Checking availability…</span>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-0.5">
                  {tableSuggestions.map(({ table, available, conflict }) => {
                    const isSelected = selectedTableId === table.id;
                    return (
                      <button
                        key={table.id}
                        type="button"
                        onClick={() => { setTableId(table.id); setOverrideConflict(false); }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left transition-all ${
                          isSelected
                            ? available
                              ? 'bg-teal-500/15 border-teal-500/50 text-teal-100'
                              : 'bg-red-500/15 border-red-500/40 text-red-200'
                            : available
                              ? 'bg-slate-800 border-slate-700 text-slate-300 hover:border-teal-500/40 hover:text-white'
                              : 'bg-slate-800/50 border-slate-700/50 text-slate-500 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-semibold truncate">{table.name}</span>
                          <span className="text-[10px] text-slate-500 flex-shrink-0">{table.capacity} seats</span>
                        </div>
                        <span className={`flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                          available
                            ? 'bg-teal-500/20 text-teal-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}>
                          {available ? 'Free' : 'Busy'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </Field>

            {/* Conflict warning */}
            {selectedConflict?.hasConflict && (
              <div className="space-y-2 p-3 bg-amber-500/8 border border-amber-500/25 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-px" />
                  <div className="text-xs text-amber-300 leading-snug">
                    <span className="font-semibold">Table not free</span> for {fmt12(startTime)}–{fmt12(endTime)}.
                    {selectedConflict.nextBookingTime && (
                      <span className="text-amber-400/80"> Next booking at {selectedConflict.nextBookingTime}.</span>
                    )}
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={overrideConflict}
                    onChange={e => setOverrideConflict(e.target.checked)}
                    className="rounded accent-amber-400"
                  />
                  <span className="text-xs text-amber-400">Override — seat anyway</span>
                </label>
              </div>
            )}

            {/* Next booking hint (no conflict, but something close) */}
            {!selectedConflict?.hasConflict && selectedConflict?.nextBookingTime && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                Next booking on this table: {selectedConflict.nextBookingTime}
              </div>
            )}

            {/* Optional fields */}
            <details className="group">
              <summary className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-500 hover:text-slate-300 list-none transition-colors select-none">
                <ChevronDown className="w-3.5 h-3.5 group-open:rotate-180 transition-transform" />
                Optional details
              </summary>
              <div className="mt-3 space-y-3">
                <Field label="Customer name (optional)">
                  <input
                    type="text"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    placeholder="e.g. Sarah"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500/50 transition-colors"
                  />
                </Field>
                <Field label="Notes (optional)">
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="e.g. Coffee and pastries only"
                    rows={2}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500/50 transition-colors resize-none"
                  />
                </Field>
              </div>
            </details>

            {/* Submit */}
            <button
              type="submit"
              disabled={!canSubmit || submitting}
              className="w-full py-2.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <Zap className="w-4 h-4" />
              {submitting ? 'Seating…' : 'Seat Now'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function CounterInput({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 flex items-center justify-center text-lg font-bold transition-colors"
      >
        −
      </button>
      <div className="flex items-center gap-1.5 flex-1 justify-center">
        <Users className="w-3.5 h-3.5 text-slate-500" />
        <span className="text-sm font-bold text-white tabular-nums">{value}</span>
      </div>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 flex items-center justify-center text-lg font-bold transition-colors"
      >
        +
      </button>
    </div>
  );
}

function SuccessScreen({
  tableName, partySize, startTime, endTime, onClose, onAnother,
}: {
  tableName: string; partySize: number; startTime: string; endTime: string;
  onClose: () => void; onAnother: () => void;
}) {
  return (
    <div className="p-6 text-center space-y-4">
      <div className="w-14 h-14 rounded-2xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center mx-auto">
        <CheckCircle2 className="w-7 h-7 text-teal-400" />
      </div>
      <div>
        <h3 className="text-base font-bold text-white">Quick Visit Seated!</h3>
        <p className="text-sm text-slate-400 mt-1">
          {partySize} {partySize === 1 ? 'guest' : 'guests'} on <span className="text-white font-semibold">{tableName}</span>
          <br />
          <span className="tabular-nums">{fmt12(startTime)} – {fmt12(endTime)}</span>
        </p>
      </div>
      <div className="space-y-2">
        <button
          onClick={onAnother}
          className="w-full py-2 bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          Another Quick Visit
        </button>
        <button
          onClick={onClose}
          className="w-full py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-sm font-semibold rounded-xl transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}
