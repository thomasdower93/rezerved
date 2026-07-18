import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getRestaurantBySlug } from '../services/restaurants';
import { getAvailability, createReservation } from '../services/reservations';
import { confirmReservationFromHold } from '../services/holds';
import { Restaurant, TableAvailability } from '../lib/types';
import { PremiumCustomerFloorplanView } from '../components/PremiumCustomerFloorplanView';
import { Calendar, Clock, Users, Check, ArrowLeft, AlertCircle, Loader2, MapPin, ChevronDown, Sparkles } from 'lucide-react';
import { USE_PREMIUM_CUSTOMER_MAP } from '../lib/constants';

function getOrCreateSessionKey(): string {
  const key = 'embed_booking_session_key';
  let sessionKey = sessionStorage.getItem(key);
  if (!sessionKey) {
    sessionKey = `embed_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    sessionStorage.setItem(key, sessionKey);
  }
  return sessionKey;
}

type EmbedStep = 'params' | 'table-select' | 'details' | 'confirmation';

interface EmbedBookingWidgetProps {
  slug: string;
}

export function EmbedBookingWidget({ slug }: EmbedBookingWidgetProps) {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<EmbedStep>('params');

  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState('19:00');
  const [partySize, setPartySize] = useState(2);

  const [tables, setTables] = useState<TableAvailability[]>([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [selectedTable, setSelectedTable] = useState<TableAvailability | null>(null);

  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [confirmationCode, setConfirmationCode] = useState<string | null>(null);
  const [manageToken, setManageToken] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const lastHeightRef = useRef<number>(0);

  // Robust height reporting - fires on any content change
  const reportHeight = useCallback(() => {
    if (!containerRef.current) return;
    const height = containerRef.current.scrollHeight;
    if (height !== lastHeightRef.current) {
      lastHeightRef.current = height;
      window.parent.postMessage(
        { type: 'rezerved-embed-resize', height: Math.ceil(height) + 2 },
        '*'
      );
    }
  }, []);

  useEffect(() => {
    const observer = new ResizeObserver(() => reportHeight());
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    reportHeight();
    return () => observer.disconnect();
  }, [reportHeight]);

  // Report height on every step/state change
  useEffect(() => {
    const timer = setTimeout(reportHeight, 50);
    return () => clearTimeout(timer);
  }, [step, tables, loadingAvailability, selectedTable, submitError, loading, reportHeight]);

  // Also report on window resize
  useEffect(() => {
    const handler = () => reportHeight();
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [reportHeight]);

  // Hide scrollbars when embedded in iframe
  useEffect(() => {
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getRestaurantBySlug(slug)
      .then((r) => {
        if (cancelled) return;
        if (!r) setError('Restaurant not found');
        else setRestaurant(r);
      })
      .catch(() => { if (!cancelled) setError('Failed to load restaurant'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug]);

  const fetchAvailability = useCallback(async () => {
    if (!restaurant) return;
    setLoadingAvailability(true);
    try {
      const sessionKey = getOrCreateSessionKey();
      const result = await getAvailability(restaurant.id, date, time, partySize, sessionKey);
      setTables(result);
    } catch {
      setTables([]);
    } finally {
      setLoadingAvailability(false);
    }
  }, [restaurant, date, time, partySize]);

  const handleCheckAvailability = () => {
    setSelectedTable(null);
    fetchAvailability();
    setStep('table-select');
  };

  const handleSelectTable = (table: TableAvailability) => {
    setSelectedTable(table);
    setStep('details');
  };

  const handleSubmitBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurant || !selectedTable) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const holdToken = selectedTable.holdToken || null;
      let result: { manage_token?: string; reservation_code?: string; success?: boolean } | null = null;

      if (holdToken) {
        const holdResult = await confirmReservationFromHold(
          holdToken, customerName, customerEmail, customerPhone,
          notes || '', [], 0, 'online', undefined, restaurant.id, false, undefined, false
        );
        if (holdResult.success) result = holdResult;
      }

      if (!result || !result.manage_token) {
        const directResult = await createReservation(
          restaurant.id, selectedTable.id, date, time, partySize,
          { customer_name: customerName, customer_phone: customerPhone, customer_email: customerEmail, notes: notes || undefined },
          { source: 'online' }
        );
        result = directResult;
      }

      if (result?.manage_token) {
        setManageToken(result.manage_token);
        setConfirmationCode(result.reservation_code || null);
        setStep('confirmation');
      } else {
        setSubmitError('Booking could not be completed. Please try again.');
      }
    } catch (err: any) {
      setSubmitError(err?.message || 'An error occurred while booking.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    if (step === 'details') setStep('table-select');
    else if (step === 'table-select') setStep('params');
  };

  const handleNewBooking = () => {
    setSelectedTable(null);
    setConfirmationCode(null);
    setManageToken(null);
    setCustomerName('');
    setCustomerEmail('');
    setCustomerPhone('');
    setNotes('');
    setSubmitError(null);
    setStep('params');
  };

  const timeSlots = generateTimeSlots();

  if (loading) {
    return (
      <div ref={containerRef} className="flex items-center justify-center py-20" style={{ background: '#070b14' }}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-7 h-7 animate-spin text-amber-400/80" />
          <span className="text-sm text-slate-400">Loading...</span>
        </div>
      </div>
    );
  }

  if (error || !restaurant) {
    return (
      <div ref={containerRef} className="flex flex-col items-center justify-center py-20 text-center" style={{ background: '#070b14' }}>
        <AlertCircle className="w-10 h-10 text-red-400/80 mb-3" />
        <p className="text-slate-300 text-sm">{error || 'Restaurant not found'}</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ background: '#070b14' }} className="embed-root min-h-[200px]">
      <div className="max-w-[860px] mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <div className="bg-[#0d1424] rounded-2xl border border-white/[0.06] shadow-2xl shadow-black/40 overflow-hidden">
          {/* Header */}
          <div className="relative px-5 sm:px-7 pt-5 sm:pt-6 pb-4 border-b border-white/[0.06]">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-white font-semibold text-lg sm:text-xl tracking-tight">{restaurant.name}</h1>
                {restaurant.address && (
                  <p className="text-slate-400 text-xs sm:text-sm flex items-center gap-1.5 mt-1">
                    <MapPin className="w-3.5 h-3.5 text-amber-400/70" />
                    {restaurant.address}{restaurant.city ? `, ${restaurant.city}` : ''}
                  </p>
                )}
              </div>
              <div className="text-[9px] text-slate-500 flex items-center gap-1 mt-1">
                <span className="opacity-60">Powered by</span>
                <span className="font-semibold text-amber-400/80 tracking-wide">REZERVED</span>
              </div>
            </div>
          </div>

          {/* Step Indicator */}
          <div className="px-5 sm:px-7 pt-4 pb-1">
            <StepIndicator currentStep={step} />
          </div>

          {/* Content */}
          <div className="px-5 sm:px-7 pb-6 pt-2">
            {step === 'params' && (
              <ParamsStep
                date={date} time={time} partySize={partySize}
                maxPartySize={restaurant.max_online_party_size ?? 8}
                timeSlots={timeSlots}
                onDateChange={setDate} onTimeChange={setTime}
                onPartySizeChange={setPartySize} onContinue={handleCheckAvailability}
              />
            )}
            {step === 'table-select' && (
              <TableSelectStep
                restaurant={restaurant} tables={tables} loading={loadingAvailability}
                date={date} time={time} partySize={partySize}
                onSelect={handleSelectTable} onBack={handleBack} onRefresh={fetchAvailability}
              />
            )}
            {step === 'details' && selectedTable && (
              <DetailsStep
                restaurant={restaurant} table={selectedTable}
                date={date} time={time} partySize={partySize}
                customerName={customerName} customerEmail={customerEmail}
                customerPhone={customerPhone} notes={notes}
                submitting={submitting} submitError={submitError}
                onNameChange={setCustomerName} onEmailChange={setCustomerEmail}
                onPhoneChange={setCustomerPhone} onNotesChange={setNotes}
                onSubmit={handleSubmitBooking} onBack={handleBack}
              />
            )}
            {step === 'confirmation' && (
              <ConfirmationStep
                restaurant={restaurant} date={date} time={time} partySize={partySize}
                confirmationCode={confirmationCode} customerName={customerName}
                onNewBooking={handleNewBooking}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step Indicator ──────────────────────────────────────────────────────────

function StepIndicator({ currentStep }: { currentStep: EmbedStep }) {
  const steps: { key: EmbedStep; label: string }[] = [
    { key: 'params', label: 'Date & Time' },
    { key: 'table-select', label: 'Choose Table' },
    { key: 'details', label: 'Your Details' },
    { key: 'confirmation', label: 'Confirmed' },
  ];
  const currentIndex = steps.findIndex((s) => s.key === currentStep);

  return (
    <div className="flex items-center">
      {steps.map((s, i) => (
        <React.Fragment key={s.key}>
          <div className="flex items-center gap-2">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300 ${
                i < currentIndex
                  ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30'
                  : i === currentIndex
                  ? 'bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/40'
                  : 'bg-white/5 text-slate-500 ring-1 ring-white/10'
              }`}
            >
              {i < currentIndex ? <Check className="w-3 h-3" /> : i + 1}
            </div>
            <span
              className={`text-[11px] hidden sm:inline transition-colors ${
                i === currentIndex ? 'text-white font-medium' : i < currentIndex ? 'text-emerald-400/80' : 'text-slate-500'
              }`}
            >
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={`flex-1 h-px mx-2 sm:mx-3 transition-colors ${
              i < currentIndex ? 'bg-emerald-500/30' : 'bg-white/[0.06]'
            }`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Params Step ─────────────────────────────────────────────────────────────

function ParamsStep({
  date, time, partySize, maxPartySize, timeSlots,
  onDateChange, onTimeChange, onPartySizeChange, onContinue,
}: {
  date: string; time: string; partySize: number; maxPartySize: number;
  timeSlots: string[];
  onDateChange: (d: string) => void; onTimeChange: (t: string) => void;
  onPartySizeChange: (s: number) => void; onContinue: () => void;
}) {
  const today = new Date().toISOString().split('T')[0];
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 60);
  const maxDateStr = maxDate.toISOString().split('T')[0];

  return (
    <div className="space-y-5 pt-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Date */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-300 mb-2">
            <Calendar className="w-3.5 h-3.5 text-amber-400/70" />
            Date
          </label>
          <div className="relative">
            <input
              type="date"
              value={date}
              min={today}
              max={maxDateStr}
              onChange={(e) => onDateChange(e.target.value)}
              className="w-full h-12 px-4 bg-white/[0.04] border border-white/[0.08] rounded-xl text-sm text-white focus:outline-none focus:border-amber-400/40 focus:ring-1 focus:ring-amber-400/20 transition-all [color-scheme:dark]"
            />
          </div>
        </div>

        {/* Time */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-300 mb-2">
            <Clock className="w-3.5 h-3.5 text-amber-400/70" />
            Time
          </label>
          <div className="relative">
            <select
              value={time}
              onChange={(e) => onTimeChange(e.target.value)}
              className="w-full h-12 px-4 pr-10 bg-white/[0.04] border border-white/[0.08] rounded-xl text-sm text-white focus:outline-none focus:border-amber-400/40 focus:ring-1 focus:ring-amber-400/20 transition-all appearance-none"
            >
              {timeSlots.map((t) => (
                <option key={t} value={t} className="bg-[#0d1424] text-white">{formatTimeDisplay(t)}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {/* Guests */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-300 mb-2">
            <Users className="w-3.5 h-3.5 text-amber-400/70" />
            Guests
          </label>
          <div className="relative">
            <select
              value={partySize}
              onChange={(e) => onPartySizeChange(parseInt(e.target.value, 10))}
              className="w-full h-12 px-4 pr-10 bg-white/[0.04] border border-white/[0.08] rounded-xl text-sm text-white focus:outline-none focus:border-amber-400/40 focus:ring-1 focus:ring-amber-400/20 transition-all appearance-none"
            >
              {Array.from({ length: maxPartySize }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n} className="bg-[#0d1424] text-white">{n} {n === 1 ? 'guest' : 'guests'}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      <button
        onClick={onContinue}
        className="w-full h-12 bg-gradient-to-r from-amber-500 to-amber-600 text-white text-sm font-semibold rounded-xl hover:from-amber-400 hover:to-amber-500 transition-all shadow-lg shadow-amber-500/20 active:scale-[0.98]"
      >
        Check Availability
      </button>
    </div>
  );
}

// ─── Table Select Step ───────────────────────────────────────────────────────

function TableSelectStep({
  restaurant, tables, loading, date, time, partySize,
  onSelect, onBack, onRefresh,
}: {
  restaurant: Restaurant; tables: TableAvailability[]; loading: boolean;
  date: string; time: string; partySize: number;
  onSelect: (t: TableAvailability) => void; onBack: () => void; onRefresh: () => void;
}) {
  const availableTables = tables.filter((t) => t.status === 'green');
  const hasFloorplan = restaurant.table_map_enabled && USE_PREMIUM_CUSTOMER_MAP;

  // Find recommended table
  const recommended = availableTables.find((t) => t.capacity >= partySize && t.capacity <= partySize + 2)
    || availableTables[0] || null;

  if (loading) {
    return (
      <div className="flex flex-col items-center py-16">
        <Loader2 className="w-7 h-7 animate-spin text-amber-400/70 mb-3" />
        <p className="text-sm text-slate-400">Finding the best tables for you...</p>
      </div>
    );
  }

  return (
    <div className="pt-4 space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Calendar className="w-3 h-3" />
          <span>{formatDateDisplay(date)}</span>
          <span className="text-white/20">|</span>
          <Clock className="w-3 h-3" />
          <span>{formatTimeDisplay(time)}</span>
          <span className="text-white/20">|</span>
          <Users className="w-3 h-3" />
          <span>{partySize}</span>
        </div>
      </div>

      {availableTables.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-14 h-14 rounded-full bg-amber-400/10 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-7 h-7 text-amber-400/80" />
          </div>
          <p className="text-base font-medium text-white mb-1">No tables available</p>
          <p className="text-sm text-slate-400 mb-5">Try a different time or date for your party of {partySize}.</p>
          <button
            onClick={onBack}
            className="px-5 h-10 text-sm text-white border border-white/10 rounded-lg hover:bg-white/5 transition-colors"
          >
            Change search
          </button>
        </div>
      ) : (
        <>
          {/* Recommended table card */}
          {recommended && (
            <div className="bg-white/[0.03] border border-amber-400/20 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-400/10 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{recommended.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-amber-400/15 text-amber-300 rounded font-medium">Recommended</span>
                  </div>
                  <span className="text-xs text-slate-400">Seats {recommended.capacity} - Available</span>
                </div>
              </div>
              <button
                onClick={() => onSelect(recommended)}
                className="px-4 h-9 bg-amber-500/90 hover:bg-amber-400 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Select
              </button>
            </div>
          )}

          {/* Table map */}
          {hasFloorplan ? (
            <div className="rounded-xl overflow-hidden border border-white/[0.06] bg-[#080e1a]" style={{ height: 'clamp(360px, 50vw, 440px)' }}>
              <PremiumCustomerFloorplanView
                restaurantId={restaurant.id}
                partySize={partySize}
                tables={tables}
                onTableSelect={(table) => {
                  if (table.status === 'green') onSelect(table);
                }}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {availableTables.map((table) => (
                <button
                  key={table.id}
                  onClick={() => onSelect(table)}
                  className="p-3 bg-white/[0.03] border border-white/[0.08] rounded-xl hover:border-amber-400/30 hover:bg-white/[0.05] transition-all text-left group"
                >
                  <span className="text-sm font-medium text-white group-hover:text-amber-300 transition-colors">{table.name}</span>
                  <span className="text-xs text-slate-500 block mt-0.5">Seats {table.capacity}</span>
                </button>
              ))}
            </div>
          )}

          {/* Hint */}
          {hasFloorplan && (
            <p className="text-[11px] text-slate-500 text-center">Tap a green table on the map to select it, or use the recommended table above.</p>
          )}
        </>
      )}
    </div>
  );
}

// ─── Details Step ────────────────────────────────────────────────────────────

function DetailsStep({
  restaurant, table, date, time, partySize,
  customerName, customerEmail, customerPhone, notes,
  submitting, submitError,
  onNameChange, onEmailChange, onPhoneChange, onNotesChange,
  onSubmit, onBack,
}: {
  restaurant: Restaurant; table: TableAvailability;
  date: string; time: string; partySize: number;
  customerName: string; customerEmail: string; customerPhone: string; notes: string;
  submitting: boolean; submitError: string | null;
  onNameChange: (v: string) => void; onEmailChange: (v: string) => void;
  onPhoneChange: (v: string) => void; onNotesChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void; onBack: () => void;
}) {
  return (
    <div className="pt-4">
      <div className="flex items-center justify-between mb-5">
        <button onClick={onBack} className="text-sm text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </div>

      {/* Booking summary */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 mb-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-300">
          <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-amber-400/70" />{formatDateDisplay(date)}</span>
          <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-amber-400/70" />{formatTimeDisplay(time)}</span>
          <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-amber-400/70" />{partySize} {partySize === 1 ? 'guest' : 'guests'}</span>
        </div>
        <div className="mt-2 pt-2 border-t border-white/[0.04] flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
          <span className="text-xs text-slate-400">Table: <span className="text-white font-medium">{table.name}</span></span>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">Full Name</label>
          <input
            type="text"
            value={customerName}
            onChange={(e) => onNameChange(e.target.value)}
            required
            placeholder="John Smith"
            className="w-full h-12 px-4 bg-white/[0.04] border border-white/[0.08] rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400/40 focus:ring-1 focus:ring-amber-400/20 transition-all"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Email</label>
            <input
              type="email"
              value={customerEmail}
              onChange={(e) => onEmailChange(e.target.value)}
              required
              placeholder="john@example.com"
              className="w-full h-12 px-4 bg-white/[0.04] border border-white/[0.08] rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400/40 focus:ring-1 focus:ring-amber-400/20 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Phone</label>
            <input
              type="tel"
              value={customerPhone}
              onChange={(e) => onPhoneChange(e.target.value)}
              required
              placeholder="07700 900000"
              className="w-full h-12 px-4 bg-white/[0.04] border border-white/[0.08] rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400/40 focus:ring-1 focus:ring-amber-400/20 transition-all"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">Special Requests <span className="text-slate-500 font-normal">(optional)</span></label>
          <textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            rows={2}
            placeholder="Allergies, celebrations, seating preferences..."
            className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400/40 focus:ring-1 focus:ring-amber-400/20 transition-all resize-none"
          />
        </div>

        {submitError && (
          <div className="flex items-start gap-2.5 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-300">{submitError}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !customerName || !customerEmail || !customerPhone}
          className="w-full h-12 bg-gradient-to-r from-amber-500 to-amber-600 text-white text-sm font-semibold rounded-xl hover:from-amber-400 hover:to-amber-500 transition-all shadow-lg shadow-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2 active:scale-[0.98]"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Confirming...
            </>
          ) : (
            'Confirm Booking'
          )}
        </button>

        <p className="text-[10px] text-slate-500 text-center leading-relaxed">
          By booking, you agree to the restaurant's terms and cancellation policy.
        </p>
      </form>
    </div>
  );
}

// ─── Confirmation Step ───────────────────────────────────────────────────────

function ConfirmationStep({
  restaurant, date, time, partySize, confirmationCode, customerName, onNewBooking,
}: {
  restaurant: Restaurant; date: string; time: string; partySize: number;
  confirmationCode: string | null; customerName: string; onNewBooking: () => void;
}) {
  return (
    <div className="pt-6 pb-2 text-center">
      <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-5 ring-1 ring-emerald-500/20">
        <Check className="w-8 h-8 text-emerald-400" />
      </div>
      <h3 className="text-xl font-semibold text-white mb-1.5">Booking Confirmed</h3>
      <p className="text-sm text-slate-400 mb-6">
        Thank you, {customerName}. Your table is reserved.
      </p>

      {confirmationCode && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 mb-5 inline-block min-w-[180px]">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Confirmation Code</p>
          <p className="text-2xl font-bold text-amber-300 tracking-widest font-mono">{confirmationCode}</p>
        </div>
      )}

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 mb-5 text-sm text-slate-300 space-y-1.5 max-w-xs mx-auto">
        <p className="font-medium text-white">{restaurant.name}</p>
        <p>{formatDateDisplay(date)} at {formatTimeDisplay(time)}</p>
        <p>{partySize} {partySize === 1 ? 'guest' : 'guests'}</p>
      </div>

      <p className="text-xs text-slate-500 mb-6">
        A confirmation email has been sent to your email address.
      </p>

      <button
        onClick={onNewBooking}
        className="px-6 h-10 text-sm text-slate-300 border border-white/10 rounded-lg hover:bg-white/5 hover:text-white transition-colors"
      >
        Make Another Booking
      </button>
    </div>
  );
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function generateTimeSlots(): string[] {
  const slots: string[] = [];
  for (let m = 9 * 60; m <= 23 * 60; m += 15) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    slots.push(`${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`);
  }
  return slots;
}

function formatTimeDisplay(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${m.toString().padStart(2, '0')}${suffix}`;
}

function formatDateDisplay(date: string): string {
  const d = new Date(date + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
