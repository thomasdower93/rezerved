import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { PreOrderForm } from '../components/PreOrderForm';
import { createReservation } from '../services/reservations';
import { confirmReservationFromHold, releaseTableHold, releaseHoldGroup } from '../services/holds';
import { createReservationTableAssignments } from '../services/combinations';
import { getPreorderMenuItems } from '../services/preorderMenu';
import {
  getDepositSettings,
  getRequiredDepositAmount,
  formatDepositAmount,
} from '../services/deposits';
import { Restaurant, TableAvailability, BookingFormData, PreOrderItem, TableCombinationTemplate, RestaurantDepositSettings } from '../lib/types';
import { demoMenu, MenuItem } from '../lib/menu';
import { formatOpeningHoursForDate, formatDuration, getReservationDuration } from '../lib/utils';
import { syncServerTime, getServerAdjustedTime, getServerTimeOffset } from '../lib/timeSync';
import { ArrowLeft, Calendar, Clock, Users, MapPin, AlertCircle, Utensils, CheckCircle2, Info, Banknote, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { RATE_LIMIT_ERROR, RATE_LIMIT_MESSAGE } from '../services/rateLimit';
import { DEFAULT_DURATION_MINUTES } from '../lib/constants';

interface BookingPageProps {
  restaurant: Restaurant;
  table: TableAvailability;
  date: string;
  time: string;
  partySize: number;
  useAlternativeTime: boolean;
  onBack: () => void;
  onSuccess: (manageToken: string, emailSent?: boolean, emailError?: string, customerEmail?: string, reservationCode?: string, awaitingAcceptance?: boolean) => void;
  onStaffLogin: () => void;
  onManageReservation: () => void;
  onOpenBookingTerms?: () => void;
  onOpenPrivacyPolicy?: () => void;
  onOpenCookiePolicy?: () => void;
  onOpenCancellationPolicy?: () => void;
}

// ─── Hold preservation helpers ────────────────────────────────────────────────
// Stored in sessionStorage so hold context survives a temporary route change
// to /booking-terms and back.

const HOLD_CONTEXT_KEY = 'rezerved_active_hold_context';

export interface ActiveHoldContext {
  holdToken: string | null;
  holdGroupToken: string | null;
  holdExpiresAt: string | null;
  restaurantId: string;
  tableId: string;
  date: string;
  time: string;
  partySize: number;
}

export function saveHoldContext(ctx: ActiveHoldContext): void {
  try {
    sessionStorage.setItem(HOLD_CONTEXT_KEY, JSON.stringify(ctx));
  } catch {}
}

export function loadHoldContext(): ActiveHoldContext | null {
  try {
    const raw = sessionStorage.getItem(HOLD_CONTEXT_KEY);
    return raw ? (JSON.parse(raw) as ActiveHoldContext) : null;
  } catch {
    return null;
  }
}

export function clearHoldContext(): void {
  try {
    sessionStorage.removeItem(HOLD_CONTEXT_KEY);
  } catch {}
}

export function isBookingFlowSource(source: string | undefined): boolean {
  return source === 'booking-flow';
}

export function BookingPage({
  restaurant,
  table,
  date,
  time,
  partySize,
  useAlternativeTime,
  onBack,
  onSuccess,
  onStaffLogin,
  onManageReservation,
  onOpenBookingTerms,
  onOpenPrivacyPolicy,
  onOpenCookiePolicy,
  onOpenCancellationPolicy,
}: BookingPageProps) {
  const [formData, setFormData] = useState<BookingFormData>({
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    notes: '',
  });
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [errors, setErrors] = useState<Partial<BookingFormData>>({});
  const [loading, setLoading] = useState(false);
  const loadingRef = React.useRef(false);
  // Set to true just before navigating to /booking-terms so the unmount cleanup
  // does not release the hold while the user is reading the terms.
  const navigatingToTermsRef = React.useRef(false);
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuItems, setMenuItems] = useState<MenuItem[]>(demoMenu);
  const [preorderItems, setPreorderItems] = useState<PreOrderItem[]>([]);
  const [preorderTotal, setPreorderTotal] = useState(0);
  const [submitError, setSubmitError] = useState<string>('');
  const [submitErrorDetails, setSubmitErrorDetails] = useState<string>('');
  const [holdExpired, setHoldExpired] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [reservationDuration, setReservationDuration] = useState<number>(DEFAULT_DURATION_MINUTES);

  // Deposit flow state
  const [depositSettings, setDepositSettings] = useState<RestaurantDepositSettings | null>(null);
  const [depositStep, setDepositStep] = useState(false); // true = show deposit confirmation screen
  const [depositAmountPence, setDepositAmountPence] = useState(0);

  // Terms agreement state
  const [termsAgreed, setTermsAgreed] = useState(false);

  const actualTime = useAlternativeTime && table.suggested_start
    ? new Date(table.suggested_start).toTimeString().slice(0, 5)
    : time;

  const hasHold = !!table.holdToken && !!table.holdExpiresAt;

  const preordersEnabled = (restaurant.preorders_plan_enabled ?? true) && (restaurant.preorders_enabled ?? true);
  const { user } = useAuth();

  useEffect(() => {
    loadMenu();
    loadUserProfile();
    supabase
      .from('restaurant_booking_settings')
      .select('default_reservation_duration_minutes')
      .eq('restaurant_id', restaurant.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.default_reservation_duration_minutes) {
          setReservationDuration(data.default_reservation_duration_minutes);
        }
      })
      .catch(() => {});
    getDepositSettings(restaurant.id)
      .then(ds => {
        console.log('[BookingPage] Deposit settings loaded:', {
          restaurant_id: restaurant.id,
          enabled: ds.enabled,
          minimum_party_size: ds.minimum_party_size,
          deposit_type: ds.deposit_type,
          amount_pence: ds.amount_pence,
        });
        setDepositSettings(ds);
      })
      .catch(err => {
        console.error('[BookingPage] Failed to load deposit settings:', err);
        // Leave depositSettings as null — deposit step will not trigger.
        // This is safe: customers won't be incorrectly blocked, but also won't
        // be charged a deposit they aren't aware of.
      });
  }, [restaurant.id, user]);

  useEffect(() => {
    return () => {
      // Skip release if navigating to booking-terms (user is reading terms, hold preserved)
      // or if currently submitting a booking.
      if (hasHold && !loadingRef.current && !navigatingToTermsRef.current) {
        console.log('[BookingPage] Cleaning up: releasing hold(s) on unmount');
        if (table.holdGroupToken) {
          releaseHoldGroup(table.holdGroupToken).catch(err => {
            console.error('[BookingPage] Failed to release hold group on cleanup:', err);
          });
        } else if (table.holdToken) {
          releaseTableHold(table.holdToken).catch(err => {
            console.error('[BookingPage] Failed to release hold on cleanup:', err);
          });
        }
        clearHoldContext();
      }
    };
  }, [hasHold, table.holdToken, table.holdGroupToken]);

  useEffect(() => {
    if (!hasHold) return;

    let cancelled = false;
    let interval: NodeJS.Timeout | null = null;

    const initializeTimer = async () => {
      await syncServerTime();

      if (cancelled) return;

      let isInitialRun = true;

      const updateTimer = () => {
        const expiresAt = new Date(table.holdExpiresAt!).getTime();
        const now = getServerAdjustedTime();
        const remaining = Math.max(0, expiresAt - now);

        if (isInitialRun) {
          const offset = getServerTimeOffset();
          console.log('[BookingPage] Hold timer initialized with server sync:', {
            holdExpiresAt: table.holdExpiresAt,
            expiresAtParsed: new Date(expiresAt).toISOString(),
            serverAdjustedNow: new Date(now).toISOString(),
            clientNow: new Date(Date.now()).toISOString(),
            timeOffsetMs: offset,
            timeOffsetSeconds: offset ? Math.round(offset / 1000) : 0,
            remainingMs: remaining,
            remainingSeconds: Math.floor(remaining / 1000),
          });
          isInitialRun = false;
        }

        setTimeRemaining(remaining);

        if (remaining === 0) {
          setHoldExpired(true);
        }
      };

      updateTimer();
      interval = setInterval(updateTimer, 1000);
    };

    initializeTimer();

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [hasHold, table.holdExpiresAt]);

  const ensureProfile = async () => {
    if (!user?.auth_user_id) {
      console.log('[BookingPage] No user logged in, skipping profile ensure');
      return;
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const sessionUser = sessionData.session?.user;

      if (!sessionUser) {
        console.log('[BookingPage] No active session, cannot ensure profile');
        return;
      }

      console.log('[BookingPage] Fetching profile for user:', user.auth_user_id);

      const { data: existingProfile, error: fetchError } = await supabase
        .from('profiles')
        .select('user_id, full_name, email, phone')
        .eq('user_id', user.auth_user_id)
        .maybeSingle();

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('[BookingPage] Error fetching profile:', {
          message: fetchError.message,
          code: fetchError.code,
          details: fetchError.details,
        });
        setFormData(prev => ({
          ...prev,
          customer_name: user.name || '',
          customer_email: user.email || sessionUser.email || '',
        }));
        return;
      }

      if (existingProfile) {
        console.log('[BookingPage] Profile exists, using data');
        setFormData(prev => ({
          ...prev,
          customer_name: existingProfile.full_name || user.name || '',
          customer_email: existingProfile.email || user.email || sessionUser.email || '',
          customer_phone: existingProfile.phone || '',
        }));
      } else {
        console.log('[BookingPage] Profile missing, creating new profile');

        const { data: newProfile, error: insertError } = await supabase
          .from('profiles')
          .insert({
            user_id: user.auth_user_id,
            email: user.email || sessionUser.email,
            full_name: user.name || '',
            phone: '',
          })
          .select()
          .maybeSingle();

        if (insertError) {
          console.error('[BookingPage] Failed to create profile:', {
            message: insertError.message,
            code: insertError.code,
            details: insertError.details,
          });
          setFormData(prev => ({
            ...prev,
            customer_name: user.name || '',
            customer_email: user.email || sessionUser.email || '',
          }));
        } else if (newProfile) {
          console.log('[BookingPage] Profile created successfully');
          setFormData(prev => ({
            ...prev,
            customer_name: newProfile.full_name || user.name || '',
            customer_email: newProfile.email || user.email || sessionUser.email || '',
            customer_phone: newProfile.phone || '',
          }));
        }
      }
    } catch (err) {
      console.error('[BookingPage] Failed to ensure profile:', err);
      if (user) {
        console.log('[BookingPage] Using fallback user data from context');
        setFormData(prev => ({
          ...prev,
          customer_name: user.name || '',
          customer_email: user.email || '',
        }));
      }
    }
  };

  const loadUserProfile = async () => {
    await ensureProfile();
  };

  const loadMenu = async () => {
    setMenuLoading(true);
    try {
      const customItems = await getPreorderMenuItems(restaurant.id);

      if (customItems.length > 0) {
        const activeItems = customItems.filter(item => item.is_active);
        const menuItemsFormatted: MenuItem[] = activeItems.map(item => ({
          id: item.id?.toString() || '',
          name: item.name,
          description: item.description,
          price: parseFloat(item.price.toString()),
          category: 'Main',
        }));
        setMenuItems(menuItemsFormatted);
      } else {
        setMenuItems(demoMenu);
      }
    } catch (error) {
      console.error('Failed to load menu items:', error);
      setMenuItems(demoMenu);
    } finally {
      setMenuLoading(false);
    }
  };

  const handlePreOrderChange = (items: PreOrderItem[], total: number) => {
    setPreorderItems(items);
    setPreorderTotal(total);
  };

  const formatTimeRemaining = (milliseconds: number): string => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (loading) {
      return;
    }

    setSubmitError('');
    setSubmitErrorDetails('');

    const newErrors: Partial<BookingFormData> = {};
    if (!formData.customer_name.trim()) newErrors.customer_name = 'Name is required';
    if (!formData.customer_phone.trim()) newErrors.customer_phone = 'Phone is required';
    if (!formData.customer_email.trim()) newErrors.customer_email = 'Email is required';
    if (formData.customer_email && !formData.customer_email.includes('@')) {
      newErrors.customer_email = 'Invalid email address';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Check if deposit is required — if so show deposit step before creating reservation
    const requiredDeposit = getRequiredDepositAmount(depositSettings, partySize);
    if (requiredDeposit > 0 && !depositStep) {
      console.log('[BookingPage] Deposit required:', {
        restaurant_id: restaurant.id,
        partySize,
        requiredDeposit,
        depositSettings,
      });
      setDepositAmountPence(requiredDeposit);
      setDepositStep(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    console.log('[BookingPage] Submitting reservation:', {
      restaurant_id: restaurant.id,
      table_id: table.id,
      date,
      actualTime,
      partySize,
      has_user: !!user,
      user_id: user?.auth_user_id,
      has_hold: hasHold,
      hold_token: table.holdToken,
    });

    setLoading(true);
    loadingRef.current = true;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const sessionUserId = sessionData.session?.user?.id;

      console.log('[BookingPage] Session check before insert:', {
        has_session: !!sessionData.session,
        session_user_id: sessionUserId,
        context_user_id: user?.auth_user_id,
        match: sessionUserId === user?.auth_user_id,
      });

      if (user?.auth_user_id && !sessionUserId) {
        throw new Error('Your session has expired. Please log in again.');
      }

      let manageToken: string;
      let reservationCode: string | undefined;
      let reservationId: string | undefined;
      let emailSent: boolean | undefined;
      let emailError: string | undefined;
      let awaitingAcceptance = false;
      let requiresDeposit = depositStep;

      const selectedCombo = table.selectedCombination as TableCombinationTemplate | undefined;
      const joinedTableIds = selectedCombo
        ? (selectedCombo.tables || []).map(t => t.id).filter(id => id !== table.id)
        : [];

      if (hasHold) {
        const result = await confirmReservationFromHold(
          table.holdToken!,
          formData.customer_name,
          formData.customer_email,
          formData.customer_phone,
          formData.notes || '',
          preorderItems,
          preorderTotal,
          'online',
          user?.auth_user_id,
          restaurant.id,
          marketingOptIn,
          selectedCombo?.combined_capacity
        );

        if (!result.success) {
          if (result.error === 'RATE_LIMIT') {
            if (hasHold) {
              if (table.holdGroupToken) {
                releaseHoldGroup(table.holdGroupToken).catch(() => {});
              } else if (table.holdToken) {
                releaseTableHold(table.holdToken).catch(() => {});
              }
            }
            setSubmitError(RATE_LIMIT_MESSAGE);
            setSubmitErrorDetails('');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
          }

          if (result.error === 'TABLE_UNAVAILABLE') {
            setSubmitError('Table no longer available');
            setSubmitErrorDetails('This table was just booked by someone else. Please select a different table.');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
          }

          if (result.error === 'HOLD_EXPIRED' || result.error === 'HOLD_NOT_FOUND' || result.error === 'RPC_ERROR') {
            console.warn('[BookingPage] Hold issue, falling back to direct reservation:', result.error);
            const reservation = await createReservation(
              restaurant.id,
              table.id,
              date,
              actualTime,
              partySize,
              formData,
              {
                preorderItems,
                preorderTotal,
                source: 'online',
                customerUserId: user?.auth_user_id,
                marketingOptIn,
                joinedTableIds,
                combinedCapacity: selectedCombo?.combined_capacity,
                combinationName: selectedCombo?.name,
              }
            );
            manageToken = reservation.manage_token;
            reservationId = reservation.id;
            reservationCode = reservation.reservation_code ?? undefined;
            emailSent = reservation.emailSent;
            emailError = reservation.emailError;
            awaitingAcceptance = reservation.awaitingAcceptance === true;
            requiresDeposit = reservation.payment_required === true;
            console.log('[BookingPage] Reservation created via fallback:', reservation.id);
          } else {
            setSubmitError('Failed to create reservation');
            setSubmitErrorDetails(result.message || 'Please try again or contact the restaurant.');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
          }
        } else {
          manageToken = result.manage_token!;
          reservationId = result.reservation_id;
          reservationCode = result.reservation_code;
          emailSent = result.emailSent;
          emailError = result.emailError;
          awaitingAcceptance = result.awaitingAcceptance === true;
          requiresDeposit = result.payment_required === true;
          console.log('[BookingPage] Reservation confirmed from hold');

          // Create table assignments for joined combos — the RPC only touches the primary hold.
          // Release the secondary holds after the reservation is secured.
          if (result.reservation_id && joinedTableIds.length > 0) {
            createReservationTableAssignments(
              result.reservation_id,
              restaurant.id,
              table.id,
              joinedTableIds
            ).catch(err => console.warn('[BookingPage] Failed to create joined table assignments:', err));
          }
          if (table.holdGroupToken) {
            releaseHoldGroup(table.holdGroupToken).catch(() => {});
          }
        }
      } else {
        const reservation = await createReservation(
          restaurant.id,
          table.id,
          date,
          actualTime,
          partySize,
          formData,
          {
            preorderItems,
            preorderTotal,
            source: 'online',
            customerUserId: user?.auth_user_id,
            marketingOptIn,
            joinedTableIds,
            combinedCapacity: selectedCombo?.combined_capacity,
            combinationName: selectedCombo?.name,
          }
        );

        manageToken = reservation.manage_token;
        reservationId = reservation.id;
        reservationCode = reservation.reservation_code ?? undefined;
        emailSent = reservation.emailSent;
        emailError = reservation.emailError;
        awaitingAcceptance = reservation.awaitingAcceptance === true;
        requiresDeposit = reservation.payment_required === true;
        console.log('[BookingPage] Reservation created (direct flow):', reservation.id);
      }

      // Auto-accepted bookings proceed directly to the restaurant's SumUp checkout.
      // Manual requests wait for staff acceptance; the acceptance function creates
      // and sends the same restaurant-owned checkout link afterwards.
      if (requiresDeposit && !awaitingAcceptance && reservationId) {
          const baseUrl = window.location.origin;
          const successUrl = `${baseUrl}/confirmation?token=${manageToken}&deposit=paid`;
          const cancelUrl = `${baseUrl}/confirmation?token=${manageToken}&deposit=cancelled`;

          // Call edge function to create SumUp Checkout session
          const supabaseUrl = (supabase as any).supabaseUrl || import.meta.env.VITE_SUPABASE_URL;
          const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
          const checkoutRes = await fetch(
            `${supabaseUrl}/functions/v1/create-deposit-checkout`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${anonKey}`,
              },
              body: JSON.stringify({
                reservation_id: reservationId,
                manage_token: manageToken,
                success_url: successUrl,
                cancel_url: cancelUrl,
              }),
            }
          );

          const checkoutData = await checkoutRes.json();

          if (checkoutData.checkout_url) {
            // Redirect to SumUp hosted payment page — browser leaves the page
            window.location.href = checkoutData.checkout_url;
            return;
          } else {
            const isNotConfigured = checkoutRes.status === 503;
            setSubmitError('Could not start payment');
            setSubmitErrorDetails(
              isNotConfigured
                ? 'Deposit payments are not fully configured yet. Please contact the restaurant to complete your booking.'
                : checkoutData.error || 'Please try again or contact the restaurant.'
            );
            window.scrollTo({ top: 0, behavior: 'smooth' });
            setLoading(false);
            loadingRef.current = false;
            return;
          }
      }

      onSuccess(manageToken, emailSent, emailError, formData.customer_email, reservationCode, awaitingAcceptance);
    } catch (error) {
      console.error('[BookingPage] Reservation creation failed:', error);

      const rawMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const isRateLimit = (error as any)?.code === RATE_LIMIT_ERROR || rawMessage === RATE_LIMIT_MESSAGE;

      if (isRateLimit) {
        // Release hold so the slot is not left stale
        if (hasHold && table.holdToken) {
          releaseTableHold(table.holdToken).catch(() => {});
        }
        setSubmitError(RATE_LIMIT_MESSAGE);
        setSubmitErrorDetails('');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        const isUserFacing = rawMessage.includes('session has expired') ||
          rawMessage.includes('in the future') ||
          rawMessage.includes("party size") ||
          rawMessage.includes('Table not found');

        setSubmitError('Failed to create reservation');
        setSubmitErrorDetails(isUserFacing ? rawMessage : 'Please try again or contact the restaurant.');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  };

  const handleChange = (field: keyof BookingFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: undefined }));
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const handleBack = async () => {
    if (hasHold) {
      console.log('[BookingPage] Back clicked: releasing hold(s)');
      if (table.holdGroupToken) {
        await releaseHoldGroup(table.holdGroupToken).catch(() => {});
      } else if (table.holdToken) {
        await releaseTableHold(table.holdToken).catch(() => {});
      }
    }
    clearHoldContext();
    onBack();
  };

  const handleOpenLegalPage = (callback: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    if (hasHold) {
      saveHoldContext({
        holdToken: table.holdToken ?? null,
        holdGroupToken: table.holdGroupToken ?? null,
        holdExpiresAt: table.holdExpiresAt ?? null,
        restaurantId: restaurant.id,
        tableId: table.id,
        date,
        time,
        partySize,
      });
    }
    navigatingToTermsRef.current = true;
    callback();
  };

  const handleOpenBookingTerms = onOpenBookingTerms
    ? handleOpenLegalPage(onOpenBookingTerms)
    : undefined;

  const handleOpenPrivacyPolicyPage = onOpenPrivacyPolicy
    ? handleOpenLegalPage(onOpenPrivacyPolicy)
    : undefined;

  const handleOpenCookiePolicyPage = onOpenCookiePolicy
    ? handleOpenLegalPage(onOpenCookiePolicy)
    : undefined;

  const handleOpenCancellationPolicyPage = onOpenCancellationPolicy
    ? handleOpenLegalPage(onOpenCancellationPolicy)
    : undefined;

  return (
    <Layout onStaffLogin={onStaffLogin} onManageReservation={onManageReservation} bookingStep="details">
      <div className="max-w-2xl mx-auto">
        <Button variant="secondary" onClick={handleBack} className="mb-6">
          <ArrowLeft className="w-4 h-4 inline mr-2" />
          Back
        </Button>

        <div className="premium-card rounded-2xl p-8 mb-6">
          <h1 className="text-3xl font-bold text-app-text mb-6">
            Complete Your Reservation
          </h1>

          {hasHold && timeRemaining !== null && (
            <div className={`rounded-lg p-4 mb-6 border ${
              holdExpired
                ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                : timeRemaining < 60000
                ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
            }`}>
              <div className="flex items-center gap-3">
                <Clock className={`w-5 h-5 ${
                  holdExpired
                    ? 'text-red-600 dark:text-red-400'
                    : timeRemaining < 60000
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-amber-700 dark:text-amber-500'
                }`} />
                <div className="flex-1">
                  {holdExpired ? (
                    <>
                      <div className="font-semibold text-red-900 dark:text-red-200">Your hold expired</div>
                      <div className="text-sm text-red-700 dark:text-red-300 mt-1">
                        Please select a table again.
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="font-semibold text-app-text">
                        Holding {table.selectedCombination
                          ? (table.selectedCombination as TableCombinationTemplate).tables?.map(t => `Table ${t.name}`).join(' + ') ?? `Table ${table.name}`
                          : `Table ${table.name}`
                        } — {formatTimeRemaining(timeRemaining)} remaining
                      </div>
                      <div className="text-sm text-app-text-secondary mt-1">
                        Please complete your details before time runs out.
                      </div>
                      <div className="flex items-start gap-1.5 mt-2 text-xs text-gray-500 dark:text-gray-400">
                        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        <span>Please stay on this page to keep your table on hold. Leaving or refreshing will release it.</span>
                      </div>
                    </>
                  )}
                </div>
                {holdExpired && (
                  <Button onClick={onBack} variant="primary" size="sm">
                    Return to Table Selection
                  </Button>
                )}
              </div>
            </div>
          )}

          {submitError && !depositStep && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <div>
                  <div className="text-red-600 font-medium">{submitError}</div>
                  {submitErrorDetails && (
                    <div className="text-sm text-red-500 mt-1">{submitErrorDetails}</div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="bg-app-bg-tertiary rounded-xl p-6 mb-6">
            <h2 className="font-semibold text-app-text mb-4">Reservation Details</h2>
            <div className="space-y-3 text-app-text">
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-app-accent flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium">{restaurant.name}</div>
                  <div className="text-sm text-app-text-secondary">{restaurant.address}</div>
                  <div className="text-xs text-app-text-tertiary mt-1">
                    Hours: {formatOpeningHoursForDate(restaurant, date)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-app-accent" />
                <span>{formatDate(date)}</span>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-app-accent" />
                <span>{formatTime(actualTime)}</span>
              </div>
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-app-accent" />
                <span>{partySize} {partySize === 1 ? 'Guest' : 'Guests'}</span>
              </div>
            </div>

            {(() => {
              const combo = table.selectedCombination as TableCombinationTemplate | undefined;
              const isJoined = !!combo;
              const tableNames = isJoined
                ? (combo!.tables || []).map(t => `Table ${t.name}`).join(' + ')
                : `Table ${table.name}`;
              const seatsUpTo = isJoined ? combo!.combined_capacity : table.capacity;
              return (
                <div className="mt-4 p-4 bg-gradient-to-r from-app-accent/10 to-app-accent/5 border-2 border-app-accent/20 rounded-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-app-accent flex items-center justify-center shadow-lg">
                        <Utensils className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-app-text-secondary uppercase tracking-wide">
                          {isJoined ? 'Joined Tables' : 'Your Table'}
                        </div>
                        <div className="text-xl font-bold text-app-text">{tableNames}</div>
                        {isJoined && (
                          <div className="text-xs text-app-text-tertiary mt-0.5">{combo!.name}</div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-2 justify-end mb-1">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                          Perfect Fit
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-app-text-tertiary" />
                        <span className="text-sm text-app-text-secondary">
                          Seats up to <span className="font-bold text-app-text">{seatsUpTo}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="space-y-3 text-app-text hidden">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-app-accent" />
                <span>{partySize} {partySize === 1 ? 'Guest' : 'Guests'}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-app-accent flex items-center justify-center text-white text-xs font-bold">
                  T
                </div>
                <span>Table {table.name} (Capacity: {table.capacity})</span>
              </div>
            </div>

            {useAlternativeTime && (
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  You are booking at an alternative time suggested for this table.
                </p>
              </div>
            )}
          </div>

          {/* Deposit required step — shown after form validation, before payment */}
          {depositStep && depositAmountPence > 0 && (
            <DepositRequiredPanel
              depositAmountPence={depositAmountPence}
              partySize={partySize}
              depositSettings={depositSettings}
              loading={loading}
              holdExpired={holdExpired}
              submitError={submitError}
              submitErrorDetails={submitErrorDetails}
              termsAgreed={termsAgreed}
              onTermsChange={setTermsAgreed}
              onOpenBookingTerms={handleOpenBookingTerms}
              onOpenCancellationPolicy={handleOpenCancellationPolicyPage}
              onPay={() => handleSubmit()}
              onBack={() => setDepositStep(false)}
            />
          )}

          <form onSubmit={handleSubmit} className={`space-y-4 ${depositStep ? 'hidden' : ''}`}>
            <Input
              label="Full Name"
              type="text"
              value={formData.customer_name}
              onChange={(e) => handleChange('customer_name', e.target.value)}
              error={errors.customer_name}
              placeholder="John Doe"
              required
            />

            <Input
              label="Phone Number"
              type="tel"
              value={formData.customer_phone}
              onChange={(e) => handleChange('customer_phone', e.target.value)}
              error={errors.customer_phone}
              placeholder="+1 (555) 123-4567"
              required
            />

            <Input
              label="Email Address"
              type="email"
              value={formData.customer_email}
              onChange={(e) => handleChange('customer_email', e.target.value)}
              error={errors.customer_email}
              placeholder="john@example.com"
              required
            />

            {/* Contact notice — reservation service messages */}
            <div className="rounded-lg bg-app-bg-tertiary border border-app-border px-4 py-3 space-y-1.5">
              <p className="text-xs text-app-text-secondary leading-relaxed">
                We'll use your email and phone number to manage this reservation, including confirmations, reminders, changes, cancellations, and messages from the restaurant.{' '}
                {handleOpenPrivacyPolicyPage ? (
                  <button
                    type="button"
                    onClick={handleOpenPrivacyPolicyPage}
                    className="underline hover:opacity-80 transition-opacity"
                    style={{ color: 'rgba(212,145,93,0.75)' }}
                  >
                    Privacy Policy
                  </button>
                ) : (
                  <a
                    href="/privacy-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:opacity-80 transition-opacity"
                    style={{ color: 'rgba(212,145,93,0.75)' }}
                  >
                    Privacy Policy
                  </a>
                )}
              </p>
              {formData.customer_phone.trim() && (
                <p className="text-xs text-app-text-tertiary leading-relaxed">
                  Reservation updates may be sent by SMS. Standard network charges may apply.
                </p>
              )}
            </div>

            {/* Optional marketing consent — unchecked by default, never required */}
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={marketingOptIn}
                onChange={e => setMarketingOptIn(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-app-border text-app-accent focus:ring-app-accent/40 bg-app-bg flex-shrink-0"
              />
              <span className="text-xs text-app-text-secondary leading-relaxed">
                I'd like to receive offers and updates from this restaurant.{' '}
                <span className="text-app-text-tertiary">(Optional)</span>
              </span>
            </label>

            <div>
              <label className="block text-sm font-medium text-app-text mb-1">
                Special Requests (Optional)
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => handleChange('notes', e.target.value)}
                placeholder="Any dietary restrictions or special occasions?"
                rows={3}
                className="w-full px-4 py-2 border border-app-border rounded-lg focus:ring-2 focus:ring-app-accent focus:border-transparent transition-all bg-app-bg text-app-text placeholder:text-app-text-tertiary"
              />
            </div>

            {preordersEnabled && (
              <div className="border-t border-app-border pt-6">
                <h3 className="text-lg font-semibold text-app-text mb-4">Pre-Order (Optional)</h3>
                <PreOrderForm
                  menuItems={menuItems}
                  initialSelection={preorderItems}
                  onChange={handlePreOrderChange}
                />
              </div>
            )}

            <p className="text-xs text-app-text-tertiary leading-relaxed text-center">
              By confirming this booking, you agree to Rezerved's{' '}
              {onOpenBookingTerms ? (
                <button
                  type="button"
                  onClick={handleOpenBookingTerms!}
                  className="underline hover:text-app-text-secondary transition-colors"
                >
                  Booking Terms
                </button>
              ) : (
                <a href="/booking-terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-app-text-secondary transition-colors">
                  Booking Terms
                </a>
              )}{' '}
              and the restaurant's{' '}
              {handleOpenCancellationPolicyPage ? (
                <button
                  type="button"
                  onClick={handleOpenCancellationPolicyPage}
                  className="underline hover:text-app-text-secondary transition-colors"
                >
                  cancellation, deposit and no-show policy
                </button>
              ) : (
                <a href="/cancellation-policy" target="_blank" rel="noopener noreferrer" className="underline hover:text-app-text-secondary transition-colors">
                  cancellation, deposit and no-show policy
                </a>
              )}.
            </p>

            <Button type="submit" size="lg" className="w-full" disabled={loading || holdExpired}>
              {loading ? 'Processing...' : holdExpired ? 'Hold Expired - Return to Table Selection' : preordersEnabled ? 'Confirm pre-orders and complete reservation' : 'Complete reservation'}
            </Button>
          </form>
        </div>

        <div className="bg-app-bg-tertiary rounded-xl p-6 text-sm text-app-text-secondary">
          <p className="mb-2">
            We will send booking updates to the email address provided, including a link to manage your request.
          </p>
          <p className="font-medium text-app-text">
            Reservation duration: approximately {formatDuration(getReservationDuration(reservationDuration))}
          </p>
        </div>
      </div>
    </Layout>
  );
}

// ─── DepositRequiredPanel ─────────────────────────────────────────────────────

interface DepositRequiredPanelProps {
  depositAmountPence: number;
  partySize: number;
  depositSettings: RestaurantDepositSettings | null;
  loading: boolean;
  holdExpired: boolean;
  submitError: string;
  submitErrorDetails: string;
  termsAgreed: boolean;
  onTermsChange: (v: boolean) => void;
  onOpenBookingTerms?: (e: React.MouseEvent) => void;
  onOpenCancellationPolicy?: (e: React.MouseEvent) => void;
  onPay: () => void;
  onBack: () => void;
}

function DepositRequiredPanel({
  depositAmountPence,
  partySize,
  depositSettings,
  loading,
  holdExpired,
  submitError,
  submitErrorDetails,
  termsAgreed,
  onTermsChange,
  onOpenBookingTerms,
  onOpenCancellationPolicy,
  onPay,
  onBack,
}: DepositRequiredPanelProps) {
  const depositLabel = formatDepositAmount(depositAmountPence);
  const perPersonNote = depositSettings?.deposit_type === 'per_person'
    ? ` (${formatDepositAmount(depositSettings.amount_pence)} × ${partySize} guests)`
    : '';

  return (
    <div className="rounded-2xl border-2 border-amber-400/30 bg-amber-50/5 p-6 mb-6 space-y-4">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
          <Banknote className="w-5 h-5 text-amber-500" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-app-text">Deposit required</h2>
          <p className="text-sm text-app-text-secondary">Payment required to confirm your booking</p>
        </div>
      </div>

      <div className="bg-app-bg-tertiary rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-app-text-secondary">Deposit amount</span>
          <span className="text-lg font-bold text-amber-500">{depositLabel}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-app-text-secondary">Party size</span>
          <span className="text-sm font-medium text-app-text">{partySize} guests</span>
        </div>
        <p className="text-xs text-app-text-secondary pt-2 border-t border-app-border">
          This booking requires a {depositLabel} deposit because it is for a party of {partySize}{perPersonNote}.
          Your deposit will be deducted from your bill at the restaurant.
        </p>
      </div>

      {depositSettings?.policy_text && (
        <div className="rounded-xl bg-app-bg-tertiary border border-app-border p-4">
          <p className="text-xs text-app-text-secondary leading-relaxed">{depositSettings.policy_text}</p>
        </div>
      )}

      {/* Stripe-not-configured notice — shown as an inline warning, payment button disabled */}
      {submitError && submitError === 'Could not start payment' ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-600 dark:text-amber-400">Payment not available</p>
              <p className="text-xs text-app-text-secondary mt-0.5">
                {submitErrorDetails || 'Deposit payments are not fully configured yet. Please contact the restaurant to complete your booking.'}
              </p>
            </div>
          </div>
        </div>
      ) : submitError ? (
        <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-600 dark:text-red-400">{submitError}</p>
              {submitErrorDetails && (
                <p className="text-xs text-red-500 dark:text-red-300 mt-0.5">{submitErrorDetails}</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-app-text-tertiary">
          <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Secure payment processed by SumUp. You will be redirected to complete payment.</span>
        </div>
      )}

      <label className="flex items-start gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={termsAgreed}
          onChange={e => onTermsChange(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded border-app-border text-app-accent focus:ring-app-accent/40 bg-app-bg flex-shrink-0"
        />
        <span className="text-xs text-app-text-secondary leading-relaxed">
          I agree to Rezerved's{' '}
          {onOpenBookingTerms ? (
            <button
              type="button"
              onClick={onOpenBookingTerms}
              className="underline hover:opacity-80 transition-opacity"
              style={{ color: 'rgba(212,145,93,0.85)' }}
            >
              Booking Terms
            </button>
          ) : (
            <a
              href="/booking-terms"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:opacity-80 transition-opacity"
              style={{ color: 'rgba(212,145,93,0.85)' }}
            >
              Booking Terms
            </a>
          )}{' '}
          and understand the{' '}
          {onOpenCancellationPolicy ? (
            <button
              type="button"
              onClick={onOpenCancellationPolicy}
              className="underline hover:opacity-80 transition-opacity"
              style={{ color: 'rgba(212,145,93,0.85)' }}
            >
              cancellation, deposit and no-show policy
            </button>
          ) : (
            <a
              href="/cancellation-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:opacity-80 transition-opacity"
              style={{ color: 'rgba(212,145,93,0.85)' }}
            >
              cancellation, deposit and no-show policy
            </a>
          )}{' '}
          for this booking.
        </span>
      </label>

      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={loading || holdExpired || !termsAgreed}
        onClick={onPay}
      >
        {loading ? 'Processing...' : `Pay ${depositLabel} deposit and confirm booking`}
      </Button>

      <button
        type="button"
        onClick={onBack}
        className="w-full text-sm text-app-text-secondary hover:text-app-text transition-colors py-2"
      >
        Back to booking details
      </button>
    </div>
  );
}
