import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Layout } from '../components/Layout';
import { Button } from '../components/Button';
import { BookingControlBar, BookingParams } from '../components/BookingControlBar';
import { PremiumCustomerFloorplanView } from '../components/PremiumCustomerFloorplanView';
import { CustomerTableMapNew } from '../components/CustomerTableMapNew';
import { TableSelectionModal } from '../components/TableSelectionModal';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { getRestaurant, getRecentBookingCount } from '../services/restaurants';
import { getAvailability } from '../services/reservations';
import { getActiveCombinationsForAvailability } from '../services/combinations';
import { Restaurant, TableAvailability, AvailabilityQuery } from '../lib/types';
import { formatOpeningHoursForDate, checkBookingLimits, BookingLimitViolation } from '../lib/utils';
import { RestaurantHeroSection } from '../components/RestaurantHeroSection';
import { supabase } from '../lib/supabase';
import {
  ArrowLeft, Calendar, Clock, Users, Star, Utensils, Wifi, Car,
  Accessibility, UtensilsCrossed, Sparkles, TrendingUp, ChevronDown, ChevronUp,
  Info,
} from 'lucide-react';
import { USE_PREMIUM_CUSTOMER_MAP } from '../lib/constants';
import { TableMapSkeleton } from '../components/SkeletonLoader';
import { logAppError } from '../services/errorLogger';

function getOrCreateSessionKey(): string {
  const key = 'booking_session_key';
  let sessionKey = sessionStorage.getItem(key);
  if (!sessionKey) {
    sessionKey = `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    sessionStorage.setItem(key, sessionKey);
  }
  return sessionKey;
}

interface AvailabilityPageProps {
  restaurantId: string;
  query: AvailabilityQuery;
  onBack: () => void;
  onSelectTable: (table: TableAvailability, useAlternative: boolean) => void;
  onStaffLogin: () => void;
  onManageReservation: () => void;
  /** Called when the user changes date/time/party on this page */
  onQueryChange?: (query: AvailabilityQuery) => void;
}

export function AvailabilityPage({
  restaurantId,
  query,
  onBack,
  onSelectTable,
  onStaffLogin,
  onManageReservation,
  onQueryChange,
}: AvailabilityPageProps) {
  // Local booking params — owned here so map stays mounted when they change
  const [localQuery, setLocalQuery] = useState<AvailabilityQuery>(query);
  // Sync if parent pushes a new query (e.g. initial URL load)
  const prevQueryRef = useRef(query);
  useEffect(() => {
    if (
      query.date !== prevQueryRef.current.date ||
      query.time !== prevQueryRef.current.time ||
      query.party_size !== prevQueryRef.current.party_size
    ) {
      prevQueryRef.current = query;
      setLocalQuery(query);
    }
  }, [query]);

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [tables, setTables] = useState<TableAvailability[]>([]);
  const [areas, setAreas] = useState<{ id: string; name: string; order: number }[]>([]);
  const [activeAreaId, setActiveAreaId] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<TableAvailability | null>(null);
  const [showModal, setShowModal] = useState(false);
  // initialLoad = true means first paint (show skeleton), false = in-place refresh
  const [initialLoad, setInitialLoad] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [restaurantLoaded, setRestaurantLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [floorplanInfo, setFloorplanInfo] = useState<{ id: string; version: number; engine: string } | null>(null);
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [mobileInfoExpanded, setMobileInfoExpanded] = useState(false);
  // Track whether the selected table is still valid after a param change
  const [tableInvalidated, setTableInvalidated] = useState(false);
  // Max combined capacity across all active online combinations — used to extend the party size limit
  const [maxCombinedCapacity, setMaxCombinedCapacity] = useState<number>(0);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      setIsDebugMode(import.meta.env.DEV && params.has('debug'));
    }
  }, []);

  // Abort controller for stale request protection
  const abortRef = useRef<AbortController | null>(null);

  const loadAvailability = useCallback(async (q: AvailabilityQuery, isFirst: boolean) => {
    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (isFirst) {
      setInitialLoad(true);
    } else {
      setIsUpdating(true);
    }
    setError(null);

    try {
      const sessionKey = getOrCreateSessionKey();
      const { data: { user } } = await supabase.auth.getUser();
      console.log('[CustomerAvailabilityAuth]', {
        isLoggedIn: !!user,
        userId: user?.id ?? null,
        restaurantId,
        date: q.date,
        time: q.time,
        partySize: q.party_size,
      });
      const tablesData = await getAvailability(
        restaurantId,
        q.date,
        q.time,
        q.party_size,
        sessionKey
      );

      // Ignore stale responses
      if (controller.signal.aborted) return;

      const validSingleTablesCount = tablesData.filter(t => t.status === 'green' && !t.joinedCombinations?.length).length;
      const validJoinedCombosCount = tablesData.filter(t => t.joinedCombinations?.some(jc => jc.available)).length;
      console.log('[CustomerAvailabilityResult]', {
        isLoggedIn: !!user,
        validSingleTablesCount,
        validJoinedCombinationsCount: validJoinedCombosCount,
        totalTablesReturned: tablesData.length,
      });

      setTables(tablesData);

      // If currently selected table is no longer suitable, clear it
      setSelectedTable(prev => {
        if (!prev) return null;
        const updated = tablesData.find(t => t.id === prev.id);
        if (!updated || updated.status === 'red') {
          setTableInvalidated(true);
          return null;
        }
        setTableInvalidated(false);
        return prev;
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error('[AvailabilityPage] Failed to load availability:', err);
      setError('We couldn\'t load table availability. Please refresh or try again.');
      logAppError({
        area: 'availability',
        event_type: 'availability_load_failed',
        restaurant_id: restaurantId,
        message: err instanceof Error ? err.message : 'Failed to load availability',
      });
    } finally {
      if (!controller.signal.aborted) {
        setInitialLoad(false);
        setIsUpdating(false);
      }
    }
  }, [restaurantId]);

  const loadRestaurantAndAreas = useCallback(async () => {
    try {
      const [restaurantData, areasDataResult, recentCount, activeCombinations] = await Promise.all([
        getRestaurant(restaurantId),
        supabase
          .from('areas')
          .select('id, name, order')
          .eq('restaurant_id', restaurantId)
          .order('order', { ascending: true }),
        getRecentBookingCount(restaurantId),
        getActiveCombinationsForAvailability(restaurantId).catch(() => []),
      ]);

      // Compute max combined capacity so we can extend the party size limit
      const maxCombo = activeCombinations.reduce((max, c) => Math.max(max, c.combined_capacity ?? 0), 0);
      setMaxCombinedCapacity(maxCombo);

      setRestaurant(restaurantData
        ? { ...restaurantData, recent_bookings: recentCount }
        : null
      );

      const { data: areasData, error: areasError } = areasDataResult;
      if (areasError) console.error('[AvailabilityPage] Failed to load areas:', areasError);

      if (areasData && areasData.length > 0) {
        setAreas(areasData);
        setActiveAreaId(areasData[0].id);
      } else {
        const { data: newArea } = await supabase
          .from('areas')
          .insert({ restaurant_id: restaurantId, name: 'Main Room', order: 0 })
          .select()
          .single();
        if (newArea) {
          setAreas([newArea]);
          setActiveAreaId(newArea.id);
        }
      }
    } catch (err) {
      console.error('[AvailabilityPage] Failed to load restaurant:', err);
      setError('We couldn\'t load the restaurant. Please refresh or try again.');
      logAppError({
        area: 'floorplan',
        event_type: 'floorplan_load_failed',
        restaurant_id: restaurantId,
        message: err instanceof Error ? err.message : 'Failed to load restaurant data',
      });
    } finally {
      setRestaurantLoaded(true);
    }
  }, [restaurantId]);

  // Load restaurant/areas once on mount
  useEffect(() => {
    loadRestaurantAndAreas();
  }, [loadRestaurantAndAreas]);

  // Load availability whenever localQuery changes
  useEffect(() => {
    const isFirst = !restaurantLoaded;
    loadAvailability(localQuery, isFirst);
  }, [localQuery, loadAvailability]);

  // Real-time subscriptions
  useEffect(() => {
    if (!restaurantId) return;

    const holdsChannel = supabase
      .channel(`table-holds-${restaurantId}-${localQuery.date}-${localQuery.time}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_holds' }, () => {
        loadAvailability(localQuery, false);
      })
      .subscribe();

    const reservationsChannel = supabase
      .channel(`reservations-${restaurantId}-${localQuery.date}-${localQuery.time}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reservations', filter: `restaurant_id=eq.${restaurantId}` },
        () => { loadAvailability(localQuery, false); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(holdsChannel);
      supabase.removeChannel(reservationsChannel);
    };
  }, [restaurantId, localQuery, loadAvailability]);

  const handleParamsChange = useCallback((params: BookingParams) => {
    const newQuery: AvailabilityQuery = {
      date: params.date,
      time: params.time,
      party_size: params.partySize,
    };
    setLocalQuery(newQuery);
    setShowModal(false);
    setTableInvalidated(false);
    // Notify parent so URL updates (shallow replace)
    onQueryChange?.(newQuery);
  }, [onQueryChange]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const handleTableSelect = (table: TableAvailability) => {
    // Block selection if booking limits are violated — no hold should be created
    if (bookingLimitViolation) return;

    const isJoinedCombo = !!table.selectedCombination;
    const normalizedStatus =
      table.status === 'green' ? 'available' :
      table.status === 'yellow' ? 'alternative' :
      table.status === 'amber' ? 'alternative' : 'unavailable';

    if (normalizedStatus === 'available' || normalizedStatus === 'alternative' || isJoinedCombo) {
      setSelectedTable(table);
      setShowModal(true);
    }
  };

  const handleFloorplanLoaded = (info: { id: string; version: number; engine: string }) => {
    setFloorplanInfo(info);
  };

  const handleModalClose = () => {
    setShowModal(false);
    setSelectedTable(null);
  };

  const handleModalConfirm = async (tableId: string, time: string, holdToken?: string, expiresAt?: string, holdGroupToken?: string) => {
    if (!selectedTable) return;
    const useAlternative = time !== localQuery.time;
    try {
      const tableWithHold = { ...selectedTable, holdToken, holdExpiresAt: expiresAt, holdGroupToken };
      if (useAlternative) {
        tableWithHold.suggested_start = new Date(`${localQuery.date}T${time}:00`).toISOString();
        await onSelectTable(tableWithHold, true);
      } else {
        await onSelectTable(tableWithHold, false);
      }
      setShowModal(false);
      setSelectedTable(null);
    } catch (err) {
      console.error('[AvailabilityPage] Failed to confirm booking:', err);
      throw err;
    }
  };

  const filteredTables = useMemo(
    () => activeAreaId ? tables.filter(t => t.area_id === activeAreaId) : tables,
    [activeAreaId, tables]
  );

  const { availableCount, alternativeCount } = useMemo(() => ({
    availableCount: filteredTables.filter(t => t.status === 'green').length,
    alternativeCount: filteredTables.filter(t => t.status === 'yellow').length,
  }), [filteredTables]);

  const bookingParams: BookingParams = {
    date: localQuery.date,
    time: localQuery.time,
    partySize: localQuery.party_size,
  };

  const bookingLimitViolation = useMemo((): BookingLimitViolation | null => {
    if (!restaurant) return null;
    // If the restaurant has active joinable combinations that can accommodate the party,
    // extend the effective max party size so the limit is not enforced for combo bookings.
    const baseMax = restaurant.max_online_party_size ?? 8;
    const effectiveMax = maxCombinedCapacity > baseMax ? maxCombinedCapacity : baseMax;
    const violation = checkBookingLimits(
      localQuery.date,
      localQuery.time,
      localQuery.party_size,
      restaurant.minimum_booking_notice_minutes ?? 120,
      effectiveMax
    );
    const validJoinedCombosCount = tables.filter(t => t.joinedCombinations?.some(jc => jc.available)).length;
    console.log('[MaxPartyGate]', {
      partySize: localQuery.party_size,
      maxOnlinePartySize: baseMax,
      maxCombinedCapacity,
      effectiveMax,
      validJoinedCombinationsCount: validJoinedCombosCount,
      shouldShowContactRestaurant: violation?.type === 'party_size',
      violationType: violation?.type ?? null,
    });
    return violation;
  }, [restaurant, localQuery, maxCombinedCapacity, tables]);

  // Show skeleton only on true initial load (before restaurant and first availability both arrive)
  const showSkeleton = initialLoad && !restaurantLoaded;

  if (showSkeleton) {
    return (
      <Layout onStaffLogin={onStaffLogin} onManageReservation={onManageReservation} bookingStep="select-table">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 border-4 border-app-accent border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-xl font-semibold text-app-text mb-2">Checking availability</p>
            <p className="text-app-text-secondary">Loading table map...</p>
          </div>
          <TableMapSkeleton />
        </div>
      </Layout>
    );
  }

  if (!restaurant && restaurantLoaded) {
    return (
      <Layout onStaffLogin={onStaffLogin} onManageReservation={onManageReservation} bookingStep="select-table">
        <div className="text-center py-12">
          <p className="text-app-text-secondary mb-4">Restaurant not found</p>
          <Button onClick={onBack}>Go Back</Button>
        </div>
      </Layout>
    );
  }

  if (error && !restaurant) {
    return (
      <Layout onStaffLogin={onStaffLogin} onManageReservation={onManageReservation} bookingStep="select-table">
        <div className="max-w-2xl mx-auto mt-12">
          <div className="premium-card rounded-2xl border-red-200 p-8">
            <div className="text-center">
              <div className="text-red-600 text-5xl mb-4">⚠</div>
              <h2 className="text-2xl font-bold text-app-text mb-3">Something Went Wrong</h2>
              <p className="text-app-text-secondary mb-6">
                We encountered an error while loading the floorplan. Please try again.
              </p>
              <div className="flex gap-3 justify-center">
                <Button onClick={() => { setError(null); loadAvailability(localQuery, true); }}>Reload</Button>
                <Button variant="secondary" onClick={onBack}>Go Back</Button>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  const mapContent = (
    <ErrorBoundary onReset={() => loadAvailability(localQuery, false)}>
      {USE_PREMIUM_CUSTOMER_MAP ? (
        <PremiumCustomerFloorplanView
          restaurantId={restaurantId}
          areaId={activeAreaId || undefined}
          tables={filteredTables}
          partySize={localQuery.party_size}
          onTableSelect={handleTableSelect}
          onFloorplanLoaded={handleFloorplanLoaded}
        />
      ) : (
        <CustomerTableMapNew
          tables={filteredTables}
          onTableClick={handleTableSelect}
          areaId={activeAreaId || undefined}
          partySize={localQuery.party_size}
        />
      )}
    </ErrorBoundary>
  );

  return (
    <Layout onStaffLogin={onStaffLogin} onManageReservation={onManageReservation} bookingStep="select-table">
      {/* ── Mobile layout ── */}
      {/* Normal document flow — info panel expands naturally, map moves down rather than shrinking */}
      <div className="flex flex-col sm:hidden -mx-4 -mt-8 pb-6">
        {/* Compact info strip */}
        <div className="flex-shrink-0 premium-card mx-4 mt-4 rounded-2xl overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 text-left"
            onClick={() => setMobileInfoExpanded(v => !v)}
          >
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={e => { e.stopPropagation(); onBack(); }}
                className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors mr-1"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-app-text" />
              </button>
              <div className="min-w-0">
                <div className="font-bold text-app-text text-base truncate">{restaurant?.name}</div>
                <div className="flex items-center gap-1.5 text-xs text-app-text-secondary flex-wrap">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-app-accent" />
                    {formatDate(localQuery.date).split(',')[0]}
                  </span>
                  <span className="text-app-text-tertiary">·</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-app-accent" />
                    {formatTime(localQuery.time)}
                  </span>
                  <span className="text-app-text-tertiary">·</span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3 text-app-accent" />
                    {localQuery.party_size}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
              {bookingLimitViolation ? (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    background: bookingLimitViolation.type === 'party_size'
                      ? 'rgba(185,100,40,0.15)' : 'rgba(60,130,200,0.12)',
                    color: bookingLimitViolation.type === 'party_size'
                      ? 'rgba(230,155,80,0.95)' : 'rgba(120,180,230,0.95)',
                  }}>
                  {bookingLimitViolation.type === 'party_size' ? 'Contact us' : 'Choose later time'}
                </span>
              ) : availableCount > 0 ? (
                <span className="text-xs font-semibold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
                  {availableCount} available
                </span>
              ) : alternativeCount > 0 ? (
                <span className="text-xs font-semibold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">
                  {alternativeCount} alt. times
                </span>
              ) : null}
              {mobileInfoExpanded ? (
                <ChevronUp className="w-4 h-4 text-app-text-tertiary" />
              ) : (
                <ChevronDown className="w-4 h-4 text-app-text-tertiary" />
              )}
            </div>
          </button>

          {mobileInfoExpanded && (
            <div className="px-4 pb-4 border-t border-app-border/30 pt-3 space-y-3">
              {/* Mobile booking controls */}
              <BookingControlBar
                params={bookingParams}
                onParamsChange={handleParamsChange}
                isUpdating={isUpdating}
                className="w-full flex-wrap"
              />

              {tableInvalidated && !bookingLimitViolation && (
                <p className="text-xs text-amber-400 bg-amber-400/10 rounded-lg px-3 py-2">
                  Booking details changed — please choose a table again.
                </p>
              )}

              {bookingLimitViolation && (
                <div
                  className="rounded-xl px-3 py-3 text-xs flex items-start gap-2"
                  style={{
                    background: bookingLimitViolation.type === 'party_size'
                      ? 'rgba(185,100,40,0.12)' : 'rgba(60,130,200,0.10)',
                    border: bookingLimitViolation.type === 'party_size'
                      ? '1px solid rgba(185,100,40,0.35)' : '1px solid rgba(60,130,200,0.30)',
                    color: bookingLimitViolation.type === 'party_size'
                      ? 'rgba(230,155,80,0.95)' : 'rgba(120,180,230,0.95)',
                  }}
                >
                  <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>{bookingLimitViolation.message}</span>
                </div>
              )}

              {restaurant?.description && (
                <p className="text-xs text-app-text-secondary leading-relaxed">{restaurant.description}</p>
              )}

              {/* Mobile hero: image + location card */}
              {restaurant && (
                <RestaurantHeroSection restaurant={restaurant} date={localQuery.date} />
              )}

              <div className="flex flex-wrap gap-3">
                {(restaurant?.cuisine || restaurant?.business_type) && (
                  <div className="flex items-center gap-1.5 text-xs text-app-text-secondary">
                    <Utensils className="w-3.5 h-3.5 text-app-accent" />
                    <span>{restaurant.cuisine || restaurant.business_type}</span>
                  </div>
                )}
                {(restaurant?.google_rating || restaurant?.rating) && (
                  <div className="flex items-center gap-1.5 text-xs text-app-text-secondary">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <span className="font-semibold text-app-text">
                      {(restaurant.google_rating ?? restaurant.rating!).toFixed(1)}
                    </span>
                  </div>
                )}
                {restaurant?.recent_bookings && restaurant.recent_bookings > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-app-text-secondary">
                    <span className="text-app-text-tertiary">{restaurant.recent_bookings} booked recently</span>
                  </div>
                )}
              </div>

              {areas.length > 1 && (
                <div className="flex gap-2 flex-wrap pt-1">
                  {areas.map(area => (
                    <button
                      key={area.id}
                      onClick={() => setActiveAreaId(area.id)}
                      className={`px-3 py-1.5 rounded-lg font-medium transition-all text-xs ${
                        activeAreaId === area.id
                          ? 'bg-app-accent text-white shadow-sm'
                          : 'bg-app-bg-tertiary text-app-text-secondary hover:bg-app-bg border border-app-border'
                      }`}
                    >
                      {area.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Scroll-safe drag handle — safe touch target for scrolling past the map.
            Sits outside the interactive map layer so vertical swipes scroll the page. */}
        <div
          className="mx-4 mt-3 flex flex-col items-center justify-center gap-1 select-none"
          style={{ height: '36px', touchAction: 'pan-y', pointerEvents: 'none' }}
          aria-hidden="true"
        >
          <div className="w-8 h-1 rounded-full bg-white/20" />
        </div>

        {/* Map — fixed minimum height so it stays usable when info is expanded */}
        <div
          className="mx-4 relative rounded-2xl overflow-hidden"
          style={{ minHeight: '460px', height: 'calc(100svh - 200px)', maxHeight: '680px' }}
        >
          {mapContent}
          {/* Subtle updating overlay — does NOT blank the map */}
          {isUpdating && (
            <div className="absolute inset-0 pointer-events-none rounded-2xl transition-opacity" style={{ background: 'rgba(0,0,0,0.18)' }} />
          )}
        </div>
      </div>

      {/* ── Desktop layout ── */}
      <div className="hidden sm:block max-w-6xl mx-auto">
        <Button variant="secondary" onClick={onBack} className="mb-6">
          <ArrowLeft className="w-4 h-4 inline mr-2" />
          Back
        </Button>

        {/* Restaurant info card */}
        {restaurant && (
          <div className="premium-card rounded-2xl p-6 sm:p-8 mb-5">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <h1 className="text-2xl sm:text-3xl font-bold text-app-text leading-tight">
                    {restaurant.name}
                  </h1>
                  {restaurant.price_range && (
                    <span className="text-lg font-semibold text-app-text-secondary">
                      {restaurant.price_range.replace(/\$/g, '£')}
                    </span>
                  )}
                </div>

                {((restaurant.google_rating || restaurant.rating) || (restaurant.recent_bookings && restaurant.recent_bookings > 0)) && (
                  <div className="flex items-center gap-3 mb-3 flex-wrap">
                    {(restaurant.google_rating || restaurant.rating) && (
                      <>
                        <div className="flex items-center gap-1.5">
                          <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
                          <span className="text-lg font-bold text-app-text">
                            {(restaurant.google_rating ?? restaurant.rating!).toFixed(1)}
                          </span>
                        </div>
                        {restaurant.google_rating && restaurant.google_review_count ? (
                          <>
                            <span className="text-sm text-app-text-tertiary">
                              ({restaurant.google_review_count.toLocaleString()} Google reviews)
                            </span>
                            <span className="inline-flex items-center gap-1 text-xs text-app-text-tertiary/70 bg-app-bg-tertiary/50 px-1.5 py-0.5 rounded border border-app-border/30">
                              <svg width="10" height="10" viewBox="0 0 24 24" className="flex-shrink-0">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                              </svg>
                              Google
                            </span>
                          </>
                        ) : restaurant.review_count ? (
                          <span className="text-sm text-app-text-tertiary">({restaurant.review_count} reviews)</span>
                        ) : null}
                      </>
                    )}
                    {restaurant.recent_bookings && restaurant.recent_bookings > 0 && (
                      <>
                        {(restaurant.google_rating || restaurant.rating) && (
                          <span className="text-app-text-tertiary">•</span>
                        )}
                        <span className="text-sm text-app-text-tertiary">{restaurant.recent_bookings} booked recently</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {restaurant.tags && restaurant.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 justify-end">
                  {restaurant.tags.includes('top_rated') && (
                    <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg flex items-center gap-1.5">
                      <Star className="w-3.5 h-3.5 fill-current" />Top Rated
                    </div>
                  )}
                  {restaurant.tags.includes('new') && (
                    <div className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />New
                    </div>
                  )}
                  {restaurant.tags.includes('popular') && (
                    <div className="bg-gradient-to-r from-pink-500 to-rose-500 text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5" />Popular
                    </div>
                  )}
                </div>
              )}
            </div>

            {restaurant.description && (
              <p className="text-sm text-app-text-secondary mb-4 leading-relaxed max-w-3xl">
                {restaurant.description}
              </p>
            )}

            {/* Two-column hero: location card + hero image (desktop) / stacked (mobile) */}
            <RestaurantHeroSection restaurant={restaurant} date={localQuery.date} />

            <div className="flex flex-wrap gap-4 mb-4">
              <div className="flex items-center gap-2 text-sm text-app-text-secondary">
                <Clock className="w-4 h-4 text-app-accent" />
                <span>{formatOpeningHoursForDate(restaurant, localQuery.date)}</span>
              </div>
              {(restaurant.cuisine || restaurant.business_type) && (
                <div className="flex items-center gap-2 text-sm text-app-text-secondary">
                  <Utensils className="w-4 h-4 text-app-accent" />
                  <span>{restaurant.cuisine || restaurant.business_type}</span>
                </div>
              )}
            </div>

            {restaurant.amenities && restaurant.amenities.length > 0 && (
              <div className="flex flex-wrap gap-3 mb-4">
                {restaurant.amenities.includes('outdoor_seating') && (
                  <div className="flex items-center gap-1.5 text-xs text-app-text-tertiary bg-app-bg-tertiary px-3 py-1.5 rounded-lg border border-app-border">
                    <UtensilsCrossed className="w-3.5 h-3.5" /><span>Outdoor Seating</span>
                  </div>
                )}
                {restaurant.amenities.includes('wifi') && (
                  <div className="flex items-center gap-1.5 text-xs text-app-text-tertiary bg-app-bg-tertiary px-3 py-1.5 rounded-lg border border-app-border">
                    <Wifi className="w-3.5 h-3.5" /><span>WiFi</span>
                  </div>
                )}
                {restaurant.amenities.includes('parking') && (
                  <div className="flex items-center gap-1.5 text-xs text-app-text-tertiary bg-app-bg-tertiary px-3 py-1.5 rounded-lg border border-app-border">
                    <Car className="w-3.5 h-3.5" /><span>Parking</span>
                  </div>
                )}
                {restaurant.amenities.includes('wheelchair_accessible') && (
                  <div className="flex items-center gap-1.5 text-xs text-app-text-tertiary bg-app-bg-tertiary px-3 py-1.5 rounded-lg border border-app-border">
                    <Accessibility className="w-3.5 h-3.5" /><span>Wheelchair Accessible</span>
                  </div>
                )}
              </div>
            )}

            {restaurant.popular_dishes && restaurant.popular_dishes.length > 0 && (
              <div className="mb-4 p-4 bg-gradient-to-br from-app-bg-tertiary/50 to-app-bg rounded-xl border border-app-border">
                <div className="flex items-center gap-2 mb-2">
                  <UtensilsCrossed className="w-4 h-4 text-app-accent" />
                  <span className="text-xs font-semibold text-app-text-tertiary uppercase tracking-wide">Popular Dishes</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {restaurant.popular_dishes.map((dish, idx) => (
                    <span key={idx} className="text-sm text-app-text-secondary">
                      {dish}{idx < restaurant.popular_dishes!.length - 1 ? ',' : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Table selection card */}
        <div className="premium-card rounded-2xl p-6 sm:p-8">
          {/* Booking controls bar */}
          <div className="mb-5">
            <BookingControlBar
              params={bookingParams}
              onParamsChange={handleParamsChange}
              isUpdating={isUpdating}
              className="w-full"
            />
          </div>

          {tableInvalidated && !bookingLimitViolation && (
            <div
              className="mb-4 rounded-xl px-4 py-3 text-sm flex items-center gap-2"
              style={{
                background: 'rgba(185,140,40,0.12)',
                border: '1px solid rgba(185,140,40,0.30)',
                color: 'rgba(210,175,80,0.90)',
              }}
            >
              <Info className="w-4 h-4 flex-shrink-0" />
              Booking details changed — please choose a table again.
            </div>
          )}

          {bookingLimitViolation && (
            <div
              className="mb-5 rounded-xl px-4 py-4 text-sm flex items-start gap-3"
              style={{
                background: bookingLimitViolation.type === 'party_size'
                  ? 'rgba(185,100,40,0.12)'
                  : 'rgba(60,130,200,0.10)',
                border: bookingLimitViolation.type === 'party_size'
                  ? '1px solid rgba(185,100,40,0.35)'
                  : '1px solid rgba(60,130,200,0.30)',
                color: bookingLimitViolation.type === 'party_size'
                  ? 'rgba(230,155,80,0.95)'
                  : 'rgba(120,180,230,0.95)',
              }}
            >
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{bookingLimitViolation.message}</span>
            </div>
          )}

          <div className="mb-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-app-text leading-tight">
                  Select Your Table
                </h2>
                {!bookingLimitViolation && (
                  <p className="text-base text-app-text-secondary leading-relaxed mt-1">
                    {availableCount > 0 ? (
                      <>
                        {availableCount} {availableCount === 1 ? 'table' : 'tables'} available
                        {alternativeCount > 0 && (
                          <span className="text-app-text-tertiary">, {alternativeCount} with alternative times</span>
                        )}
                      </>
                    ) : (
                      <>
                        No tables available at this time
                        {alternativeCount > 0 && (
                          <span className="text-app-text-tertiary">
                            , but {alternativeCount} {alternativeCount === 1 ? 'table has' : 'tables have'} alternative times
                          </span>
                        )}
                      </>
                    )}
                  </p>
                )}
              </div>
            </div>
          </div>

          {areas.length > 1 && (
            <div className="mb-5 flex gap-2 flex-wrap">
              {areas.map(area => (
                <button
                  key={area.id}
                  onClick={() => setActiveAreaId(area.id)}
                  className={`px-4 py-2.5 rounded-xl font-medium transition-all text-sm ${
                    activeAreaId === area.id
                      ? 'bg-app-accent text-white shadow-sm'
                      : 'bg-app-bg-tertiary text-app-text-secondary hover:bg-app-bg border border-app-border'
                  }`}
                >
                  {area.name}
                </button>
              ))}
            </div>
          )}

          {isDebugMode && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-xs font-mono space-y-1">
              <div className="font-bold text-yellow-900 mb-2">Debug Info</div>
              <div className="text-yellow-800">Floorplan ID: {floorplanInfo?.id || 'loading...'}</div>
              <div className="text-yellow-800">Version: {floorplanInfo?.version || 'N/A'}</div>
              <div className="text-yellow-800">Renderer: V2 FloorplanCanvas</div>
              <div className="text-yellow-800">Modal Open: {showModal ? 'true' : 'false'}</div>
              <div className="text-yellow-800">Selected Table ID: {selectedTable?.id || 'none'}</div>
              <div className="text-yellow-800">Selected Status: {selectedTable?.status || 'none'}</div>
            </div>
          )}

          {/* Map with subtle overlay during refresh — never blanked */}
          <div className="relative">
            <div className={USE_PREMIUM_CUSTOMER_MAP ? 'w-full h-[500px] md:h-[580px] lg:h-[640px]' : ''}>
              {mapContent}
            </div>
            {isUpdating && (
              <div
                className="absolute inset-0 pointer-events-none rounded-xl transition-opacity duration-300"
                style={{ background: 'rgba(0,0,0,0.15)' }}
              />
            )}
          </div>

          {!USE_PREMIUM_CUSTOMER_MAP && (
            <div className="mt-6 flex justify-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-green-500" />
                <span className="text-slate-700">Available</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-amber-500" />
                <span className="text-slate-700">Not available at selected time — alternatives shown</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-slate-400" />
                <span className="text-slate-700">Unavailable</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {showModal && selectedTable && (
        <TableSelectionModal
          table={selectedTable}
          partySize={localQuery.party_size}
          requestedDate={localQuery.date}
          requestedTime={localQuery.time}
          restaurantId={restaurantId}
          onClose={handleModalClose}
          onConfirm={handleModalConfirm}
        />
      )}
    </Layout>
  );
}
