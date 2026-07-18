import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ReservationGrid } from '../components/ReservationGrid';
import { ReservationJourneyPanel } from '../components/ReservationJourneyPanel';
import { ReservationChatPanel } from '../components/ReservationChatPanel';
import { RezervdLogo } from '../components/RezervdLogo';
import { useAuth } from '../contexts/AuthContext';
import { getRestaurantReservations } from '../services/reservations';
import { getTables } from '../services/tables';
import { getRestaurant } from '../services/restaurants';
import { supabase } from '../lib/supabase';
import { Reservation, Table, Restaurant } from '../lib/types';
import {
  ChevronLeft, ChevronRight, Wifi, RefreshCw, ArrowLeft, Calendar,
} from 'lucide-react';

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${dy}`;
}

function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, today)) return 'Today';
  if (same(d, tomorrow)) return 'Tomorrow';
  if (same(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function ServiceViewPage() {
  const { user, loading: authLoading } = useAuth();

  // Read restaurantId and date from URL query params
  const params = new URLSearchParams(window.location.search);
  const restaurantId = params.get('restaurantId') ?? user?.restaurant_id ?? '';
  const initialDate = params.get('date') ?? new Date().toISOString().split('T')[0];

  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [openChatId, setOpenChatId] = useState<string | null>(null);

  const selectedDateRef = useRef(selectedDate);
  const restaurantIdRef = useRef(restaurantId);
  useEffect(() => { selectedDateRef.current = selectedDate; }, [selectedDate]);

  // ── Auth guard: redirect if not authenticated ─────────────────────────────

  useEffect(() => {
    if (!authLoading && !user) {
      window.location.href = '/login';
    }
  }, [authLoading, user]);

  // ── Push date into URL without reload ─────────────────────────────────────

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('date', selectedDate);
    window.history.replaceState({}, '', url.toString());
  }, [selectedDate]);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!restaurantId) return;
    try {
      const [resData, tablesData, restData] = await Promise.all([
        getRestaurantReservations(restaurantId, selectedDate),
        getTables(restaurantId),
        getRestaurant(restaurantId),
      ]);
      setReservations(resData);
      setTables(tablesData);
      setRestaurant(restData);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('ServiceView: failed to load data', err);
    } finally {
      setLoading(false);
    }
  }, [restaurantId, selectedDate]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  // ── Realtime subscription ──────────────────────────────────────────────────

  useEffect(() => {
    if (!restaurantId) return;

    const channel = supabase
      .channel(`service-view-${restaurantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reservations', filter: `restaurant_id=eq.${restaurantId}` },
        (payload) => {
          const row = payload.new as Reservation | undefined;
          if (row?.start_time?.slice(0, 10) === selectedDateRef.current) {
            // Silently refresh data
            getRestaurantReservations(restaurantId, selectedDateRef.current)
              .then(data => { setReservations(data); setLastUpdated(new Date()); })
              .catch(() => {});
          }
        }
      )
      .subscribe((status) => {
        setRealtimeConnected(status === 'SUBSCRIBED');
      });

    return () => { supabase.removeChannel(channel); };
  }, [restaurantId]);

  // ── Polling fallback: refresh every 60s ───────────────────────────────────

  useEffect(() => {
    const interval = setInterval(() => {
      if (restaurantId) {
        getRestaurantReservations(restaurantId, selectedDateRef.current)
          .then(data => { setReservations(data); setLastUpdated(new Date()); })
          .catch(() => {});
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, [restaurantId]);

  // ── Reservation click: open journey panel ─────────────────────────────────

  const handleReservationClick = (id: string) => {
    setExpandedId(id);
    setOpenChatId(null);
  };

  // ── Last updated label ────────────────────────────────────────────────────

  const lastUpdatedLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  // ── Auth loading / not authenticated ─────────────────────────────────────

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null; // redirect fires in useEffect

  // Block access if restaurant doesn't match user's restaurant
  const effectiveRestaurantId = restaurantId || user.restaurant_id;
  if (user.restaurant_id && restaurantId && user.restaurant_id !== restaurantId && user.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400 text-sm">
        Access denied: you do not have permission to view this restaurant.
      </div>
    );
  }

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col" style={{ fontFamily: 'system-ui, sans-serif' }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-slate-900 border-b border-slate-700/60 shadow-lg shadow-black/30">
        <div className="flex items-center gap-2 px-4 py-2">

          {/* Logo */}
          <div className="flex-shrink-0">
            <RezervdLogo linkToHome={false} />
          </div>

          <div className="w-px h-5 bg-slate-700 mx-1 hidden sm:block" />

          {/* Restaurant name + date nav grouped together */}
          <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
            {restaurant && (
              <span className="text-sm font-semibold text-slate-200 truncate hidden sm:block max-w-[180px]">
                {restaurant.name}
              </span>
            )}

            <div className="w-px h-4 bg-slate-700 hidden sm:block" />

            {/* Date navigation */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              <div className="relative">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                />
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 border border-slate-700 rounded-lg min-w-[120px]">
                  <Calendar className="w-3 h-3 text-blue-400 flex-shrink-0 pointer-events-none" />
                  <span className="text-xs font-semibold text-white pointer-events-none">
                    {formatDateDisplay(selectedDate)}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setSelectedDate(shiftDate(selectedDate, 1))}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>

              {selectedDate !== today && (
                <button
                  onClick={() => setSelectedDate(today)}
                  className="px-2.5 py-1 text-xs font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg transition-colors"
                >
                  Today
                </button>
              )}
            </div>
          </div>

          {/* Right side: live indicator, last updated, close */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium border ${
              realtimeConnected
                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                : 'bg-slate-800 border-slate-700 text-slate-500'
            }`}>
              <Wifi className={`w-3 h-3 ${realtimeConnected ? 'text-emerald-400' : 'text-slate-500'}`} />
              {realtimeConnected ? 'Live' : 'Offline'}
            </div>

            {lastUpdatedLabel && (
              <div className="items-center gap-1 text-xs text-slate-500 hidden lg:flex">
                <RefreshCw className="w-3 h-3" />
                {lastUpdatedLabel}
              </div>
            )}

            <button
              onClick={() => window.close()}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
            >
              <ArrowLeft className="w-3 h-3" />
              <span className="hidden sm:inline">Close</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <main className="flex-1 px-4 py-3 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-500">Loading service view...</p>
          </div>
        ) : (
          <ReservationGrid
            reservations={reservations}
            tables={tables}
            restaurant={restaurant}
            selectedDate={selectedDate}
            onReservationClick={handleReservationClick}
          />
        )}
      </main>

      {/* ── Reservation detail panel (journey) ───────────────────────────────── */}
      {expandedId && restaurant && (() => {
        const r = reservations.find(res => res.id === expandedId);
        if (!r) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setExpandedId(null)}>
            <div
              className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
                <div>
                  <h2 className="text-base font-bold text-white">{r.customer_name}</h2>
                  <p className="text-sm text-slate-400 mt-0.5">
                    Party of {r.party_size} ·{' '}
                    {new Date(r.start_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    {r.end_time && ` – ${new Date(r.end_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}
                  </p>
                </div>
                <button
                  onClick={() => setExpandedId(null)}
                  className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  ✕
                </button>
              </div>
              <div className="p-5">
                <ReservationJourneyPanel
                  reservation={r}
                  onUpdate={() => {
                    getRestaurantReservations(effectiveRestaurantId, selectedDate)
                      .then(data => { setReservations(data); setLastUpdated(new Date()); })
                      .catch(() => {});
                  }}
                  dessertsEnabled={restaurant.desserts_enabled ?? true}
                  posEnabled={restaurant.sumup_pos_enabled ?? false}
                  restaurantId={restaurant.id}
                />
              </div>
              <div className="px-5 pb-5">
                <button
                  onClick={() => { setOpenChatId(r.id); }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors"
                >
                  Open Chat
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Chat panel ────────────────────────────────────────────────────────── */}
      {openChatId && restaurant && (() => {
        const r = reservations.find(res => res.id === openChatId);
        if (!r) return null;
        return (
          <ReservationChatPanel
            reservation={r}
            restaurantId={effectiveRestaurantId}
          />
        );
      })()}
    </div>
  );
}
