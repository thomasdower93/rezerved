import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Layout } from '../components/Layout';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PremiumCustomerFloorplanView } from '../components/PremiumCustomerFloorplanView';
import { CustomerTableMapNew } from '../components/CustomerTableMapNew';
import {
  getReservationByToken,
  cancelReservation,
  getAvailabilityExcludingReservation,
  modifyReservation,
} from '../services/reservations';
import { getRestaurant } from '../services/restaurants';
import { getTables } from '../services/tables';
import { supabase } from '../lib/supabase';
import { Reservation, Restaurant, Table, TableAvailability } from '../lib/types';
import { formatOpeningHoursForDate, parseDateTime, addMinutes, formatTime, formatDate, checkBookingLimits, formatDuration, getReservationDuration } from '../lib/utils';
import { SLOT_MINUTES } from '../lib/constants';
import { USE_PREMIUM_CUSTOMER_MAP } from '../lib/constants';
import { logAppError } from '../services/errorLogger';
import { Calendar, Clock, Users, MapPin, Mail, Phone, User, CheckCircle, XCircle, Utensils, ArrowLeft, ArrowRight, CreditCard as Edit3, Loader2, CheckCircle2, AlertTriangle, ChevronDown, MessageSquare, Banknote } from 'lucide-react';

// ── Helpers ────────────────────────────────────────────────────────────────────

function getOrCreateSessionKey(): string {
  const key = 'booking_session_key';
  let sk = sessionStorage.getItem(key);
  if (!sk) {
    sk = `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    sessionStorage.setItem(key, sk);
  }
  return sk;
}

function formatDateDisplay(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function formatTimeDisplay(dateStr: string): string {
  const date = new Date(dateStr);
  const h = date.getHours(), m = date.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${(h % 12) || 12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function canModify(reservation: Reservation): { allowed: boolean; reason?: string } {
  const nonModifiable = ['cancelled', 'declined', 'pending_acceptance', 'pending_payment', 'payment_failed', 'completed', 'expired', 'no-show'];
  if (nonModifiable.includes(reservation.status)) {
    return { allowed: false, reason: 'This reservation cannot be modified.' };
  }
  const cutoff = 2 * 60 * 60 * 1000; // 2 hours in ms
  const start = new Date(reservation.start_time).getTime();
  if (start - Date.now() < cutoff) {
    return {
      allowed: false,
      reason: 'Online changes are no longer available for this reservation. Please contact the restaurant directly.',
    };
  }
  return { allowed: true };
}

// ── Types ──────────────────────────────────────────────────────────────────────

type ModifyStep = 'params' | 'map' | 'confirm' | 'success';

interface ModifyState {
  step: ModifyStep;
  newDate: string;
  newTime: string;
  newPartySize: number;
  newNotes: string;
  selectedTable: TableAvailability | null;
  tables: TableAvailability[];
  areas: { id: string; name: string; order: number }[];
  activeAreaId: string | null;
  loading: boolean;
  error: string | null;
  submitting: boolean;
  emailError: string | null;
}

// ── Main component ─────────────────────────────────────────────────────────────

interface ManageReservationPageProps {
  token: string;
  onNewBooking: () => void;
  onStaffLogin: () => void;
  onManageLookup?: () => void;
  onOpenChat?: () => void;
  preLaunchMode?: boolean;
}

export function ManageReservationPage({ token, onNewBooking, onStaffLogin, onManageLookup, onOpenChat, preLaunchMode }: ManageReservationPageProps) {
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [table, setTable] = useState<Table | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Modification flow
  const [modifyOpen, setModifyOpen] = useState(false);
  const [modify, setModify] = useState<ModifyState | null>(null);

  // Abort ref for availability fetches
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { loadReservation(); }, [token]);

  const loadReservation = async () => {
    try {
      const reservationData = await getReservationByToken(token);
      if (!reservationData) { setLoading(false); return; }

      const [restaurantData, tables] = await Promise.all([
        getRestaurant(reservationData.restaurant_id),
        getTables(reservationData.restaurant_id),
      ]);

      setReservation(reservationData);
      setRestaurant(restaurantData);
      setTable(tables.find(t => t.id === reservationData.table_id) || null);
    } catch (error) {
      console.error('Failed to load reservation:', error);
      logAppError({
        area: 'manage',
        event_type: 'manage_lookup_failed',
        message: error instanceof Error ? error.message : 'Failed to load reservation by token',
      });
    } finally {
      setLoading(false);
    }
  };

  // ── Cancel handlers ──────────────────────────────────────────────────────────

  const handleCancelConfirm = async () => {
    setShowCancelDialog(false);
    setCancelling(true);
    setCancelError(null);
    try {
      await cancelReservation(token);
      await loadReservation();
    } catch (error) {
      const msg = error instanceof Error ? error.message : '';
      setCancelError(
        msg === 'TOKEN_EXPIRED_OR_INVALID'
          ? 'This reservation link has expired or is no longer valid. Please look up your reservation using your reservation code and email address.'
          : 'Failed to cancel reservation. Please try again.'
      );
    } finally {
      setCancelling(false);
    }
  };

  const handlePayDeposit = async () => {
    if (!reservation) return;
    setPaymentLoading(true);
    setPaymentError(null);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-deposit-checkout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reservation_id: reservation.id, manage_token: token }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.checkout_url) {
        throw new Error(result.error || 'Unable to start the deposit payment.');
      }
      window.location.href = result.checkout_url;
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : 'Unable to start the deposit payment.');
      setPaymentLoading(false);
    }
  };

  // ── Modification flow handlers ───────────────────────────────────────────────

  const openModify = () => {
    if (!reservation) return;
    const startDate = reservation.start_time.split('T')[0];
    const startTimeStr = formatTime(new Date(reservation.start_time));
    setModify({
      step: 'params',
      newDate: startDate,
      newTime: startTimeStr,
      newPartySize: reservation.party_size,
      newNotes: reservation.notes || '',
      selectedTable: null,
      tables: [],
      areas: [],
      activeAreaId: null,
      loading: false,
      error: null,
      submitting: false,
      emailError: null,
    });
    setModifyOpen(true);
  };

  const closeModify = () => {
    abortRef.current?.abort();
    setModifyOpen(false);
    setModify(null);
  };

  const handleCheckAvailability = useCallback(async () => {
    if (!modify || !reservation || !restaurant) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setModify(prev => prev ? { ...prev, loading: true, error: null, tables: [], selectedTable: null, step: 'params' } : prev);

    // Validate booking limits before fetching availability
    const limitViolation = checkBookingLimits(
      modify.newDate,
      modify.newTime,
      modify.newPartySize,
      restaurant.minimum_booking_notice_minutes ?? 120,
      restaurant.max_online_party_size ?? 8
    );
    if (limitViolation) {
      setModify(prev => prev ? { ...prev, loading: false, error: limitViolation.message } : prev);
      return;
    }

    try {
      const sessionKey = getOrCreateSessionKey();
      const tablesData = await getAvailabilityExcludingReservation(
        reservation.restaurant_id,
        modify.newDate,
        modify.newTime,
        modify.newPartySize,
        reservation.id,
        sessionKey
      );

      if (controller.signal.aborted) return;

      // Load areas for map
      const { data: areasData } = await supabase
        .from('areas')
        .select('id, name, order')
        .eq('restaurant_id', reservation.restaurant_id)
        .order('order', { ascending: true });

      const areas = areasData || [];
      const activeAreaId = areas.length > 0 ? areas[0].id : null;

      setModify(prev => prev ? {
        ...prev,
        loading: false,
        tables: tablesData,
        areas,
        activeAreaId,
        step: 'map',
        error: null,
      } : prev);
    } catch (err) {
      if (controller.signal.aborted) return;
      setModify(prev => prev ? {
        ...prev,
        loading: false,
        error: 'We couldn\'t load table availability. Please try again.',
      } : prev);
    }
  }, [modify, reservation, restaurant]);

  const handleTableSelect = (selected: TableAvailability) => {
    setModify(prev => prev ? { ...prev, selectedTable: selected, step: 'confirm' } : prev);
  };

  const handleBackToMap = () => {
    setModify(prev => prev ? { ...prev, step: 'map', selectedTable: null } : prev);
  };

  const handleBackToParams = () => {
    setModify(prev => prev ? { ...prev, step: 'params', selectedTable: null, tables: [] } : prev);
  };

  const handleConfirmModification = async () => {
    if (!modify?.selectedTable || !reservation) return;

    // Re-check cutoff
    const cutoffCheck = canModify(reservation);
    if (!cutoffCheck.allowed) {
      setModify(prev => prev ? { ...prev, error: cutoffCheck.reason || 'Cannot modify reservation.' } : prev);
      return;
    }

    setModify(prev => prev ? { ...prev, submitting: true, error: null } : prev);

    const result = await modifyReservation(
      token,
      modify.newDate,
      modify.newTime,
      modify.newPartySize,
      modify.selectedTable.id,
      reservation.customer_name,
      reservation.customer_email,
      reservation.restaurant_id
    );

    if (!result.success) {
      setModify(prev => prev ? {
        ...prev,
        submitting: false,
        error: result.message || 'We couldn\'t update your reservation. Your original booking is still unchanged.',
      } : prev);
      return;
    }

    // Save updated notes (non-blocking — best effort)
    if (result.reservation_id) {
      const trimmedNotes = (modify.newNotes || '').trim();
      await supabase
        .from('reservations')
        .update({ notes: trimmedNotes })
        .eq('id', result.reservation_id);
    }

    setModify(prev => prev ? {
      ...prev,
      submitting: false,
      step: 'success',
      emailError: result.emailError || null,
    } : prev);

    // Reload the reservation so the page shows updated details
    await loadReservation();
  };

  // ── Shared styles ────────────────────────────────────────────────────────────

  const cardStyle = {
    background: 'linear-gradient(160deg, #141210 0%, #0e0c0a 60%, #111009 100%)',
    border: '1px solid rgba(255,255,255,0.07)',
  };

  const sectionStyle = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.07)',
  };

  const rowStyle = { borderBottom: '1px solid rgba(255,255,255,0.05)' };

  const goldBtn = {
    background: 'linear-gradient(135deg, rgba(212,145,93,0.95) 0%, rgba(185,118,68,0.95) 100%)',
    color: 'rgba(20,16,10,0.96)',
    border: '1px solid rgba(212,145,93,0.30)',
    boxShadow: '0 2px 12px rgba(212,145,93,0.22)',
    cursor: 'pointer',
  };

  const ghostBtn = {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.12)',
    color: 'rgba(185,170,148,0.80)',
    cursor: 'pointer',
  };

  // ── Loading state ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Layout onStaffLogin={onStaffLogin} preLaunchMode={preLaunchMode}>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div
              className="w-12 h-12 rounded-full animate-spin mx-auto mb-4"
              style={{ border: '3px solid rgba(212,145,93,0.25)', borderTopColor: 'rgba(212,145,93,0.90)' }}
            />
            <p className="text-sm" style={{ color: 'rgba(185,170,148,0.60)' }}>Loading reservation...</p>
          </div>
        </div>
      </Layout>
    );
  }

  // ── Not found state ──────────────────────────────────────────────────────────

  if (!reservation || !restaurant) {
    return (
      <Layout onStaffLogin={onStaffLogin} preLaunchMode={preLaunchMode}>
        <div className="max-w-md mx-auto">
          <div className="rounded-2xl overflow-hidden shadow-2xl text-center animate-slideUp" style={cardStyle}>
            <div className="px-8 py-12 space-y-5">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
                style={{ background: 'rgba(160,40,40,0.16)', border: '1.5px solid rgba(180,60,60,0.35)' }}
              >
                <XCircle className="w-8 h-8" style={{ color: 'rgba(220,100,100,0.88)' }} />
              </div>
              <div>
                <h1 className="text-2xl font-bold mb-2" style={{ color: 'rgba(240,232,218,0.96)' }}>Link Expired</h1>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(185,170,148,0.65)' }}>
                  This reservation link has expired or is no longer valid. Please look up your reservation using your reservation code and email address.
                </p>
              </div>
              <div className="flex flex-col gap-3 pt-2">
                {onManageLookup && (
                  <button
                    onClick={onManageLookup}
                    className="w-full px-8 py-3 rounded-xl text-sm font-semibold transition-all duration-200"
                    style={goldBtn}
                  >
                    Look Up My Reservation
                  </button>
                )}
                <button
                  onClick={onNewBooking}
                  className="w-full px-8 py-3 rounded-xl text-sm font-semibold transition-all duration-200"
                  style={ghostBtn}
                >
                  Make a New Reservation
                </button>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  const isCancelled = reservation.status === 'cancelled';
  const isDeclined = reservation.status === 'declined';
  const isPendingAcceptance = reservation.status === 'pending_acceptance';
  const isPendingPayment = reservation.status === 'pending_payment';
  const isInactive = isCancelled || isDeclined;
  const hasPreorder = reservation.preorder_items && reservation.preorder_items.length > 0;
  const modifyCheck = canModify(reservation);
  const wasModified = (reservation.modification_count ?? 0) > 0;

  // ── Modification overlay ─────────────────────────────────────────────────────

  if (modifyOpen && modify) {
    return (
      <Layout onStaffLogin={onStaffLogin} compactHeader>
        <div className="max-w-2xl mx-auto space-y-4 animate-slideUp">
          <ModificationFlow
            modify={modify}
            reservation={reservation}
            restaurant={restaurant}
            currentTable={table}
            token={token}
            cardStyle={cardStyle}
            sectionStyle={sectionStyle}
            rowStyle={rowStyle}
            goldBtn={goldBtn}
            ghostBtn={ghostBtn}
            onParamChange={(field, value) =>
              setModify(prev => prev ? { ...prev, [field]: value } : prev)
            }
            onCheckAvailability={handleCheckAvailability}
            onTableSelect={handleTableSelect}
            onBackToMap={handleBackToMap}
            onBackToParams={handleBackToParams}
            onConfirm={handleConfirmModification}
            onClose={closeModify}
            onNewBooking={onNewBooking}
          />
        </div>
      </Layout>
    );
  }

  // ── Main manage view ─────────────────────────────────────────────────────────

  return (
    <Layout onStaffLogin={onStaffLogin}>
      <div className="max-w-2xl mx-auto space-y-4 animate-slideUp">

        {/* Hero panel */}
        <div className="rounded-2xl overflow-hidden shadow-2xl" style={cardStyle}>
          <div className="px-8 pt-10 pb-8 text-center" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex justify-center mb-5">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center"
                style={
                  isInactive
                    ? { background: 'rgba(160,40,40,0.16)', border: '1.5px solid rgba(180,60,60,0.35)' }
                    : isPendingAcceptance || isPendingPayment
                    ? { background: 'rgba(180,120,35,0.16)', border: '1.5px solid rgba(212,145,93,0.35)' }
                    : { background: 'rgba(52,110,72,0.18)', border: '1.5px solid rgba(80,160,100,0.35)' }
                }
              >
                {isInactive ? (
                  <XCircle className="w-8 h-8" style={{ color: 'rgba(220,100,100,0.88)' }} />
                ) : isPendingAcceptance || isPendingPayment ? (
                  <AlertTriangle className="w-8 h-8" style={{ color: 'rgba(230,170,90,0.92)' }} />
                ) : (
                  <CheckCircle className="w-8 h-8" style={{ color: 'rgba(100,185,130,0.90)' }} strokeWidth={2} />
                )}
              </div>
            </div>
            <h1 className="text-3xl font-bold mb-2" style={{ color: 'rgba(240,232,218,0.96)', letterSpacing: '-0.01em' }}>
              {isCancelled
                ? 'Reservation Cancelled'
                : isDeclined
                ? 'Request Declined'
                : isPendingAcceptance
                ? 'Awaiting Restaurant Acceptance'
                : isPendingPayment
                ? 'Deposit Required'
                : 'Your Reservation'}
            </h1>
            {isCancelled && (
              <p className="text-sm" style={{ color: 'rgba(185,170,148,0.65)' }}>This reservation has been cancelled.</p>
            )}
            {isDeclined && (
              <p className="text-sm" style={{ color: 'rgba(185,170,148,0.65)' }}>
                The restaurant was unable to accept this request{reservation.decline_reason ? `: ${reservation.decline_reason}` : '.'}
              </p>
            )}
            {isPendingAcceptance && (
              <p className="text-sm" style={{ color: 'rgba(185,170,148,0.65)' }}>The table is being held while the restaurant reviews your request.</p>
            )}
            {isPendingPayment && (
              <p className="text-sm" style={{ color: 'rgba(185,170,148,0.65)' }}>Your request was accepted. Pay the deposit to finish confirming the reservation.</p>
            )}
            {wasModified && !isCancelled && (
              <div className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full text-xs font-medium"
                style={{ background: 'rgba(212,145,93,0.12)', border: '1px solid rgba(212,145,93,0.25)', color: 'rgba(212,145,93,0.88)' }}>
                <Edit3 className="w-3 h-3" />
                Modified {reservation.modification_count} time{reservation.modification_count !== 1 ? 's' : ''}
                {reservation.modified_at && (
                  <span style={{ color: 'rgba(185,170,148,0.55)' }}>
                    &nbsp;· Last updated {new Date(reservation.modified_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Reservation details */}
          <div className="px-8 py-6" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'rgba(212,145,93,0.70)' }}>
              Reservation Details
            </p>
            <div className="space-y-0 rounded-xl overflow-hidden" style={sectionStyle}>
              <div className="flex items-start gap-3 px-4 py-4" style={rowStyle}>
                <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'rgba(212,145,93,0.78)' }} />
                <div>
                  <div className="text-sm font-semibold" style={{ color: 'rgba(235,225,208,0.92)' }}>{restaurant.name}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'rgba(185,170,148,0.60)' }}>{restaurant.location}</div>
                  {restaurant.address && (
                    <div className="text-xs" style={{ color: 'rgba(185,170,148,0.50)' }}>{restaurant.address}</div>
                  )}
                  <div className="text-xs mt-1" style={{ color: 'rgba(185,170,148,0.45)' }}>
                    Hours: {formatOpeningHoursForDate(restaurant, reservation.start_time.split('T')[0])}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 px-4 py-3.5" style={rowStyle}>
                <Calendar className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(212,145,93,0.78)' }} />
                <span className="text-sm" style={{ color: 'rgba(235,225,208,0.88)' }}>{formatDateDisplay(reservation.start_time)}</span>
              </div>
              <div className="flex items-center gap-3 px-4 py-3.5" style={rowStyle}>
                <Clock className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(212,145,93,0.78)' }} />
                <span className="text-sm" style={{ color: 'rgba(235,225,208,0.88)' }}>
                  {formatTimeDisplay(reservation.start_time)} &ndash; {formatTimeDisplay(reservation.end_time)}
                </span>
              </div>
              <div className="flex items-center gap-3 px-4 py-3.5" style={table ? rowStyle : {}}>
                <Users className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(212,145,93,0.78)' }} />
                <span className="text-sm" style={{ color: 'rgba(235,225,208,0.88)' }}>
                  {reservation.party_size} {reservation.party_size === 1 ? 'Guest' : 'Guests'}
                </span>
              </div>
              {table && (
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <div
                    className="w-4 h-4 rounded-full flex items-center justify-center text-white flex-shrink-0"
                    style={{ background: 'rgba(212,145,93,0.50)', fontSize: '8px', fontWeight: 700 }}
                  >T</div>
                  <span className="text-sm" style={{ color: 'rgba(235,225,208,0.88)' }}>Table {table.name}</span>
                </div>
              )}
            </div>
          </div>

          {/* Guest info */}
          <div className="px-8 py-6" style={{ borderBottom: hasPreorder ? '1px solid rgba(255,255,255,0.06)' : undefined }}>
            <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'rgba(212,145,93,0.70)' }}>
              Guest Information
            </p>
            <div className="space-y-0 rounded-xl overflow-hidden" style={sectionStyle}>
              <div className="flex items-center gap-3 px-4 py-3.5" style={rowStyle}>
                <User className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(212,145,93,0.78)' }} />
                <span className="text-sm" style={{ color: 'rgba(235,225,208,0.88)' }}>{reservation.customer_name}</span>
              </div>
              <div className="flex items-center gap-3 px-4 py-3.5" style={rowStyle}>
                <Mail className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(212,145,93,0.78)' }} />
                <span className="text-sm" style={{ color: 'rgba(235,225,208,0.88)' }}>{reservation.customer_email}</span>
              </div>
              <div className="flex items-center gap-3 px-4 py-3.5" style={reservation.notes ? rowStyle : {}}>
                <Phone className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(212,145,93,0.78)' }} />
                <span className="text-sm" style={{ color: 'rgba(235,225,208,0.88)' }}>{reservation.customer_phone}</span>
              </div>
              {reservation.notes && (
                <div className="px-4 py-4">
                  <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'rgba(212,145,93,0.62)' }}>Special Requests</div>
                  <div className="text-sm" style={{ color: 'rgba(185,170,148,0.75)' }}>{reservation.notes}</div>
                </div>
              )}
            </div>
          </div>

          {/* Pre-order */}
          {hasPreorder && (
            <div className="px-8 py-6">
              <div className="flex items-center gap-2 mb-4">
                <Utensils className="w-4 h-4" style={{ color: 'rgba(212,145,93,0.78)' }} />
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(212,145,93,0.70)' }}>Pre-Order</p>
              </div>
              <div className="rounded-xl overflow-hidden" style={sectionStyle}>
                <div className="px-4 py-2">
                  {reservation.preorder_items!.map((item, index) => (
                    <div
                      key={index}
                      className="flex justify-between py-3 text-sm"
                      style={{ borderBottom: index < reservation.preorder_items!.length - 1 ? '1px solid rgba(255,255,255,0.05)' : undefined }}
                    >
                      <span style={{ color: 'rgba(235,225,208,0.85)' }}>{item.quantity} &times; {item.name}</span>
                      <span className="font-semibold" style={{ color: 'rgba(212,145,93,0.92)' }}>£{(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <div
                  className="px-4 py-3.5 flex justify-between font-bold text-sm"
                  style={{ background: 'rgba(212,145,93,0.09)', borderTop: '1px solid rgba(212,145,93,0.20)' }}
                >
                  <span style={{ color: 'rgba(235,225,208,0.88)' }}>Pre-order total</span>
                  <span style={{ color: 'rgba(212,145,93,0.95)' }}>£{reservation.preorder_total?.toFixed(2) ?? '0.00'}</span>
                </div>
              </div>
            </div>
          )}

          {/* Message the restaurant */}
          {onOpenChat && !isInactive && (
            <div className="px-8 py-6" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare className="w-4 h-4" style={{ color: 'rgba(212,145,93,0.80)' }} />
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(212,145,93,0.70)' }}>
                  Message Restaurant
                </p>
              </div>
              <button
                onClick={onOpenChat}
                className="w-full rounded-xl px-5 py-4 text-left transition-all duration-200 group"
                style={{ background: 'rgba(212,145,93,0.06)', border: '1px solid rgba(212,145,93,0.22)' }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold mb-1" style={{ color: 'rgba(235,225,208,0.90)' }}>
                      Chat with {restaurant.name}
                    </div>
                    <div className="text-xs" style={{ color: 'rgba(185,170,148,0.60)' }}>
                      Need to contact the restaurant about this booking? Send them a message here.
                    </div>
                  </div>
                  <div
                    className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors"
                    style={{ background: 'rgba(212,145,93,0.15)', border: '1px solid rgba(212,145,93,0.30)' }}
                  >
                    <MessageSquare className="w-4 h-4" style={{ color: 'rgba(212,145,93,0.90)' }} />
                  </div>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="space-y-3 pb-8">
          {cancelError && (
            <div
              className="rounded-xl px-4 py-3.5 text-sm"
              style={{ background: 'rgba(160,40,40,0.14)', border: '1px solid rgba(180,60,60,0.35)', color: 'rgba(220,140,140,0.90)' }}
            >
              <p className="mb-2">{cancelError}</p>
              {onManageLookup && (
                <button onClick={onManageLookup} className="underline text-xs font-medium" style={{ color: 'rgba(212,145,93,0.88)', cursor: 'pointer' }}>
                  Look up using reservation code
                </button>
              )}
            </div>
          )}

          {!isInactive && (
            <>
              {isPendingPayment && (
                <button
                  onClick={handlePayDeposit}
                  disabled={paymentLoading}
                  className="w-full py-3.5 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50"
                  style={goldBtn}
                >
                  {paymentLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
                  {paymentLoading ? 'Starting payment...' : 'Pay Deposit'}
                </button>
              )}
              {paymentError && (
                <div className="rounded-xl px-4 py-3.5 text-sm" style={{ background: 'rgba(160,40,40,0.14)', border: '1px solid rgba(180,60,60,0.35)', color: 'rgba(220,140,140,0.90)' }}>
                  {paymentError}
                </div>
              )}
              {modifyCheck.allowed ? (
                <button
                  onClick={openModify}
                  className="w-full py-3.5 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2"
                  style={goldBtn}
                >
                  <Edit3 className="w-4 h-4" />
                  Change Reservation
                </button>
              ) : (
                <div
                  className="rounded-xl px-4 py-3.5 text-sm text-center"
                  style={{ background: 'rgba(212,145,93,0.07)', border: '1px solid rgba(212,145,93,0.18)', color: 'rgba(185,170,148,0.70)' }}
                >
                  {modifyCheck.reason}
                </div>
              )}

              {!cancelError && (
                <button
                  onClick={() => setShowCancelDialog(true)}
                  disabled={cancelling}
                  className="w-full py-3.5 rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: 'rgba(160,40,40,0.16)', border: '1px solid rgba(180,60,60,0.35)', color: 'rgba(220,130,130,0.92)', cursor: cancelling ? 'not-allowed' : 'pointer' }}
                >
                  {cancelling ? 'Cancelling...' : 'Cancel Reservation'}
                </button>
              )}
            </>
          )}

          <button
            onClick={onNewBooking}
            className="w-full py-3.5 rounded-xl text-sm font-semibold transition-all duration-200"
            style={ghostBtn}
          >
            {isInactive ? 'Make a New Reservation' : 'Make Another Reservation'}
          </button>

          <p className="text-center text-xs pt-1 leading-relaxed" style={{ color: 'rgba(185,170,148,0.35)' }}>
            This booking is subject to Rezerved's{' '}
            <a
              href="/booking-terms"
              className="underline hover:opacity-80 transition-opacity"
              style={{ color: 'rgba(212,145,93,0.55)' }}
            >
              Booking Terms
            </a>{' '}
            and the restaurant's{' '}
            <a
              href="/cancellation-policy"
              className="underline hover:opacity-80 transition-opacity"
              style={{ color: 'rgba(212,145,93,0.55)' }}
            >
              cancellation, deposit and no-show policy
            </a>.
          </p>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showCancelDialog}
        title="Cancel Reservation"
        message="Are you sure you want to cancel this reservation? This action cannot be undone."
        confirmLabel="Cancel Reservation"
        cancelLabel="Keep Reservation"
        variant="danger"
        onConfirm={handleCancelConfirm}
        onCancel={() => setShowCancelDialog(false)}
      />
    </Layout>
  );
}

// ── ModificationFlow sub-component ────────────────────────────────────────────

interface ModificationFlowProps {
  modify: ModifyState;
  reservation: Reservation;
  restaurant: Restaurant;
  currentTable: Table | null;
  token: string;
  cardStyle: React.CSSProperties;
  sectionStyle: React.CSSProperties;
  rowStyle: React.CSSProperties;
  goldBtn: React.CSSProperties;
  ghostBtn: React.CSSProperties;
  onParamChange: (field: 'newDate' | 'newTime' | 'newPartySize' | 'newNotes', value: string | number) => void;
  onCheckAvailability: () => void;
  onTableSelect: (t: TableAvailability) => void;
  onBackToMap: () => void;
  onBackToParams: () => void;
  onConfirm: () => void;
  onClose: () => void;
  onNewBooking: () => void;
}

function ModificationFlow({
  modify,
  reservation,
  restaurant,
  currentTable,
  cardStyle,
  sectionStyle,
  rowStyle,
  goldBtn,
  ghostBtn,
  onParamChange,
  onCheckAvailability,
  onTableSelect,
  onBackToMap,
  onBackToParams,
  onConfirm,
  onClose,
  onNewBooking,
}: ModificationFlowProps) {

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: 'rgba(235,225,208,0.92)',
    borderRadius: '10px',
    padding: '10px 14px',
    fontSize: '14px',
    width: '100%',
    outline: 'none',
    colorScheme: 'dark',
  };

  // Bronze accent — matches the top-right "Bookings" button: rgb(212,145,93)
  const accentColor = 'rgba(212,145,93,0.75)';
  const accentColorStrong = 'rgba(212,145,93,0.90)';

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '6px',
    color: accentColor,
  };

  // Build time options in 15-minute increments for the restaurant opening hours
  const timeOptions = React.useMemo(() => {
    const options: string[] = [];
    const dayOfWeek = new Date(modify.newDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const dayHours = restaurant.opening_hours[dayOfWeek];
    if (!dayHours || dayHours.closed) return options;
    const [openH, openM] = dayHours.open.split(':').map(Number);
    const [closeH, closeM] = dayHours.close.split(':').map(Number);
    const openMins  = openH * 60 + openM;
    const closeMins = closeH * 60 + closeM;
    const durMins = getReservationDuration(reservation?.reservation_duration_minutes);
    const lastBookable = closeMins - durMins;
    const nowMins = (() => {
      const n = new Date();
      return n.getHours() * 60 + n.getMinutes() + 15;
    })();
    const todayDate = new Date().toISOString().split('T')[0];
    for (let m = openMins; m <= lastBookable; m += 15) {
      if (modify.newDate === todayDate && m < nowMins) continue;
      const h = Math.floor(m / 60);
      const min = m % 60;
      options.push(`${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`);
    }
    return options;
  }, [modify.newDate, restaurant.opening_hours]);

  // Party size options (1–20)
  const partySizeOptions = Array.from({ length: 20 }, (_, i) => i + 1);

  const oldDateDisplay = formatDateDisplay(reservation.start_time);
  const oldTimeDisplay = formatTimeDisplay(reservation.start_time);
  const newDateDisplay = modify.newDate ? new Date(modify.newDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '';
  const newTimeDisplay = modify.newTime
    ? (() => {
        const [h, m] = modify.newTime.split(':').map(Number);
        const ampm = h >= 12 ? 'PM' : 'AM';
        return `${(h % 12) || 12}:${m.toString().padStart(2, '0')} ${ampm}`;
      })()
    : '';

  // ── Success screen ───────────────────────────────────────────────────────────

  if (modify.step === 'success') {
    return (
      <>
        <div className="rounded-2xl overflow-hidden shadow-2xl" style={cardStyle}>
          <div className="px-8 py-12 text-center space-y-5">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
              style={{ background: 'rgba(52,110,72,0.18)', border: '1.5px solid rgba(80,160,100,0.35)' }}
            >
              <CheckCircle2 className="w-8 h-8" style={{ color: 'rgba(100,185,130,0.90)' }} strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-2" style={{ color: 'rgba(240,232,218,0.96)' }}>Reservation Updated</h2>
              <p className="text-sm" style={{ color: 'rgba(185,170,148,0.65)' }}>Your reservation has been updated successfully.</p>
            </div>
            {modify.emailError ? (
              <div
                className="rounded-xl px-4 py-3.5 text-sm text-left"
                style={{ background: 'rgba(185,140,40,0.10)', border: '1px solid rgba(185,140,40,0.30)', color: 'rgba(210,180,80,0.90)' }}
              >
                Your reservation was updated, but we couldn't send the update email. Please save your reservation code.
              </div>
            ) : (
              <p className="text-xs" style={{ color: 'rgba(185,170,148,0.50)' }}>A confirmation email has been sent to {reservation.customer_email}.</p>
            )}
          </div>
        </div>
        <div className="space-y-3 pb-8">
          <button onClick={onClose} className="w-full py-3.5 rounded-xl text-sm font-semibold transition-all" style={goldBtn}>
            View Updated Reservation
          </button>
          <button onClick={onNewBooking} className="w-full py-3.5 rounded-xl text-sm font-semibold transition-all" style={ghostBtn}>
            Make Another Reservation
          </button>
        </div>
      </>
    );
  }

  // ── Confirmation screen ──────────────────────────────────────────────────────

  if (modify.step === 'confirm' && modify.selectedTable) {
    const newTable = modify.selectedTable;
    const keepingCurrentTable = currentTable?.id === newTable.id;
    const newEndTime = (() => {
      const [h, m] = modify.newTime.split(':').map(Number);
      const end = new Date(modify.newDate + 'T12:00:00');
      end.setHours(h, m + getReservationDuration(reservation?.reservation_duration_minutes), 0, 0);
      const eh = end.getHours(), em = end.getMinutes();
      const ampm = eh >= 12 ? 'PM' : 'AM';
      return `${(eh % 12) || 12}:${em.toString().padStart(2, '0')} ${ampm}`;
    })();

    return (
      <>
        <div className="rounded-2xl overflow-hidden shadow-2xl" style={cardStyle}>
          <div className="px-8 pt-8 pb-6" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <button
              onClick={onBackToMap}
              className="flex items-center gap-1.5 text-xs font-medium mb-6 transition-colors"
              style={{ color: 'rgba(185,170,148,0.60)', cursor: 'pointer', background: 'none', border: 'none' }}
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to map
            </button>
            <h2 className="text-xl font-bold" style={{ color: 'rgba(240,232,218,0.96)' }}>Confirm Changes</h2>
            <p className="text-sm mt-1" style={{ color: 'rgba(185,170,148,0.60)' }}>Review your changes before confirming.</p>
          </div>

          <div className="px-8 py-6 space-y-4">
            {/* From */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: accentColor }}>Currently booked</p>
              <div className="rounded-xl overflow-hidden" style={sectionStyle}>
                <div className="flex items-center gap-3 px-4 py-3.5" style={rowStyle}>
                  <Calendar className="w-4 h-4 flex-shrink-0" style={{ color: accentColor }} />
                  <span className="text-sm line-through" style={{ color: 'rgba(185,170,148,0.50)' }}>{oldDateDisplay}</span>
                </div>
                <div className="flex items-center gap-3 px-4 py-3.5" style={rowStyle}>
                  <Clock className="w-4 h-4 flex-shrink-0" style={{ color: accentColor }} />
                  <span className="text-sm line-through" style={{ color: 'rgba(185,170,148,0.50)' }}>{oldTimeDisplay}</span>
                </div>
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <Users className="w-4 h-4 flex-shrink-0" style={{ color: accentColor }} />
                  <span className="text-sm line-through" style={{ color: 'rgba(185,170,148,0.50)' }}>
                    {reservation.party_size} {reservation.party_size === 1 ? 'guest' : 'guests'}
                    {currentTable ? ` · Table ${currentTable.name}` : ''}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-center">
              <ArrowRight className="w-5 h-5" style={{ color: accentColor }} />
            </div>

            {/* To */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: accentColorStrong }}>New booking</p>
              <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(52,110,72,0.10)', border: '1px solid rgba(80,160,100,0.22)' }}>
                <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: '1px solid rgba(80,160,100,0.12)' }}>
                  <Calendar className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(100,185,130,0.75)' }} />
                  <span className="text-sm font-medium" style={{ color: 'rgba(235,225,208,0.92)' }}>{newDateDisplay}</span>
                </div>
                <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: '1px solid rgba(80,160,100,0.12)' }}>
                  <Clock className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(100,185,130,0.75)' }} />
                  <span className="text-sm font-medium" style={{ color: 'rgba(235,225,208,0.92)' }}>{newTimeDisplay} &ndash; {newEndTime}</span>
                </div>
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <Users className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(100,185,130,0.75)' }} />
                  <span className="text-sm font-medium" style={{ color: 'rgba(235,225,208,0.92)' }}>
                    {modify.newPartySize} {modify.newPartySize === 1 ? 'guest' : 'guests'}
                    {` · Table ${newTable.name}`}
                    {keepingCurrentTable && (
                      <span className="ml-2 text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(212,145,93,0.15)', color: 'rgba(212,145,93,0.85)' }}>
                        Current table
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </div>

            {modify.error && (
              <div
                className="rounded-xl px-4 py-3.5 text-sm flex items-start gap-2"
                style={{ background: 'rgba(160,40,40,0.14)', border: '1px solid rgba(180,60,60,0.35)', color: 'rgba(220,140,140,0.90)' }}
              >
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {modify.error}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3 pb-8">
          <button
            onClick={onConfirm}
            disabled={modify.submitting}
            className="w-full py-3.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ ...goldBtn, cursor: modify.submitting ? 'not-allowed' : 'pointer' }}
          >
            {modify.submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {modify.submitting ? 'Updating...' : 'Confirm Changes'}
          </button>
          <button onClick={onBackToMap} style={{ ...ghostBtn, display: 'block', width: '100%' }}
            className="py-3.5 rounded-xl text-sm font-semibold transition-all">
            Back
          </button>
        </div>
      </>
    );
  }

  // ── Map screen ───────────────────────────────────────────────────────────────

  if (modify.step === 'map') {
    const isCurrentTableAvailable = modify.tables.find(t => t.id === currentTable?.id)?.status === 'green';

    return (
      <>
        <div className="rounded-2xl overflow-hidden shadow-2xl" style={cardStyle}>
          <div className="px-6 pt-6 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <button
              onClick={onBackToParams}
              className="flex items-center gap-1.5 text-xs font-medium mb-4 transition-colors"
              style={{ color: 'rgba(185,170,148,0.60)', cursor: 'pointer', background: 'none', border: 'none' }}
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to details
            </button>
            <h2 className="text-lg font-bold mb-1" style={{ color: 'rgba(240,232,218,0.96)' }}>Select a Table</h2>
            <p className="text-xs" style={{ color: 'rgba(185,170,148,0.55)' }}>
              {newDateDisplay} · {newTimeDisplay} · {modify.newPartySize} {modify.newPartySize === 1 ? 'guest' : 'guests'}
            </p>
          </div>

          {isCurrentTableAvailable && currentTable && (
            <div className="px-6 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(212,145,93,0.05)' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-xs" style={{ color: 'rgba(185,170,148,0.80)' }}>
                    Your current table (Table {currentTable.name}) is available at this time
                  </span>
                </div>
                <button
                  onClick={() => {
                    const t = modify.tables.find(t => t.id === currentTable.id);
                    if (t) onTableSelect(t);
                  }}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                  style={{ background: 'rgba(212,145,93,0.14)', border: '1px solid rgba(212,145,93,0.28)', color: 'rgba(212,145,93,0.92)', cursor: 'pointer' }}
                >
                  Keep this table
                </button>
              </div>
            </div>
          )}

          <div style={{ height: '480px', position: 'relative' }}>
            {USE_PREMIUM_CUSTOMER_MAP ? (
              <PremiumCustomerFloorplanView
                restaurantId={reservation.restaurant_id}
                areaId={modify.activeAreaId || undefined}
                tables={modify.tables}
                partySize={modify.newPartySize}
                onTableSelect={onTableSelect}
              />
            ) : (
              <CustomerTableMapNew
                restaurantId={reservation.restaurant_id}
                tables={modify.tables}
                areas={modify.areas}
                activeAreaId={modify.activeAreaId}
                onAreaChange={(id) => {}}
                partySize={modify.newPartySize}
                onTableSelect={onTableSelect}
              />
            )}
          </div>

          {modify.error && (
            <div className="px-6 py-4">
              <div
                className="rounded-xl px-4 py-3.5 text-sm flex items-start gap-2"
                style={{ background: 'rgba(160,40,40,0.14)', border: '1px solid rgba(180,60,60,0.35)', color: 'rgba(220,140,140,0.90)' }}
              >
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {modify.error}
              </div>
            </div>
          )}
        </div>

        {/* Area tabs if multi-area */}
        {modify.areas.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            {modify.areas.map(area => (
              <button
                key={area.id}
                onClick={() => {}}
                className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                style={
                  modify.activeAreaId === area.id
                    ? { ...goldBtn, padding: '8px 16px' }
                    : { ...ghostBtn, padding: '8px 16px' }
                }
              >
                {area.name}
              </button>
            ))}
          </div>
        )}

        <div className="pb-8">
          <button onClick={onBackToParams} style={{ ...ghostBtn, display: 'block', width: '100%' }}
            className="py-3.5 rounded-xl text-sm font-semibold transition-all">
            Back
          </button>
        </div>
      </>
    );
  }

  // ── Params screen (default) ──────────────────────────────────────────────────

  const paramsValid = modify.newDate && modify.newTime && modify.newPartySize > 0;

  return (
    <>
      <div className="rounded-2xl overflow-hidden shadow-2xl" style={cardStyle}>
        <div className="px-8 pt-8 pb-6" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-xs font-medium mb-6 transition-colors"
            style={{ color: 'rgba(185,170,148,0.60)', cursor: 'pointer', background: 'none', border: 'none' }}
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to reservation
          </button>
          <h2 className="text-xl font-bold" style={{ color: 'rgba(240,232,218,0.96)' }}>Change Reservation</h2>
          <p className="text-sm mt-1" style={{ color: 'rgba(185,170,148,0.60)' }}>
            Choose a new date, time, or party size.
          </p>
        </div>

        {/* Current booking summary */}
        <div className="px-8 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: accentColor }}>Current booking</p>
          <div
            className="rounded-xl px-4 py-3.5 text-sm"
            style={sectionStyle}
          >
            <span style={{ color: 'rgba(185,170,148,0.70)' }}>
              {oldDateDisplay} · {oldTimeDisplay} · {reservation.party_size} {reservation.party_size === 1 ? 'guest' : 'guests'}
              {currentTable ? ` · Table ${currentTable.name}` : ''}
            </span>
          </div>
        </div>

        {/* New params */}
        <div className="px-8 py-6 space-y-5">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: accentColorStrong }}>New booking details</p>

          <div>
            <label style={labelStyle}>Date</label>
            <div style={{ position: 'relative' }}>
              <Calendar
                style={{
                  position: 'absolute',
                  left: '14px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '15px',
                  height: '15px',
                  color: accentColor,
                  pointerEvents: 'none',
                  zIndex: 1,
                }}
              />
              <input
                type="date"
                value={modify.newDate}
                min={todayStr()}
                onChange={e => onParamChange('newDate', e.target.value)}
                style={{
                  ...inputStyle,
                  paddingLeft: '38px',
                  paddingRight: '36px',
                  cursor: 'pointer',
                }}
              />
              <ChevronDown
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '14px',
                  height: '14px',
                  color: accentColor,
                  pointerEvents: 'none',
                  zIndex: 1,
                }}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Time</label>
            <select
              value={modify.newTime}
              onChange={e => onParamChange('newTime', e.target.value)}
              style={inputStyle}
            >
              {timeOptions.length === 0 && (
                <option value="">No available times on this day</option>
              )}
              {timeOptions.map(t => {
                const [h, m] = t.split(':').map(Number);
                const ampm = h >= 12 ? 'PM' : 'AM';
                const display = `${(h % 12) || 12}:${m.toString().padStart(2, '0')} ${ampm}`;
                return <option key={t} value={t}>{display}</option>;
              })}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Party Size</label>
            <select
              value={modify.newPartySize}
              onChange={e => onParamChange('newPartySize', parseInt(e.target.value, 10))}
              style={inputStyle}
            >
              {partySizeOptions.map(n => (
                <option key={n} value={n}>{n} {n === 1 ? 'guest' : 'guests'}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Requirements / Allergies</label>
            <div style={{ position: 'relative' }}>
              <Utensils
                style={{
                  position: 'absolute',
                  left: '14px',
                  top: '13px',
                  width: '14px',
                  height: '14px',
                  color: accentColor,
                  pointerEvents: 'none',
                  zIndex: 1,
                  flexShrink: 0,
                }}
              />
              <textarea
                value={modify.newNotes}
                onChange={e => onParamChange('newNotes', e.target.value)}
                placeholder="Add any allergies, accessibility needs, seating requests, or special requirements"
                maxLength={500}
                rows={4}
                style={{
                  ...inputStyle,
                  paddingLeft: '38px',
                  minHeight: '100px',
                  resize: 'vertical',
                  lineHeight: '1.5',
                }}
              />
            </div>
          </div>

          {modify.error && (
            <div
              className="rounded-xl px-4 py-3.5 text-sm flex items-start gap-2"
              style={{ background: 'rgba(160,40,40,0.14)', border: '1px solid rgba(180,60,60,0.35)', color: 'rgba(220,140,140,0.90)' }}
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {modify.error}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3 pb-8">
        <button
          onClick={onCheckAvailability}
          disabled={modify.loading || !paramsValid}
          className="w-full py-3.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ ...goldBtn, cursor: modify.loading || !paramsValid ? 'not-allowed' : 'pointer' }}
        >
          {modify.loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Checking availability...</>
          ) : (
            <><ArrowRight className="w-4 h-4" /> Check Availability</>
          )}
        </button>
        <button onClick={onClose} style={{ ...ghostBtn, display: 'block', width: '100%' }}
          className="py-3.5 rounded-xl text-sm font-semibold transition-all">
          Cancel
        </button>
      </div>
    </>
  );
}
