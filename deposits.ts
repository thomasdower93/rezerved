import { supabase } from '../lib/supabase';
import { RestaurantDepositSettings, ReservationPayment } from '../lib/types';

const DEFAULT_POLICY_TEXT =
  'This booking requires a deposit because of the party size. Your deposit will be deducted from your bill at the restaurant. Cancellations made at least 24 hours before your booking may be eligible for a refund. Late cancellations or no-shows may result in the deposit being retained.';

export function defaultDepositSettings(restaurantId: string): RestaurantDepositSettings {
  return {
    restaurant_id: restaurantId,
    enabled: false,
    minimum_party_size: 6,
    deposit_type: 'per_person',
    amount_pence: 1000,
    currency: 'gbp',
    refund_cutoff_hours: 24,
    policy_text: DEFAULT_POLICY_TEXT,
    applies_to_online_bookings: true,
  };
}

export async function getDepositSettings(restaurantId: string): Promise<RestaurantDepositSettings> {
  const { data, error } = await supabase
    .from('restaurant_deposit_settings')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return defaultDepositSettings(restaurantId);

  return data as RestaurantDepositSettings;
}

export async function saveDepositSettings(settings: RestaurantDepositSettings): Promise<RestaurantDepositSettings> {
  const { id, created_at, updated_at, ...payload } = settings;

  if (id) {
    const { data, error } = await supabase
      .from('restaurant_deposit_settings')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as RestaurantDepositSettings;
  } else {
    const { data, error } = await supabase
      .from('restaurant_deposit_settings')
      .upsert({ ...payload }, { onConflict: 'restaurant_id' })
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as RestaurantDepositSettings;
  }
}

export function calculateDepositAmount(settings: RestaurantDepositSettings, partySize: number): number {
  if (settings.deposit_type === 'fixed') {
    return settings.amount_pence;
  }
  return settings.amount_pence * partySize;
}

export function depositRequiredForBooking(
  settings: RestaurantDepositSettings,
  partySize: number,
  isOnline: boolean,
): boolean {
  if (!settings.enabled) return false;
  if (isOnline && !settings.applies_to_online_bookings) return false;
  return partySize >= settings.minimum_party_size;
}

/**
 * Returns the deposit amount in pence required for a booking, or 0 if no deposit
 * is required. Safe to call with null settings (returns 0).
 */
export function getRequiredDepositAmount(
  settings: RestaurantDepositSettings | null | undefined,
  partySize: number,
): number {
  if (!settings) return 0;
  if (!settings.enabled) return 0;
  if (!settings.applies_to_online_bookings) return 0;
  if (!partySize || partySize < settings.minimum_party_size) return 0;
  if (!settings.amount_pence || settings.amount_pence <= 0) return 0;
  if (settings.deposit_type === 'per_person') return settings.amount_pence * partySize;
  return settings.amount_pence;
}

export function formatDepositAmount(amountPence: number, currency = 'gbp'): string {
  const amount = amountPence / 100;
  if (currency.toLowerCase() === 'gbp') {
    return `£${amount.toFixed(2)}`;
  }
  return `${amount.toFixed(2)} ${currency.toUpperCase()}`;
}

export async function createPendingPaymentRecord(
  reservationId: string,
  restaurantId: string,
  amountPence: number,
  currency = 'gbp',
  provider: 'stripe' | 'sumup' = 'sumup',
): Promise<ReservationPayment> {
  const { data, error } = await supabase
    .from('reservation_payments')
    .insert({
      reservation_id: reservationId,
      restaurant_id: restaurantId,
      provider,
      amount_pence: amountPence,
      currency,
      status: 'pending',
    })
    .select()
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as ReservationPayment;
}

export async function getPaymentForReservation(reservationId: string): Promise<ReservationPayment | null> {
  const { data, error } = await supabase
    .from('reservation_payments')
    .select('*')
    .eq('reservation_id', reservationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data as ReservationPayment | null;
}

export async function getPaymentsForRestaurant(restaurantId: string): Promise<ReservationPayment[]> {
  const { data, error } = await supabase
    .from('reservation_payments')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []) as ReservationPayment[];
}

export function isRefundEligible(
  settings: RestaurantDepositSettings,
  reservationStartTime: string,
): boolean {
  const now = new Date();
  const bookingTime = new Date(reservationStartTime);
  const cutoffMs = settings.refund_cutoff_hours * 60 * 60 * 1000;
  return bookingTime.getTime() - now.getTime() >= cutoffMs;
}

export function depositStatusLabel(payment: ReservationPayment | null | undefined): string {
  if (!payment) return 'No deposit required';
  switch (payment.status) {
    case 'pending': return 'Awaiting payment';
    case 'paid': return `Deposit paid: ${formatDepositAmount(payment.amount_pence, payment.currency)}`;
    case 'failed': return 'Payment failed';
    case 'refunded': return 'Deposit refunded';
    case 'cancelled': return 'Payment cancelled';
    default: return 'Unknown';
  }
}