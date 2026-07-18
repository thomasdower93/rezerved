import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StaffLayout, StaffTab } from '../components/StaffLayout';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ReservationJourneyPanel } from '../components/ReservationJourneyPanel';
import { ReservationChatPanel } from '../components/ReservationChatPanel';
import { ReservationGrid } from '../components/ReservationGrid';
import { DashboardNewBookingModal } from '../components/DashboardNewBookingModal';
import { useAuth } from '../contexts/AuthContext';
import { getRestaurantReservations, cancelReservation as cancelReservationService } from '../services/reservations';
import { getTables } from '../services/tables';
import { getRestaurant } from '../services/restaurants';
import { supabase } from '../lib/supabase';
import { Reservation, Table, Restaurant } from '../lib/types';
import { Calendar, Clock, Users, Mail, Phone, User as UserIcon, Route, ChevronLeft, ChevronRight, UtensilsCrossed, X, AlertCircle, Search, Hash, AlertTriangle, CheckCheck, Filter, Wifi, Download, Printer, FileText, RefreshCw, CreditCard as Edit3, MessageSquare, CheckCircle2, BellOff, Loader2, LayoutGrid, ExternalLink, Banknote, Plus } from 'lucide-react';
import { getPaymentForReservation, formatDepositAmount } from '../services/deposits';
import { ReservationPayment } from '../lib/types';
import { useDashboardLayout } from '../hooks/useDashboardLayout';
import { reviewReservationRequest } from '../services/acceptance';

interface StaffDashboardProps {
  activeTab: StaffTab;
  onNavigate: (tab: StaffTab) => void;
  onLogout: () => void;
}

function formatDateDisplay(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  if (isSameDay(d, today)) return 'Today';
  if (isSameDay(d, tomorrow)) return 'Tomorrow';
  if (isSameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function shiftDate(dateStr: string, days: number) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatTime12(dateStr: string) {
  const date = new Date(dateStr);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}

export function StaffDashboard({ activeTab, onNavigate, onLogout }: StaffDashboardProps) {
  const { user, isAdmin, isStaff } = useAuth();
  const { isMobile } = useDashboardLayout();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState('');
  const [cancelTokenPending, setCancelTokenPending] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // When opened from a System Alert, this tracks which reservation's chat should auto-open
  const [openChatId, setOpenChatId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [recentlyUpdatedIds, setRecentlyUpdatedIds] = useState<Set<string>>(new Set());
  const [dashView, setDashView] = useState<'reservations' | 'daily_sheet' | 'grid_view'>('reservations');
  const [showNewBooking, setShowNewBooking] = useState(false);
  const [reviewingReservationId, setReviewingReservationId] = useState<string | null>(null);
  const reservationRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Keep latest selectedDate/restaurantId in refs so Realtime callbacks always
  // have the current values without needing to re-subscribe on every change.
  const selectedDateRef = useRef(selectedDate);
  const restaurantIdRef = useRef(user?.restaurant_id ?? '');
  useEffect(() => { selectedDateRef.current = selectedDate; }, [selectedDate]);
  useEffect(() => { restaurantIdRef.current = user?.restaurant_id ?? ''; }, [user]);

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setSelectedDate(today);
  }, []);

  useEffect(() => {
    if (user?.restaurant_id && selectedDate) {
      loadData();
    }
  }, [user, selectedDate]);

  // ── Alert → reservation navigation ──────────────────────────────────────

  const handleOpenReservationChat = useCallback(async (reservationId: string) => {
    setDashView('reservations');
    setExpandedId(reservationId);
    setOpenChatId(reservationId);

    // If the reservation isn't in the current list (different date), fetch its date
    // and switch to that date so it renders and the ref becomes available.
    const inCurrentList = reservations.some(r => r.id === reservationId);
    if (!inCurrentList) {
      try {
        const { data } = await supabase
          .from('reservations')
          .select('start_time')
          .eq('id', reservationId)
          .maybeSingle();
        if (data?.start_time) {
          const date = data.start_time.slice(0, 10);
          setSelectedDate(date);
          // Give the list time to load then scroll
          setTimeout(() => {
            const el = reservationRefs.current[reservationId];
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 600);
          return;
        }
      } catch {
        // fall through to scroll attempt below
      }
    }

    setTimeout(() => {
      const el = reservationRefs.current[reservationId];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  }, [reservations]);

  // ── Realtime subscriptions ────────────────────────────────────────────────

  const markUpdated = useCallback((id: string) => {
    setRecentlyUpdatedIds(prev => new Set(prev).add(id));
    setTimeout(() => {
      setRecentlyUpdatedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 2500);
  }, []);

  const handleReservationChange = useCallback(async (payload: any) => {
    const restaurantId = restaurantIdRef.current;
    const date = selectedDateRef.current;
    if (!restaurantId || !date) return;

    const record = payload.new ?? payload.old;
    // Only process events for this restaurant and date
    if (!record?.restaurant_id || record.restaurant_id !== restaurantId) return;

    const recordDate = record.start_time
      ? record.start_time.slice(0, 10)
      : null;
    if (recordDate && recordDate !== date) return;

    // Refresh just this day's reservations (lightweight)
    try {
      const fresh = await getRestaurantReservations(restaurantId, date);
      setReservations(fresh);
      if (record?.id) markUpdated(record.id);
    } catch (err) {
      console.warn('[StaffDashboard] Realtime refresh failed:', err);
    }
  }, [markUpdated]);

  const handleJourneyChange = useCallback(async (payload: any) => {
    const restaurantId = restaurantIdRef.current;
    const date = selectedDateRef.current;
    if (!restaurantId || !date) return;

    // We don't have restaurant_id on journey events, so always refresh
    try {
      const fresh = await getRestaurantReservations(restaurantId, date);
      setReservations(fresh);
      const reservationId = payload.new?.reservation_id ?? payload.old?.reservation_id;
      if (reservationId) markUpdated(reservationId);
    } catch (err) {
      console.warn('[StaffDashboard] Realtime journey refresh failed:', err);
    }
  }, [markUpdated]);

  useEffect(() => {
    const restaurantId = user?.restaurant_id;
    if (!restaurantId) return;

    let cleanup = false;

    const reservationsChannel = supabase
      .channel(`staff-reservations-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reservations',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        handleReservationChange
      )
      .subscribe(status => {
        if (cleanup) return;
        setRealtimeConnected(status === 'SUBSCRIBED');
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[StaffDashboard] Realtime subscription issue:', status);
        }
      });

    const journeyChannel = supabase
      .channel(`staff-journey-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reservation_journey_events',
        },
        handleJourneyChange
      )
      .subscribe();

    return () => {
      cleanup = true;
      setRealtimeConnected(false);
      supabase.removeChannel(reservationsChannel);
      supabase.removeChannel(journeyChannel);
    };
  }, [user?.restaurant_id, handleReservationChange, handleJourneyChange]);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadData = async () => {
    if (!user?.restaurant_id) return;
    setLoading(true);
    try {
      const [reservationsData, tablesData, restaurantData] = await Promise.all([
        getRestaurantReservations(user.restaurant_id, selectedDate),
        getTables(user.restaurant_id),
        getRestaurant(user.restaurant_id),
      ]);
      setReservations(reservationsData);
      setTables(tablesData);
      setRestaurant(restaurantData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const silentRefreshReservations = useCallback(async () => {
    if (!user?.restaurant_id) return;
    const scrollY = window.scrollY;
    try {
      const reservationsData = await getRestaurantReservations(user.restaurant_id, selectedDate);
      setReservations(reservationsData);
      requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: 'instant' }));
    } catch (error) {
      console.error('Failed to refresh reservations:', error);
    }
  }, [user?.restaurant_id, selectedDate]);

  const handleCancelConfirm = async () => {
    if (!cancelTokenPending) return;
    const token = cancelTokenPending;
    setCancelTokenPending(null);
    try {
      await cancelReservationService(token);
      await loadData();
    } catch (error) {
      alert('Failed to cancel reservation');
      console.error(error);
    }
  };

  const handleReviewReservation = async (reservation: Reservation, action: 'accept' | 'decline') => {
    const reason = action === 'decline'
      ? window.prompt('Optional: tell the customer why this request cannot be accepted.') || undefined
      : undefined;
    setReviewingReservationId(reservation.id);
    try {
      await reviewReservationRequest(reservation.id, action, reason);
      await silentRefreshReservations();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Unable to update reservation request.');
    } finally {
      setReviewingReservationId(null);
    }
  };

  const getTableName = (tableId: string, reservation?: Reservation) => {
    const primaryTable = tables.find(t => t.id === tableId);
    const primaryName = primaryTable?.name || 'Unknown';
    if (!reservation?.joined_table_ids || reservation.joined_table_ids.length <= 1) return primaryName;
    const names = reservation.joined_table_ids
      .map(id => tables.find(t => t.id === id)?.name)
      .filter(Boolean) as string[];
    return names.length > 1 ? names.join(' + ') : primaryName;
  };

  const bookedCount = reservations.filter(r => r.status === 'booked').length;
  const pendingAcceptanceCount = reservations.filter(r => r.status === 'pending_acceptance').length;
  const completedCount = reservations.filter(r => r.journey_stage === 'table_cleared').length;
  const cancelledCount = reservations.filter(r => r.status === 'cancelled').length;
  const inProgressCount = reservations.filter(r => r.status === 'booked' && r.journey_stage && r.journey_stage !== 'table_cleared').length;

  const q = searchQuery.trim().toLowerCase();
  // Normalised version of the query: uppercase, no spaces, no hyphens — for code matching
  const qNorm = searchQuery.trim().toUpperCase().replace(/[\s\-]/g, '');
  const filteredReservations = q
    ? reservations.filter(r => {
        if (r.customer_name.toLowerCase().includes(q)) return true;
        if (r.customer_email.toLowerCase().includes(q)) return true;
        if (r.customer_phone?.toLowerCase().includes(q)) return true;
        if (getTableName(r.table_id, r).toLowerCase().includes(q)) return true;
        // Reservation code: match with and without hyphens/spaces
        if (r.reservation_code) {
          const codeNorm = r.reservation_code.toUpperCase().replace(/[\s\-]/g, '');
          if (codeNorm.includes(qNorm)) return true;
          if (r.reservation_code.toLowerCase().includes(q)) return true;
        }
        return false;
      })
    : reservations;

  const sortedReservations = [...filteredReservations].sort((a, b) => {
    if (a.status === 'pending_acceptance' && b.status !== 'pending_acceptance') return -1;
    if (a.status !== 'pending_acceptance' && b.status === 'pending_acceptance') return 1;
    if (a.status === 'cancelled' && b.status !== 'cancelled') return 1;
    if (a.status !== 'cancelled' && b.status === 'cancelled') return -1;
    return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
  });

  if (isAdmin) return null;

  if (isStaff && !user?.restaurant_id) {
    return (
      <StaffLayout activeTab={activeTab} onNavigate={onNavigate} onLogout={onLogout} restaurant={restaurant}>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
          <AlertCircle className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No restaurant assigned to your account.</p>
        </div>
      </StaffLayout>
    );
  }

  return (
    <StaffLayout activeTab={activeTab} onNavigate={onNavigate} onLogout={onLogout} restaurant={restaurant}>
      <div className="space-y-5">

        {/* Date selector + stats bar */}
        <div className={`flex ${isMobile ? 'flex-col gap-2.5' : 'flex-col sm:flex-row sm:items-center sm:justify-between gap-4'}`}>
          {/* Date row */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white transition-colors active:bg-slate-700 flex-shrink-0"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <label className="relative flex items-center gap-2.5 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg min-w-[140px] justify-center cursor-pointer">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => { if (e.target.value) setSelectedDate(e.target.value); }}
                  onInput={e => { const v = (e.target as HTMLInputElement).value; if (v) setSelectedDate(v); }}
                  className="sr-only"
                />
                <Calendar className="w-4 h-4 text-blue-400 flex-shrink-0 pointer-events-none" />
                <span className="text-sm font-semibold text-white pointer-events-none whitespace-nowrap">{formatDateDisplay(selectedDate)}</span>
              </label>
              <button
                onClick={() => setSelectedDate(shiftDate(selectedDate, 1))}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white transition-colors active:bg-slate-700 flex-shrink-0"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            {selectedDate !== new Date().toISOString().split('T')[0] && (
              <button
                onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
                className="px-3 py-2 text-xs font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg transition-colors flex-shrink-0"
              >
                Today
              </button>
            )}
            {/* Live indicator */}
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border flex-shrink-0 ${
              realtimeConnected
                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                : 'bg-slate-800 border-slate-700 text-slate-500'
            }`}>
              <Wifi className={`w-3 h-3 ${realtimeConnected ? 'text-emerald-400' : 'text-slate-500'}`} />
              {!isMobile && (realtimeConnected ? 'Live' : 'Offline')}
            </div>
          </div>

          {/* Stats pills */}
          <div className={`flex items-center gap-2 ${isMobile ? 'overflow-x-auto scrollbar-none pb-0.5' : 'flex-wrap gap-3'}`}>
            <StatPill label="Active" value={bookedCount} color="blue" isMobile={isMobile} />
            {pendingAcceptanceCount > 0 && <StatPill label="Needs review" value={pendingAcceptanceCount} color="amber" isMobile={isMobile} />}
            <StatPill label="In Progress" value={inProgressCount} color="amber" isMobile={isMobile} />
            <StatPill label="Completed" value={completedCount} color="emerald" isMobile={isMobile} />
            <StatPill label="Cancelled" value={cancelledCount} color="red" isMobile={isMobile} />
          </div>
        </div>

        {/* Sub-view toggle — compact segmented control on mobile */}
        {isMobile ? (
          <div className="overflow-x-auto scrollbar-none -mx-0">
            <div className="flex items-center gap-1.5 min-w-max">
              {([
                { view: 'reservations', icon: Calendar, label: 'List' },
                { view: 'daily_sheet', icon: FileText, label: 'Sheet' },
                { view: 'grid_view', icon: LayoutGrid, label: 'Grid' },
              ] as const).map(({ view, icon: Icon, label }) => (
                <button
                  key={view}
                  onClick={() => setDashView(view)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    dashView === view
                      ? 'bg-blue-500/15 text-blue-300 border border-blue-500/35'
                      : 'text-slate-400 bg-slate-800 border border-slate-700'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  {label}
                </button>
              ))}
              {user?.restaurant_id && (
                <button
                  onClick={() => {
                    const url = `/staff/service-view?restaurantId=${user.restaurant_id}&date=${selectedDate}`;
                    window.open(url, '_blank', 'noopener,noreferrer');
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap text-slate-400 bg-slate-800 border border-slate-700"
                >
                  <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                  Service
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDashView('reservations')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                dashView === 'reservations'
                  ? 'bg-blue-500/15 text-blue-300 border border-blue-500/35'
                  : 'text-slate-400 hover:text-slate-300 bg-slate-800 border border-slate-700'
              }`}
            >
              <Calendar className="w-4 h-4" />
              Reservations
            </button>
            <button
              onClick={() => setDashView('daily_sheet')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                dashView === 'daily_sheet'
                  ? 'bg-blue-500/15 text-blue-300 border border-blue-500/35'
                  : 'text-slate-400 hover:text-slate-300 bg-slate-800 border border-slate-700'
              }`}
            >
              <FileText className="w-4 h-4" />
              Daily Sheet
            </button>
            <button
              onClick={() => setDashView('grid_view')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                dashView === 'grid_view'
                  ? 'bg-blue-500/15 text-blue-300 border border-blue-500/35'
                  : 'text-slate-400 hover:text-slate-300 bg-slate-800 border border-slate-700'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              Grid View
            </button>
            {user?.restaurant_id && (
              <button
                onClick={() => {
                  const url = `/staff/service-view?restaurantId=${user.restaurant_id}&date=${selectedDate}`;
                  window.open(url, '_blank', 'noopener,noreferrer');
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700"
              >
                <ExternalLink className="w-4 h-4" />
                Service View
              </button>
            )}
          </div>
        )}

        {dashView === 'grid_view' ? (
          <ReservationGrid
            reservations={reservations}
            tables={tables}
            restaurant={restaurant}
            selectedDate={selectedDate}
            onReservationClick={(id) => {
              setDashView('reservations');
              setExpandedId(id);
              setTimeout(() => {
                const el = reservationRefs.current[id];
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }, 150);
            }}
          />
        ) : dashView === 'daily_sheet' ? (
          <DailyCoverSheet
            reservations={reservations}
            tables={tables}
            restaurant={restaurant}
            selectedDate={selectedDate}
          />
        ) : (
          <>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={isMobile ? 'Search reservations…' : 'Search by name, email, reservation code or table…'}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-500 transition-colors"
              />
            </div>

            {/* Reservation list */}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-slate-500">Loading reservations...</p>
              </div>
            ) : sortedReservations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 gap-3">
                <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center">
                  <Calendar className="w-7 h-7 text-slate-600" />
                </div>
                <p className="text-slate-400 font-medium">No reservations for {formatDateDisplay(selectedDate).toLowerCase()}</p>
                <p className="text-sm text-slate-600">Try selecting a different date</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedReservations.map((reservation) => {
                  const isCompleted = reservation.journey_stage === 'table_cleared';
                  const isCancelled = reservation.status === 'cancelled';
                  const isDeclined = reservation.status === 'declined';
                  const isPendingAcceptance = reservation.status === 'pending_acceptance';
                  const isInProgress = reservation.status === 'booked' && reservation.journey_stage && !isCompleted;
                  const isExpanded = expandedId === reservation.id;
                  const wasUpdated = recentlyUpdatedIds.has(reservation.id);

                  const statusColor = isCompleted
                    ? 'bg-emerald-500'
                    : isCancelled || isDeclined
                    ? 'bg-red-500'
                    : isPendingAcceptance
                    ? 'bg-amber-500'
                    : isInProgress
                    ? 'bg-amber-400'
                    : 'bg-blue-500';

                  return (
                    <div
                      key={reservation.id}
                      ref={el => { reservationRefs.current[reservation.id] = el; }}
                      className={`bg-slate-900 border rounded-xl overflow-hidden transition-all duration-300 ${
                        isCancelled || isDeclined ? 'border-slate-800 opacity-55'
                        : isPendingAcceptance ? 'border-amber-500/50 shadow-[0_0_0_1px_rgba(245,158,11,0.12)]'
                        : wasUpdated ? 'border-blue-500/60 shadow-[0_0_0_2px_rgba(59,130,246,0.15)]'
                        : isCompleted ? 'border-slate-700'
                        : 'border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      {/* Main row */}
                      <div
                        className={`flex items-center gap-3 cursor-pointer ${isMobile ? 'p-3' : 'p-4 gap-4'}`}
                        onClick={() => setExpandedId(isExpanded ? null : reservation.id)}
                      >
                        {/* Status stripe */}
                        <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${statusColor}`} style={{ minHeight: '40px' }} />

                        {/* Time */}
                        <div className={`flex-shrink-0 ${isMobile ? 'w-16' : 'w-24'}`}>
                          <p className={`font-semibold text-white tabular-nums ${isMobile ? 'text-xs' : 'text-sm'}`}>{formatTime12(reservation.start_time)}</p>
                          {!isMobile && <p className="text-xs text-slate-500 tabular-nums">{formatTime12(reservation.end_time)}</p>}
                        </div>

                        {/* Guest info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-white truncate text-sm">{reservation.customer_name}</p>
                            {reservation.source && reservation.source !== 'online' && (
                              <span className={`px-1.5 py-0.5 text-xs rounded font-medium ${
                                reservation.source === 'walk_in'     ? 'bg-blue-500/20 text-blue-400'
                                : reservation.source === 'phone'       ? 'bg-green-500/20 text-green-400'
                                : reservation.source === 'quick_visit' ? 'bg-teal-500/20 text-teal-400'
                                : 'bg-slate-500/20 text-slate-400'
                              }`}>
                                {reservation.source === 'walk_in'     ? 'Walk-in'
                                  : reservation.source === 'phone'       ? 'Phone'
                                  : reservation.source === 'quick_visit' ? 'Quick Visit'
                                  : reservation.source}
                              </span>
                            )}
                            {wasUpdated && (
                              <span className="flex items-center gap-1 px-1.5 py-0.5 text-xs rounded font-medium bg-blue-500/20 text-blue-300 animate-fade-in">
                                <RefreshCw className="w-2.5 h-2.5" />
                                Updated
                              </span>
                            )}
                            {reservation.payment_required && (
                              <span className={`flex items-center gap-1 px-1.5 py-0.5 text-xs rounded font-medium ${
                                reservation.payment_status === 'paid'
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : reservation.payment_status === 'failed' || reservation.status === 'payment_failed'
                                  ? 'bg-red-500/20 text-red-400'
                                  : 'bg-amber-500/20 text-amber-400'
                              }`}>
                                <Banknote className="w-2.5 h-2.5" />
                                {reservation.payment_status === 'paid' ? 'Deposit paid'
                                  : reservation.payment_status === 'failed' || reservation.status === 'payment_failed' ? 'Payment failed'
                                  : 'Deposit pending'}
                              </span>
                            )}
                            <UnreadMessageDot restaurantId={user?.restaurant_id ?? ''} reservationId={reservation.id} />
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-slate-500 flex items-center gap-1">
                              <Users className="w-3 h-3" />{reservation.party_size}
                            </span>
                            <span className="text-xs text-slate-500 truncate">{isMobile ? getTableName(reservation.table_id, reservation) : `Table ${getTableName(reservation.table_id, reservation)}`}</span>
                          </div>
                        </div>

                        {/* Status badge */}
                        <div className="flex-shrink-0 flex items-center gap-1.5">
                          {isMobile ? (
                            /* Mobile: compact label badge */
                            isPendingAcceptance ? (
                              <span className="px-1.5 py-0.5 bg-amber-500/15 text-amber-300 text-[10px] font-medium rounded">
                                Review
                              </span>
                            ) : isCancelled || isDeclined ? (
                              <span className="px-1.5 py-0.5 bg-red-500/15 text-red-400 text-[10px] font-medium rounded">
                                {isDeclined ? 'Declined' : 'Cancel'}
                              </span>
                            ) : isCompleted ? (
                              <span className="px-1.5 py-0.5 bg-emerald-500/15 text-emerald-400 text-[10px] font-medium rounded">
                                Done
                              </span>
                            ) : isInProgress ? (
                              <span className="px-1.5 py-0.5 bg-amber-500/15 text-amber-400 text-[10px] font-medium rounded">
                                Seated
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 bg-blue-500/15 text-blue-400 text-[10px] font-medium rounded">
                                Booked
                              </span>
                            )
                          ) : (
                            /* Desktop: full badge */
                            isPendingAcceptance ? (
                              <span className="flex items-center gap-1 px-2 py-1 bg-amber-500/15 text-amber-300 text-xs font-medium rounded-md">
                                <Clock className="w-3 h-3" /> Needs acceptance
                              </span>
                            ) : isCancelled || isDeclined ? (
                              <span className="flex items-center gap-1 px-2 py-1 bg-red-500/15 text-red-400 text-xs font-medium rounded-md">
                                <X className="w-3 h-3" /> {isDeclined ? 'Declined' : 'Cancelled'}
                              </span>
                            ) : isCompleted ? (
                              <span className="flex items-center gap-1 px-2 py-1 bg-emerald-500/15 text-emerald-400 text-xs font-medium rounded-md">
                                Completed
                              </span>
                            ) : isInProgress ? (
                              <span className="flex items-center gap-1 px-2 py-1 bg-amber-500/15 text-amber-400 text-xs font-medium rounded-md">
                                <Route className="w-3 h-3" /> Seated
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 px-2 py-1 bg-blue-500/15 text-blue-400 text-xs font-medium rounded-md">
                                Booked
                              </span>
                            )
                          )}
                          {/* Reconfirmation badge — only shown for actionable statuses */}
                          {reservation.reconfirmation_required && (() => {
                            const cs = reservation.confirmation_status;
                            if (!cs || cs === 'not_required') return null;
                            const badgeCfg: Record<string, { label: string; cls: string; shortLabel: string }> = {
                              pending:               { label: 'Confirm pending', shortLabel: 'Confirm?', cls: 'bg-amber-500/15 text-amber-300' },
                              confirmed:             { label: 'Confirmed',       shortLabel: 'Confirmed', cls: 'bg-emerald-500/15 text-emerald-400' },
                              overdue:               { label: 'Overdue',         shortLabel: 'Overdue', cls: 'bg-red-500/15 text-red-400' },
                              cancelled_by_customer: { label: 'Cust. cancelled', shortLabel: 'Cancelled', cls: 'bg-slate-500/20 text-slate-400' },
                              auto_cancelled:        { label: 'Auto-cancelled',  shortLabel: 'Auto-cancel', cls: 'bg-red-500/15 text-red-400' },
                            };
                            const b = badgeCfg[cs];
                            if (!b) return null;
                            return (
                              <span className={`${isMobile ? 'hidden' : 'flex'} items-center px-2 py-1 text-xs font-medium rounded-md ${b.cls}`}>
                                {b.label}
                              </span>
                            );
                          })()}
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                            <ChevronRight className={`w-4 h-4 text-slate-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                          </div>
                        </div>
                      </div>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className={`border-t border-slate-800 pb-4 pt-4 space-y-4 ${isMobile ? 'px-3' : 'px-4'}`}>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <InfoRow icon={Clock} label="Time" value={`${formatTime12(reservation.start_time)} – ${formatTime12(reservation.end_time)}`} />
                            <InfoRow icon={Users} label="Party size" value={`${reservation.party_size} guests`} />
                            <InfoRow icon={UserIcon} label="Name" value={reservation.customer_name} />
                            <InfoRow icon={Phone} label="Phone" value={reservation.customer_phone} />
                            <InfoRow icon={Mail} label="Email" value={reservation.customer_email} />
                            {reservation.reservation_code && (
                              <InfoRow icon={Hash} label="Reservation code" value={reservation.reservation_code} />
                            )}
                          </div>

                          {isPendingAcceptance && (
                            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div>
                                  <p className="text-sm font-semibold text-amber-200">Reservation request needs a decision</p>
                                  <p className="text-xs text-amber-200/65 mt-1">
                                    The table is blocked. Confirmation is sent only if you accept this request.
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <button
                                    onClick={() => handleReviewReservation(reservation, 'decline')}
                                    disabled={reviewingReservationId === reservation.id}
                                    className="px-4 py-2 text-sm font-semibold rounded-lg border border-red-500/35 text-red-300 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-50"
                                  >
                                    Decline
                                  </button>
                                  <button
                                    onClick={() => handleReviewReservation(reservation, 'accept')}
                                    disabled={reviewingReservationId === reservation.id}
                                    className="px-4 py-2 text-sm font-semibold rounded-lg border border-emerald-500/35 text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 flex items-center gap-2"
                                  >
                                    {reviewingReservationId === reservation.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                    Accept
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Contact preferences */}
                          <div className="bg-slate-800/60 border border-slate-700 rounded-lg px-4 py-3">
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Contact preferences</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-slate-500">Marketing</span>
                                {reservation.marketing_opt_in ? (
                                  <span className="text-emerald-400 font-medium">Opted in</span>
                                ) : (
                                  <span className="text-slate-400">Not opted in</span>
                                )}
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-slate-500">Service email</span>
                                {reservation.service_email_notifications_allowed === false ? (
                                  <span className="text-red-400 font-medium">Disabled</span>
                                ) : (
                                  <span className="text-slate-300">Allowed</span>
                                )}
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-slate-500">Service SMS</span>
                                {reservation.service_sms_notifications_allowed === false ? (
                                  <span className="text-red-400 font-medium">Disabled</span>
                                ) : (
                                  <span className="text-slate-300">Allowed</span>
                                )}
                              </div>
                              {reservation.marketing_opt_in && reservation.marketing_opt_in_at && (
                                <div className="flex items-center justify-between gap-2 sm:col-span-1">
                                  <span className="text-slate-500">Opted in at</span>
                                  <span className="text-slate-400">
                                    {new Date(reservation.marketing_opt_in_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}{', '}
                                    {new Date(reservation.marketing_opt_in_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Reconfirmation status — only shown when the flow is active */}
                          {reservation.reconfirmation_required && (
                            <ReconfirmationStatusBlock reservation={reservation} onUpdate={silentRefreshReservations} />
                          )}

                          {/* Deposit / payment status */}
                          {reservation.payment_required && (
                            <DepositStatusBlock reservation={reservation} />
                          )}

                          {reservation.notes && (
                            <div className="bg-slate-800/60 border border-slate-700 rounded-lg px-4 py-3">
                              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Special Requests</p>
                              <p className="text-sm text-slate-300">{reservation.notes}</p>
                            </div>
                          )}

                          {reservation.preorder_items && reservation.preorder_items.length > 0 && (
                            <div className="bg-slate-800/60 border border-slate-700 rounded-lg px-4 py-3">
                              <div className="flex items-center gap-2 mb-2">
                                <UtensilsCrossed className="w-3.5 h-3.5 text-slate-400" />
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pre-order</p>
                              </div>
                              <div className="space-y-1.5">
                                {reservation.preorder_items.map((item, index) => (
                                  <div key={index} className="flex justify-between text-sm">
                                    <span className="text-slate-300">{item.quantity} × {item.name}</span>
                                    <span className="text-slate-400 tabular-nums">£{(item.price * item.quantity).toFixed(2)}</span>
                                  </div>
                                ))}
                              </div>
                              <div className="mt-2 pt-2 border-t border-slate-700 flex justify-between text-sm font-semibold">
                                <span className="text-slate-300">Total</span>
                                <span className="text-white tabular-nums">£{reservation.preorder_total?.toFixed(2) ?? '0.00'}</span>
                              </div>
                            </div>
                          )}

                          {(reservation.modification_count ?? 0) > 0 && (
                            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-amber-500/8 border border-amber-500/20">
                              <Edit3 className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                              <span className="text-xs text-amber-300 font-medium">
                                Modified {reservation.modification_count} time{reservation.modification_count !== 1 ? 's' : ''}
                              </span>
                              {reservation.modified_at && (
                                <span className="text-xs text-slate-500">
                                  · Last updated {new Date(reservation.modified_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} at {new Date(reservation.modified_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              )}
                            </div>
                          )}

                          {reservation.status === 'booked' && (
                            <ReservationJourneyPanel
                              reservation={reservation}
                              onUpdate={silentRefreshReservations}
                              dessertsEnabled={restaurant?.desserts_enabled !== false}
                              posEnabled={restaurant?.sumup_pos_enabled ?? false}
                              restaurantId={restaurant?.id}
                            />
                          )}

                          {user?.restaurant_id && (
                            <ReservationChatPanel
                              reservation={reservation}
                              restaurantId={user.restaurant_id}
                              autoOpen={openChatId === reservation.id}
                              onChatOpened={() => setOpenChatId(null)}
                            />
                          )}

                          {reservation.status === 'booked' && (
                            <div className="flex justify-end pt-1">
                              <button
                                onClick={() => setCancelTokenPending(reservation.manage_token)}
                                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 hover:border-red-500/50 rounded-lg transition-colors"
                              >
                                <X className="w-4 h-4" />
                                Cancel reservation
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>


      {user?.restaurant_id && (
        <SystemAlerts
          restaurantId={user.restaurant_id}
          userId={user.auth_user_id}
          onOpenReservationChat={handleOpenReservationChat}
          expandedReservationId={expandedId}
        />
      )}

      <ConfirmDialog
        isOpen={!!cancelTokenPending}
        title="Cancel Reservation"
        message="Are you sure you want to cancel this reservation? This action cannot be undone."
        confirmLabel="Cancel Reservation"
        cancelLabel="Keep Reservation"
        variant="danger"
        onConfirm={handleCancelConfirm}
        onCancel={() => setCancelTokenPending(null)}
      />

      {restaurant && (
        <>
          <button
            onClick={() => setShowNewBooking(true)}
            className="fixed right-4 sm:right-6 bottom-4 sm:bottom-6 z-40 flex items-center gap-2 px-4 sm:px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm rounded-full shadow-[0_12px_35px_rgba(37,99,235,0.38)] border border-blue-400/30 transition-all hover:-translate-y-0.5"
            aria-label="Create a new booking"
          >
            <Plus className="w-5 h-5" />
            New booking
          </button>
          <DashboardNewBookingModal
            open={showNewBooking}
            restaurant={restaurant}
            onClose={() => setShowNewBooking(false)}
            onReservationCreated={() => loadData()}
          />
        </>
      )}
    </StaffLayout>
  );
}

// ─── StatPill ─────────────────────────────────────────────────────────────────

function StatPill({ label, value, color, isMobile }: { label: string; value: number; color: 'blue' | 'amber' | 'emerald' | 'red'; isMobile?: boolean }) {
  const colorMap = {
    blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    red: 'text-red-400 bg-red-500/10 border-red-500/20',
  };
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border flex-shrink-0 ${colorMap[color]}`}>
      <span className="text-base font-bold tabular-nums leading-none">{value}</span>
      <span className={`text-xs font-medium opacity-80 ${isMobile ? 'block' : 'hidden sm:block'}`}>{label}</span>
    </div>
  );
}

// ─── UnreadMessageDot ─────────────────────────────────────────────────────────

function UnreadMessageDot({ restaurantId, reservationId }: { restaurantId: string; reservationId: string }) {
  const [hasUnread, setHasUnread] = useState(false);

  const checkUnread = useCallback(async () => {
    if (!restaurantId || !reservationId) return;
    const { count } = await supabase
      .from('app_error_events')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .eq('reservation_id', reservationId)
      .eq('area', 'messages')
      .is('resolved_at', null);
    setHasUnread((count ?? 0) > 0);
  }, [restaurantId, reservationId]);

  useEffect(() => {
    checkUnread();

    // Realtime: show dot immediately when a new message alert is inserted.
    // No server-side filter — client-side check is more reliable with SECURITY DEFINER inserts.
    const channel = supabase
      .channel(`unread-dot-${reservationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'app_error_events' },
        (payload) => {
          const row = payload.new as AppErrorEvent;
          if (row?.reservation_id === reservationId && row?.area === 'messages') setHasUnread(true);
        }
      )
      .subscribe();

    // Custom event: clear dot immediately when staff reply resolves the alert
    const onAlertsChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.reservationId === reservationId) {
        setHasUnread(false);
      } else if (!detail?.reservationId) {
        checkUnread();
      }
    };
    window.addEventListener('rezerved:alerts-changed', onAlertsChanged);
    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('rezerved:alerts-changed', onAlertsChanged);
    };
  }, [checkUnread, reservationId]);

  if (!hasUnread) return null;

  return (
    <span
      className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30"
      title="Unread customer message"
    >
      <MessageSquare className="w-2.5 h-2.5" />
    </span>
  );
}

// ─── InfoRow ──────────────────────────────────────────────────────────────────

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0">
        <Icon className="w-3.5 h-3.5 text-slate-400" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-sm text-slate-200 truncate">{value}</p>
      </div>
    </div>
  );
}

// ─── ReconfirmationStatusBlock ───────────────────────────────────────────────

function ReconfirmationStatusBlock({
  reservation,
  onUpdate,
}: {
  reservation: Reservation;
  onUpdate: () => void;
}) {
  const { user } = useAuth();
  const status = reservation.confirmation_status ?? 'pending';
  const [actionBusy, setActionBusy] = React.useState<'confirm' | 'disable' | null>(null);
  const [actionMsg, setActionMsg] = React.useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const statusConfig: Record<string, { label: string; color: string }> = {
    not_required:          { label: 'Not required',           color: 'text-slate-500' },
    pending:               { label: 'Awaiting confirmation',  color: 'text-amber-400' },
    confirmed:             { label: 'Confirmed by customer',  color: 'text-emerald-400' },
    cancelled_by_customer: { label: 'Cancelled by customer',  color: 'text-red-400' },
    overdue:               { label: 'Confirmation overdue',   color: 'text-red-400' },
    auto_cancelled:        { label: 'Auto-cancelled',         color: 'text-red-500' },
  };

  const cfg = statusConfig[status] ?? { label: status, color: 'text-slate-400' };
  const isDisabled = !!reservation.reconfirmation_disabled_at;

  function fmtDt(iso: string | null | undefined): string {
    if (!iso) return 'Not sent';
    return `${new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, ${new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  }

  function fmtDtOrDash(iso: string | null | undefined): string {
    if (!iso) return '—';
    return `${new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, ${new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  }

  const handleMarkConfirmed = async () => {
    if (actionBusy) return;
    setActionBusy('confirm');
    setActionMsg(null);
    const staffName = user?.name || user?.email?.split('@')[0] || 'Staff';
    const { error } = await supabase
      .from('reservations')
      .update({
        confirmation_status: 'confirmed',
        staff_confirmed_at: new Date().toISOString(),
        staff_confirmed_by: staffName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reservation.id);
    if (error) {
      setActionMsg({ type: 'err', text: 'Failed to confirm. Please try again.' });
    } else {
      setActionMsg({ type: 'ok', text: 'Marked as confirmed.' });
      onUpdate();
    }
    setActionBusy(null);
  };

  const handleDisableReconfirmation = async () => {
    if (actionBusy) return;
    setActionBusy('disable');
    setActionMsg(null);
    const { error } = await supabase
      .from('reservations')
      .update({
        reconfirmation_disabled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', reservation.id);
    if (error) {
      setActionMsg({ type: 'err', text: 'Failed to disable. Please try again.' });
    } else {
      setActionMsg({ type: 'ok', text: 'Reconfirmation disabled for this reservation.' });
      onUpdate();
    }
    setActionBusy(null);
  };

  const showDeadline = reservation.confirmation_deadline_at && (status === 'pending' || status === 'overdue');
  const canMarkConfirmed = !isDisabled && (status === 'pending' || status === 'overdue');
  const canDisable = !isDisabled && (status === 'pending' || status === 'overdue');

  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-lg px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Reconfirmation</p>
        {isDisabled && (
          <span className="text-xs text-slate-500 italic">Disabled for this reservation</span>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
        <div className="flex items-center justify-between gap-2 sm:col-span-2">
          <span className="text-slate-500">Status</span>
          <span className={`font-medium ${cfg.color}`}>{cfg.label}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-500">1st email</span>
          <span className={reservation.first_reconfirmation_sent_at ? 'text-slate-400' : 'text-slate-600'}>
            {fmtDt(reservation.first_reconfirmation_sent_at)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-500">2nd email</span>
          <span className={reservation.second_reconfirmation_sent_at ? 'text-slate-400' : 'text-slate-600'}>
            {fmtDt(reservation.second_reconfirmation_sent_at)}
          </span>
        </div>
        {showDeadline && (
          <div className="flex items-center justify-between gap-2 sm:col-span-2">
            <span className="text-slate-500">Deadline</span>
            <span className={status === 'overdue' ? 'text-red-400 font-medium' : 'text-amber-400'}>
              {fmtDtOrDash(reservation.confirmation_deadline_at)}
            </span>
          </div>
        )}
        {reservation.customer_confirmed_at && (
          <div className="flex items-center justify-between gap-2 sm:col-span-2">
            <span className="text-slate-500">Customer confirmed</span>
            <span className="text-emerald-400">{fmtDtOrDash(reservation.customer_confirmed_at)}</span>
          </div>
        )}
        {reservation.staff_confirmed_at && (
          <div className="flex items-center justify-between gap-2 sm:col-span-2">
            <span className="text-slate-500">Staff confirmed</span>
            <span className="text-emerald-400">
              {fmtDtOrDash(reservation.staff_confirmed_at)}
              {reservation.staff_confirmed_by && (
                <span className="text-slate-500 ml-1">· {reservation.staff_confirmed_by}</span>
              )}
            </span>
          </div>
        )}
        {reservation.customer_cancelled_at && (
          <div className="flex items-center justify-between gap-2 sm:col-span-2">
            <span className="text-slate-500">Customer cancelled</span>
            <span className="text-red-400">{fmtDtOrDash(reservation.customer_cancelled_at)}</span>
          </div>
        )}
        {reservation.auto_cancelled_at && (
          <div className="flex items-center justify-between gap-2 sm:col-span-2">
            <span className="text-slate-500">Auto-cancelled</span>
            <span className="text-red-500">{fmtDtOrDash(reservation.auto_cancelled_at)}</span>
          </div>
        )}
      </div>

      {/* Manual staff actions */}
      {(canMarkConfirmed || canDisable) && (
        <div className="mt-3 pt-3 border-t border-slate-700 flex items-center gap-2 flex-wrap">
          {canMarkConfirmed && (
            <button
              onClick={handleMarkConfirmed}
              disabled={!!actionBusy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {actionBusy === 'confirm' ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
              Mark as confirmed
            </button>
          )}
          {canDisable && (
            <button
              onClick={handleDisableReconfirmation}
              disabled={!!actionBusy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-slate-700/60 text-slate-400 hover:bg-slate-700 border border-slate-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {actionBusy === 'disable' ? <Loader2 className="w-3 h-3 animate-spin" /> : <BellOff className="w-3 h-3" />}
              Disable reconfirmation
            </button>
          )}
        </div>
      )}

      {actionMsg && (
        <p className={`mt-2 text-xs ${actionMsg.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
          {actionMsg.text}
        </p>
      )}
    </div>
  );
}

// ─── DepositStatusBlock ───────────────────────────────────────────────────────

function DepositStatusBlock({ reservation }: { reservation: Reservation }) {
  const [payment, setPayment] = React.useState<ReservationPayment | null | undefined>(undefined);

  React.useEffect(() => {
    getPaymentForReservation(reservation.id).then(setPayment).catch(() => setPayment(null));
  }, [reservation.id]);

  if (payment === undefined) return null;

  const statusConfig: Record<string, { label: string; color: string; bg: string; border: string }> = {
    pending:   { label: 'Awaiting payment',  color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/25' },
    paid:      { label: 'Paid',              color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/25' },
    failed:    { label: 'Payment failed',    color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/25' },
    refunded:  { label: 'Refunded',          color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/25' },
    cancelled: { label: 'Cancelled',         color: 'text-slate-400',   bg: 'bg-slate-800/60',   border: 'border-slate-700' },
  };

  const cfg = payment ? (statusConfig[payment.status] ?? statusConfig.pending) : statusConfig.pending;
  const paymentStatus = reservation.payment_status ?? payment?.status ?? 'pending';
  const effectiveCfg = statusConfig[paymentStatus] ?? cfg;

  // Use a 24h default cutoff for display purposes — the real cutoff is stored
  // in restaurant_deposit_settings but we don't want to fetch it here just for this label.
  const refundable = payment?.status === 'paid'
    ? (new Date(reservation.start_time).getTime() - Date.now() >= 24 * 60 * 60 * 1000)
    : false;

  return (
    <div className={`border rounded-lg px-4 py-3 ${effectiveCfg.bg} ${effectiveCfg.border}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Banknote className={`w-3.5 h-3.5 ${effectiveCfg.color}`} />
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Deposit</p>
        </div>
        <span className={`text-xs font-semibold ${effectiveCfg.color}`}>{effectiveCfg.label}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
        {reservation.deposit_amount_pence != null && reservation.deposit_amount_pence > 0 && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">Amount</span>
            <span className="text-slate-300 font-semibold tabular-nums">
              {formatDepositAmount(reservation.deposit_amount_pence)}
            </span>
          </div>
        )}
        {payment?.amount_pence && !reservation.deposit_amount_pence && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">Amount</span>
            <span className="text-slate-300 font-semibold tabular-nums">
              {formatDepositAmount(payment.amount_pence, payment.currency)}
            </span>
          </div>
        )}
        {payment?.provider && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">Provider</span>
            <span className="text-slate-400 capitalize">{payment.provider}</span>
          </div>
        )}
        {payment?.provider_payment_intent_id && (
          <div className="flex items-center justify-between gap-2 sm:col-span-2">
            <span className="text-slate-500">Payment ref</span>
            <span className="text-slate-400 font-mono text-[11px] truncate max-w-[200px]">{payment.provider_payment_intent_id}</span>
          </div>
        )}
        {payment?.status === 'paid' && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">Refundable</span>
            <span className={refundable ? 'text-emerald-400' : 'text-slate-500'}>
              {refundable ? 'Yes (within cutoff)' : 'No (past cutoff)'}
            </span>
          </div>
        )}
        {payment?.created_at && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">Initiated</span>
            <span className="text-slate-400">
              {new Date(payment.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}{', '}
              {new Date(payment.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )}
        {payment?.updated_at && payment.updated_at !== payment.created_at && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">Last updated</span>
            <span className="text-slate-400">
              {new Date(payment.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}{', '}
              {new Date(payment.updated_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── DailyCoverSheet (helpers) ────────────────────────────────────────────────

function fmt12(dateStr: string) {
  const d = new Date(dateStr);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

// ─── DailyCoverSheet ──────────────────────────────────────────────────────────

interface DailyCoverSheetProps {
  reservations: Reservation[];
  tables: Table[];
  restaurant: Restaurant | null;
  selectedDate: string;
}

const STAGE_LABEL: Record<string, string> = {
  seated: 'Seated',
  drinks_taken: 'Drinks Taken',
  drinks_served: 'Drinks Served',
  food_order_taken: 'Food Order Taken',
  starters_served: 'Starters Served',
  mains_served: 'Mains Served',
  desserts_served: 'Desserts Served',
  bill_requested: 'Bill Requested',
  bill_paid: 'Bill Paid',
  table_cleared: 'Table Cleared',
};

function DailyCoverSheet({ reservations, tables, restaurant, selectedDate }: DailyCoverSheetProps) {
  const getTableName = (tableId: string, reservation?: Reservation) => {
    const primary = tables.find(t => t.id === tableId)?.name ?? 'Unknown';
    if (!reservation?.joined_table_ids || reservation.joined_table_ids.length <= 1) return primary;
    const names = reservation.joined_table_ids
      .map(id => tables.find(t => t.id === id)?.name)
      .filter(Boolean) as string[];
    return names.length > 1 ? names.join('+') : primary;
  };

  const activeReservations = [...reservations]
    .filter(r => r.status !== 'cancelled')
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  const cancelledReservations = reservations.filter(r => r.status === 'cancelled');

  const totalCovers = activeReservations.reduce((s, r) => s + r.party_size, 0);
  const totalBookings = activeReservations.length;
  const preorderCount = activeReservations.filter(r => r.preorder_items && r.preorder_items.length > 0).length;
  const notesCount = activeReservations.filter(r => r.notes && r.notes.trim()).length;

  // Covers by hour
  const coversByHour: Record<string, { bookings: number; covers: number }> = {};
  for (const r of activeReservations) {
    const hour = new Date(r.start_time).getHours();
    const key = `${hour.toString().padStart(2, '0')}:00`;
    if (!coversByHour[key]) coversByHour[key] = { bookings: 0, covers: 0 };
    coversByHour[key].bookings += 1;
    coversByHour[key].covers += r.party_size;
  }
  const hourEntries = Object.entries(coversByHour).sort(([a], [b]) => a.localeCompare(b));

  const generatedAt = new Date().toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const formattedDate = new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const handlePrint = () => {
    window.print();
  };

  const handleExportCSV = () => {
    const headers = [
      'Time', 'Name', 'Guests', 'Table', 'Status', 'Reservation Code',
      'Phone', 'Email', 'Notes', 'Pre-order', 'Journey Stage',
    ];

    const rows = [...reservations]
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
      .map(r => [
        formatTime12(r.start_time),
        r.customer_name,
        r.party_size.toString(),
        getTableName(r.table_id, r),
        r.status,
        r.reservation_code ?? '',
        r.customer_phone,
        r.customer_email,
        r.notes ?? '',
        r.preorder_items && r.preorder_items.length > 0 ? 'Yes' : 'No',
        r.journey_stage ? (STAGE_LABEL[r.journey_stage] ?? r.journey_stage) : '',
      ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cover-sheet-${selectedDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {/* Screen controls — hidden when printing */}
      <div className="no-print flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Daily Cover Sheet</h2>
          <p className="text-xs text-slate-500 mt-0.5">{formattedDate}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            <Printer className="w-4 h-4" />
            Print / Save as PDF
          </button>
        </div>
      </div>

      {/* Cover sheet — visible on screen and printed */}
      <div id="cover-sheet-print" className="cover-sheet bg-white text-slate-900 rounded-xl overflow-hidden border border-slate-200 print:rounded-none print:border-0 print:shadow-none">

        {/* Header */}
        <div className="cover-sheet-header border-b-2 border-slate-200 px-8 py-6 print:px-6 print:py-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{restaurant?.name ?? 'Restaurant'}</h1>
              <p className="text-lg text-slate-600 mt-1 font-medium">{formattedDate}</p>
              <p className="text-xs text-slate-400 mt-1">Generated: {generatedAt}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 print:gap-2">
              <div className="text-center px-4 py-3 rounded-lg bg-slate-50 border border-slate-200 print:border-slate-300">
                <div className="text-2xl font-bold text-slate-900 tabular-nums">{totalBookings}</div>
                <div className="text-xs text-slate-500 font-medium uppercase tracking-wide mt-0.5">Bookings</div>
              </div>
              <div className="text-center px-4 py-3 rounded-lg bg-slate-50 border border-slate-200 print:border-slate-300">
                <div className="text-2xl font-bold text-slate-900 tabular-nums">{totalCovers}</div>
                <div className="text-xs text-slate-500 font-medium uppercase tracking-wide mt-0.5">Covers</div>
              </div>
              {preorderCount > 0 && (
                <div className="text-center px-4 py-3 rounded-lg bg-slate-50 border border-slate-200 col-span-1">
                  <div className="text-2xl font-bold text-slate-900 tabular-nums">{preorderCount}</div>
                  <div className="text-xs text-slate-500 font-medium uppercase tracking-wide mt-0.5">Pre-orders</div>
                </div>
              )}
              {notesCount > 0 && (
                <div className="text-center px-4 py-3 rounded-lg bg-slate-50 border border-slate-200 col-span-1">
                  <div className="text-2xl font-bold text-slate-900 tabular-nums">{notesCount}</div>
                  <div className="text-xs text-slate-500 font-medium uppercase tracking-wide mt-0.5">Special Req.</div>
                </div>
              )}
            </div>
          </div>

          {/* Covers by hour */}
          {hourEntries.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Covers by Hour</p>
              <div className="flex flex-wrap gap-2">
                {hourEntries.map(([hour, { bookings, covers }]) => (
                  <div key={hour} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 print:border-slate-300">
                    <span className="text-xs font-semibold text-slate-700 tabular-nums">{hour}</span>
                    <span className="text-xs text-slate-500">—</span>
                    <span className="text-xs font-bold text-slate-900 tabular-nums">{covers} covers</span>
                    <span className="text-xs text-slate-400">({bookings} bkg{bookings > 1 ? 's' : ''})</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Reservation table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Time</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Guests</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Table</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Code</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Phone</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[180px]">Notes / Journey</th>
              </tr>
            </thead>
            <tbody>
              {activeReservations.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400 text-sm">
                    No reservations for this date.
                  </td>
                </tr>
              ) : (
                activeReservations.map((r, idx) => (
                  <tr
                    key={r.id}
                    className={`border-b border-slate-100 align-top ${
                      idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                    } print:border-slate-200`}
                  >
                    <td className="px-4 py-3 font-semibold tabular-nums text-slate-900 whitespace-nowrap">
                      {formatTime12(r.start_time)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{r.customer_name}</div>
                      {r.source && r.source !== 'online' && (
                        <div className="text-xs text-slate-400 mt-0.5">{r.source === 'walk_in' ? 'Walk-in' : 'Phone'}</div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center font-semibold tabular-nums text-slate-700">{r.party_size}</td>
                    <td className="px-3 py-3 text-slate-700">{getTableName(r.table_id, r)}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                        r.journey_stage === 'table_cleared'
                          ? 'bg-emerald-100 text-emerald-700'
                          : r.journey_stage
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {r.journey_stage === 'table_cleared' ? 'Completed'
                          : r.journey_stage ? 'In Progress'
                          : 'Booked'}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-500">{r.reservation_code ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600 tabular-nums whitespace-nowrap">{r.customer_phone}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs leading-relaxed">
                      {r.notes && (
                        <div className="mb-1">
                          <span className="font-semibold text-slate-700">Req: </span>{r.notes}
                        </div>
                      )}
                      {r.preorder_items && r.preorder_items.length > 0 && (
                        <div className="mb-1">
                          <span className="font-semibold text-slate-700">Pre-order: </span>
                          {r.preorder_items.map(i => `${i.quantity}× ${i.name}`).join(', ')}
                        </div>
                      )}
                      {r.journey_stage && (
                        <div className="text-slate-400 italic">{STAGE_LABEL[r.journey_stage] ?? r.journey_stage}</div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Cancelled bookings summary */}
        {cancelledReservations.length > 0 && (
          <div className="px-8 py-4 border-t border-slate-200 bg-slate-50">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Cancelled Bookings ({cancelledReservations.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {cancelledReservations.map(r => (
                <span key={r.id} className="text-xs text-slate-400 px-2 py-1 bg-white border border-slate-200 rounded">
                  {formatTime12(r.start_time)} — {r.customer_name} ({r.party_size})
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-8 py-4 border-t border-slate-200 bg-slate-50 flex justify-between items-center print:px-6">
          <p className="text-xs text-slate-400">Rezerved · {restaurant?.name}</p>
          <p className="text-xs text-slate-400 tabular-nums">{formattedDate}</p>
        </div>
      </div>
    </>
  );
}

// ─── System Alerts ────────────────────────────────────────────────────────────

interface AppErrorEvent {
  id: string;
  created_at: string;
  severity: string;
  area: string;
  event_type: string;
  restaurant_id: string | null;
  reservation_id: string | null;
  table_id: string | null;
  reservation_code: string | null;
  message: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  // message alert extras
  conversation_id: string | null;
  message_id: string | null;
  customer_name: string | null;
  message_preview: string | null;
  metadata: Record<string, unknown> | null;
}

type AlertFilter = 'all' | 'booking' | 'messages' | 'email' | 'holds' | 'floorplan' | 'resolved';

const EVENT_TITLE: Record<string, string> = {
  booking_create_failed:       'Booking confirmation failed',
  hold_create_failed:          'Table hold failed',
  hold_confirm_failed:         'Hold confirmation failed',
  hold_release_failed:         'Hold release failed',
  confirmation_email_failed:   'Confirmation email failed',
  manage_lookup_failed:        'Reservation lookup failed',
  floorplan_load_failed:       'Floorplan failed to load',
  availability_load_failed:    'Availability failed to update',
  supabase_query_failed:       'Database query failed',
  customer_message_received:   'New customer message',
  reservation_pending_acceptance: 'Reservation awaiting acceptance',
};

function formatAlertTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function SystemAlerts({
  restaurantId,
  userId,
  onOpenReservationChat,
  expandedReservationId,
}: {
  restaurantId: string;
  userId?: string;
  onOpenReservationChat?: (reservationId: string) => void;
  expandedReservationId?: string | null;
}) {
  const [alerts, setAlerts] = useState<AppErrorEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<AlertFilter>('all');
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  // Ref so the realtime INSERT handler always reads the latest expandedReservationId
  const expandedReservationIdRef = useRef<string | null>(expandedReservationId ?? null);
  useEffect(() => { expandedReservationIdRef.current = expandedReservationId ?? null; }, [expandedReservationId]);

  const loadAlerts = useCallback(async () => {
    const { data, error } = await supabase
      .from('app_error_events')
      .select('id, created_at, severity, area, event_type, restaurant_id, reservation_id, table_id, reservation_code, message, resolved_at, resolved_by, conversation_id, message_id, customer_name, message_preview, metadata')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (!error && data) {
      setAlerts(data as AppErrorEvent[]);
    }
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  // Realtime: listen for all app_error_events changes, filter by restaurantId client-side.
  // Server-side filters are intentionally omitted — filtered postgres_changes subscriptions
  // can fail silently when rows are inserted by SECURITY DEFINER functions (postgres role).
  useEffect(() => {
    console.log('[SystemAlerts] Realtime subscribing for restaurant:', restaurantId);

    const channel = supabase
      .channel(`system-alerts-v2-${restaurantId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'app_error_events' },
        (payload) => {
          const row = payload.new as AppErrorEvent;
          console.log('[SystemAlerts] INSERT event received:', row?.id, row?.area, row?.restaurant_id);
          if (!row || row.restaurant_id !== restaurantId) return;

          // If the reservation whose alert just arrived is currently open in the
          // dashboard, auto-resolve immediately so staff see no stale unread alert.
          const isOpen = row.area === 'messages' && row.reservation_id === expandedReservationIdRef.current;
          if (isOpen) {
            console.log('[SystemAlerts] auto-resolving alert for open reservation:', row.reservation_id);
            const now = new Date().toISOString();
            const resolved = { ...row, resolved_at: now, resolved_by: userId ?? null };
            supabase
              .from('app_error_events')
              .update({ resolved_at: now, resolved_by: userId ?? null })
              .eq('id', row.id)
              .then(() => {});
            setAlerts(prev => {
              if (prev.some(a => a.id === resolved.id)) return prev;
              return [resolved, ...prev];
            });
            return;
          }

          setAlerts(prev => {
            if (prev.some(a => a.id === row.id)) return prev;
            return [row, ...prev];
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'app_error_events' },
        (payload) => {
          const row = payload.new as AppErrorEvent;
          console.log('[SystemAlerts] UPDATE event received:', row?.id, row?.area, row?.resolved_at);
          if (!row || row.restaurant_id !== restaurantId) return;
          setAlerts(prev => prev.map(a => a.id === row.id ? row : a));
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'app_error_events' },
        (payload) => {
          const row = payload.old as AppErrorEvent;
          console.log('[SystemAlerts] DELETE event received:', row?.id);
          if (!row) return;
          setAlerts(prev => prev.filter(a => a.id !== row.id));
        }
      )
      .subscribe((status) => {
        console.log('[SystemAlerts] Realtime channel status:', status);
        // Re-fetch on reconnect to catch any events missed during disconnect
        if (status === 'SUBSCRIBED') {
          loadAlerts();
        }
      });

    // Custom event from ReservationChatPanel: fired after DB resolve completes.
    // Immediately marks matching alerts resolved in local state without waiting for
    // the Realtime UPDATE event (eliminates the last visible delay).
    const onAlertsChanged = (e: Event) => {
      const { reservationId } = (e as CustomEvent).detail ?? {};
      if (reservationId) {
        const now = new Date().toISOString();
        setAlerts(prev => prev.map(a =>
          a.reservation_id === reservationId && a.area === 'messages' && !a.resolved_at
            ? { ...a, resolved_at: now }
            : a
        ));
      } else {
        loadAlerts();
      }
    };
    window.addEventListener('rezerved:alerts-changed', onAlertsChanged);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('rezerved:alerts-changed', onAlertsChanged);
    };
  }, [restaurantId, loadAlerts]);

  const handleResolve = async (alertId: string) => {
    setResolvingId(alertId);
    const { error } = await supabase
      .from('app_error_events')
      .update({
        resolved_at: new Date().toISOString(),
        resolved_by: userId ?? null,
      })
      .eq('id', alertId);

    if (!error) {
      setAlerts(prev => prev.map(a => a.id === alertId
        ? { ...a, resolved_at: new Date().toISOString(), resolved_by: userId ?? null }
        : a
      ));
    }
    setResolvingId(null);
  };

  const filterButtons: { key: AlertFilter; label: string }[] = [
    { key: 'all',       label: 'All' },
    { key: 'booking',   label: 'Booking' },
    { key: 'messages',  label: 'Messages' },
    { key: 'email',     label: 'Email' },
    { key: 'holds',     label: 'Holds' },
    { key: 'floorplan', label: 'Floorplan' },
    { key: 'resolved',  label: 'Resolved' },
  ];

  const filtered = alerts.filter(a => {
    if (filter === 'resolved') return !!a.resolved_at;
    if (filter === 'all') return !a.resolved_at;
    return !a.resolved_at && a.area === filter;
  });

  const unresolvedCount = alerts.filter(a => !a.resolved_at).length;
  const unreadMessageCount = alerts.filter(a => !a.resolved_at && a.area === 'messages').length;

  return (
    <div className="mt-8 no-print">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <h2 className="text-base font-semibold text-white">System Alerts</h2>
          {unresolvedCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
              {unresolvedCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-slate-500 mr-1" />
          {filterButtons.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${
                filter === key
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                  : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800 border border-transparent'
              }`}
            >
              {label}
              {key === 'messages' && unreadMessageCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-amber-500/30 text-amber-300 text-[10px] font-bold flex items-center justify-center leading-none">
                  {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-5 h-5 border-2 border-slate-600 border-t-slate-300 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2 bg-slate-900 border border-slate-800 rounded-xl">
          <CheckCheck className="w-8 h-8 text-emerald-500/50" />
          <p className="text-sm text-slate-500">
            {filter === 'resolved' ? 'No resolved alerts.' : 'No unresolved alerts.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(alert => {
            const isMessageAlert = alert.area === 'messages';
            const isHighPriority = (alert.metadata as Record<string, unknown> | null)?.priority === 'high';

            if (isMessageAlert) {
              return (
                <div
                  key={alert.id}
                  className={`bg-slate-900 border rounded-xl overflow-hidden transition-all ${
                    alert.resolved_at ? 'border-slate-800 opacity-60' : 'border-amber-500/30'
                  }`}
                >
                  {/* Message alert — clickable row */}
                  <button
                    className="w-full text-left px-4 py-3.5 flex items-start gap-3 hover:bg-slate-800/50 transition-colors disabled:cursor-default"
                    onClick={() => {
                      if (alert.reservation_id && onOpenReservationChat) {
                        onOpenReservationChat(alert.reservation_id);
                      }
                    }}
                    disabled={!alert.reservation_id || !onOpenReservationChat}
                  >
                    {/* Indicator dot */}
                    <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${
                      alert.resolved_at ? 'bg-slate-600'
                      : isHighPriority ? 'bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.6)]'
                      : 'bg-amber-400'
                    }`} />

                    <div className="flex-1 min-w-0">
                      {/* Header row */}
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <MessageSquare className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                        <span className="text-sm font-semibold text-slate-100">
                          New customer message
                        </span>
                        {isHighPriority && !alert.resolved_at && (
                          <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-amber-500/20 text-amber-300">
                            upcoming
                          </span>
                        )}
                        {alert.resolved_at && (
                          <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-emerald-500/15 text-emerald-400">
                            resolved
                          </span>
                        )}
                      </div>

                      {/* Sub-row: customer · time · table */}
                      <div className="flex items-center gap-2 text-xs text-slate-400 mb-1.5 flex-wrap">
                        {alert.customer_name && (
                          <span className="font-medium text-slate-300">{alert.customer_name}</span>
                        )}
                        <span className="text-slate-600">·</span>
                        <span>{formatAlertTime(alert.created_at)}</span>
                        {alert.reservation_code && (
                          <>
                            <span className="text-slate-600">·</span>
                            <span className="font-mono">{alert.reservation_code}</span>
                          </>
                        )}
                      </div>

                      {/* Message preview */}
                      {alert.message_preview && (
                        <p className="text-xs text-slate-400 leading-relaxed truncate italic">
                          &ldquo;{alert.message_preview}&rdquo;
                        </p>
                      )}
                    </div>

                    {/* Open chat chevron */}
                    {alert.reservation_id && onOpenReservationChat && !alert.resolved_at && (
                      <div className="flex-shrink-0 flex items-center gap-1 text-xs text-amber-400/70 mt-0.5">
                        <span className="hidden sm:inline">View</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </button>

                  {/* Resolve bar */}
                  {!alert.resolved_at && (
                    <div className="border-t border-slate-800 px-4 py-2 flex justify-end">
                      <button
                        onClick={() => handleResolve(alert.id)}
                        disabled={resolvingId === alert.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg transition-colors disabled:opacity-40"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        Resolve
                      </button>
                    </div>
                  )}
                </div>
              );
            }

            // Standard system error alert card
            return (
              <div
                key={alert.id}
                className={`bg-slate-900 border rounded-xl px-4 py-3.5 flex items-start gap-3 transition-opacity ${
                  alert.resolved_at ? 'border-slate-800 opacity-60' : 'border-slate-700'
                }`}
              >
                <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${
                  alert.resolved_at
                    ? 'bg-slate-600'
                    : alert.severity === 'warning'
                    ? 'bg-amber-400'
                    : 'bg-red-500'
                }`} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="text-sm font-semibold text-slate-200">
                      {EVENT_TITLE[alert.event_type] ?? alert.event_type}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      alert.area === 'email'     ? 'bg-blue-500/15 text-blue-400'
                      : alert.area === 'booking'  ? 'bg-emerald-500/15 text-emerald-400'
                      : alert.area === 'holds'    ? 'bg-amber-500/15 text-amber-400'
                      : alert.area === 'floorplan'? 'bg-orange-500/15 text-orange-400'
                      : 'bg-slate-700 text-slate-400'
                    }`}>
                      {alert.area}
                    </span>
                    {alert.resolved_at && (
                      <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-emerald-500/15 text-emerald-400">
                        resolved
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500 mb-1 flex-wrap">
                    <span>{formatAlertTime(alert.created_at)}</span>
                    {alert.reservation_code && (
                      <span className="font-mono text-slate-400">{alert.reservation_code}</span>
                    )}
                  </div>
                  {alert.message && (
                    <p className="text-xs text-slate-400 leading-relaxed">{alert.message}</p>
                  )}
                </div>

                {!alert.resolved_at && (
                  <button
                    onClick={() => handleResolve(alert.id)}
                    disabled={resolvingId === alert.id}
                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg transition-colors disabled:opacity-40"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Resolve
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
