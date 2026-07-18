import { supabase } from '../lib/supabase';
import { Reservation } from '../lib/types';

// ── Types ─────────────────────────────────────────────────────────────────────

export type EposProvider =
  | 'none'
  | 'mock'
  | 'sumup'
  | 'square'
  | 'clover'
  | 'epos_now'
  | 'lightspeed'
  | 'custom';

export type EposConnectionStatus =
  | 'not_connected'
  | 'test_mode'
  | 'connected'
  | 'error';

export type EposEventType =
  | 'booking.created'
  | 'booking.updated'
  | 'booking.cancelled'
  | 'booking.seated'
  | 'booking.completed'
  | 'deposit.paid'
  | 'deposit.refunded'
  | 'preorder.created'
  | 'customer.updated';

export type EposSyncStatus = 'pending' | 'success' | 'failed' | 'skipped';

export interface EposConnection {
  id: string;
  restaurant_id: string;
  provider: EposProvider;
  connection_status: EposConnectionStatus;
  sync_new_bookings: boolean;
  sync_booking_updates: boolean;
  sync_cancellations: boolean;
  sync_deposits: boolean;
  open_order_on_seated: boolean;
  pull_sales_data: boolean;
  provider_config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface EposSyncEvent {
  id: string;
  restaurant_id: string;
  reservation_id: string | null;
  provider: string;
  event_type: EposEventType;
  status: EposSyncStatus;
  request_payload: Record<string, unknown>;
  response_payload: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
}

export interface CreateSyncEventPayload {
  restaurant_id: string;
  reservation_id?: string | null;
  provider: string;
  event_type: EposEventType;
  status: EposSyncStatus;
  request_payload?: Record<string, unknown>;
  response_payload?: Record<string, unknown>;
  error_message?: string | null;
}

// ── Provider labels ───────────────────────────────────────────────────────────

export const PROVIDER_LABELS: Record<EposProvider, string> = {
  none: 'None',
  mock: 'Test / Mock Provider',
  sumup: 'SumUp',
  square: 'Square',
  clover: 'Clover',
  epos_now: 'Epos Now',
  lightspeed: 'Lightspeed',
  custom: 'Custom',
};

// Providers that are live and functional
export const LIVE_PROVIDERS: EposProvider[] = ['none', 'mock'];

// ── Data access ───────────────────────────────────────────────────────────────

export async function getRestaurantEposConnection(
  restaurantId: string
): Promise<EposConnection | null> {
  const { data, error } = await supabase
    .from('restaurant_epos_connections')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  if (error) {
    console.error('[epos] getRestaurantEposConnection error:', error);
    return null;
  }

  return data as EposConnection | null;
}

export async function upsertEposConnection(
  restaurantId: string,
  updates: Partial<Omit<EposConnection, 'id' | 'restaurant_id' | 'created_at' | 'updated_at'>>
): Promise<EposConnection | null> {
  const payload = {
    restaurant_id: restaurantId,
    ...updates,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('restaurant_epos_connections')
    .upsert(payload, { onConflict: 'restaurant_id' })
    .select()
    .maybeSingle();

  if (error) {
    console.error('[epos] upsertEposConnection error:', error);
    return null;
  }

  return data as EposConnection | null;
}

export async function createEposSyncEvent(
  payload: CreateSyncEventPayload
): Promise<EposSyncEvent | null> {
  const { data, error } = await supabase
    .from('epos_sync_events')
    .insert({
      restaurant_id: payload.restaurant_id,
      reservation_id: payload.reservation_id ?? null,
      provider: payload.provider,
      event_type: payload.event_type,
      status: payload.status,
      request_payload: payload.request_payload ?? {},
      response_payload: payload.response_payload ?? {},
      error_message: payload.error_message ?? null,
    })
    .select()
    .maybeSingle();

  if (error) {
    console.error('[epos] createEposSyncEvent error:', error);
    return null;
  }

  return data as EposSyncEvent | null;
}

export async function getEposSyncEvents(
  restaurantId: string,
  limit = 50
): Promise<EposSyncEvent[]> {
  const { data, error } = await supabase
    .from('epos_sync_events')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[epos] getEposSyncEvents error:', error);
    return [];
  }

  return (data ?? []) as EposSyncEvent[];
}

// ── Mock provider responses ───────────────────────────────────────────────────

function mockId(): string {
  return Math.floor(10000 + Math.random() * 90000).toString();
}

function getMockResponse(eventType: EposEventType): Record<string, unknown> {
  switch (eventType) {
    case 'booking.created':
      return {
        mock_epos_booking_reference: `MOCK-BOOKING-${mockId()}`,
        message: 'Mock booking sync completed successfully',
      };
    case 'booking.updated':
      return {
        mock_epos_booking_reference: `MOCK-BOOKING-${mockId()}`,
        message: 'Mock booking update synced successfully',
      };
    case 'booking.cancelled':
      return {
        mock_epos_booking_reference: `MOCK-BOOKING-${mockId()}`,
        message: 'Mock booking cancellation synced successfully',
      };
    case 'booking.seated':
      return {
        mock_epos_order_id: `MOCK-${mockId()}`,
        message: 'Mock EPOS order/table opened successfully',
      };
    case 'booking.completed':
      return {
        mock_epos_order_id: `MOCK-${mockId()}`,
        mock_total: '0.00',
        message: 'Mock EPOS order completed successfully',
      };
    case 'deposit.paid':
      return {
        mock_epos_payment_id: `MOCK-PAY-${mockId()}`,
        message: 'Mock deposit payment synced to EPOS successfully',
      };
    case 'deposit.refunded':
      return {
        mock_epos_refund_id: `MOCK-REF-${mockId()}`,
        message: 'Mock deposit refund synced to EPOS successfully',
      };
    case 'preorder.created':
      return {
        mock_epos_preorder_id: `MOCK-PRE-${mockId()}`,
        message: 'Mock pre-order synced to EPOS successfully',
      };
    case 'customer.updated':
      return {
        mock_epos_customer_id: `MOCK-CUS-${mockId()}`,
        message: 'Mock customer record updated in EPOS successfully',
      };
  }
}

// ── Core sync dispatcher ──────────────────────────────────────────────────────

interface SyncOptions {
  restaurantId: string;
  reservationId?: string | null;
  eventType: EposEventType;
  toggleKey: keyof Pick<
    EposConnection,
    | 'sync_new_bookings'
    | 'sync_booking_updates'
    | 'sync_cancellations'
    | 'sync_deposits'
    | 'open_order_on_seated'
    | 'pull_sales_data'
  >;
  requestPayload?: Record<string, unknown>;
}

async function dispatchSync(options: SyncOptions): Promise<void> {
  try {
    const conn = await getRestaurantEposConnection(options.restaurantId);

    // No config at all — silently skip (restaurant hasn't set up EPOS yet)
    if (!conn) return;

    // Toggle disabled — skip without logging
    if (!conn[options.toggleKey]) return;

    const provider = conn.provider as EposProvider;
    const req = options.requestPayload ?? {};

    // None provider — log as skipped
    if (provider === 'none') {
      await createEposSyncEvent({
        restaurant_id: options.restaurantId,
        reservation_id: options.reservationId,
        provider: 'none',
        event_type: options.eventType,
        status: 'skipped',
        request_payload: req,
        response_payload: {},
        error_message: 'No EPOS provider configured',
      });
      return;
    }

    // Mock provider — log as success with fake data
    if (provider === 'mock') {
      const mockResp = getMockResponse(options.eventType);
      await createEposSyncEvent({
        restaurant_id: options.restaurantId,
        reservation_id: options.reservationId,
        provider: 'mock',
        event_type: options.eventType,
        status: 'success',
        request_payload: req,
        response_payload: mockResp,
      });
      return;
    }

    // Real provider — not yet implemented; log as skipped
    await createEposSyncEvent({
      restaurant_id: options.restaurantId,
      reservation_id: options.reservationId,
      provider,
      event_type: options.eventType,
      status: 'skipped',
      request_payload: req,
      response_payload: {},
      error_message: `Provider "${PROVIDER_LABELS[provider] ?? provider}" coming soon`,
    });
  } catch (err) {
    // Never surface EPOS errors to callers — log to console only
    console.error('[epos] dispatchSync error (non-blocking):', err);
  }
}

// ── Public sync API ───────────────────────────────────────────────────────────

function reservationPayload(reservation: Partial<Reservation>): Record<string, unknown> {
  return {
    reservation_id: reservation.id,
    reservation_code: (reservation as any).reservation_code,
    customer_name: reservation.customer_name,
    customer_email: reservation.customer_email,
    party_size: reservation.party_size,
    start_time: reservation.start_time,
    end_time: reservation.end_time,
    table_id: reservation.table_id,
    status: reservation.status,
  };
}

export async function syncBookingCreated(reservation: Partial<Reservation>): Promise<void> {
  if (!reservation.restaurant_id) return;
  await dispatchSync({
    restaurantId: reservation.restaurant_id,
    reservationId: reservation.id,
    eventType: 'booking.created',
    toggleKey: 'sync_new_bookings',
    requestPayload: reservationPayload(reservation),
  });
}

export async function syncBookingUpdated(reservation: Partial<Reservation>): Promise<void> {
  if (!reservation.restaurant_id) return;
  await dispatchSync({
    restaurantId: reservation.restaurant_id,
    reservationId: reservation.id,
    eventType: 'booking.updated',
    toggleKey: 'sync_booking_updates',
    requestPayload: reservationPayload(reservation),
  });
}

export async function syncBookingCancelled(reservation: Partial<Reservation>): Promise<void> {
  if (!reservation.restaurant_id) return;
  await dispatchSync({
    restaurantId: reservation.restaurant_id,
    reservationId: reservation.id,
    eventType: 'booking.cancelled',
    toggleKey: 'sync_cancellations',
    requestPayload: reservationPayload(reservation),
  });
}

export async function syncBookingSeated(reservation: Partial<Reservation>): Promise<void> {
  if (!reservation.restaurant_id) return;
  await dispatchSync({
    restaurantId: reservation.restaurant_id,
    reservationId: reservation.id,
    eventType: 'booking.seated',
    toggleKey: 'open_order_on_seated',
    requestPayload: reservationPayload(reservation),
  });
}

export async function syncBookingCompleted(reservation: Partial<Reservation>): Promise<void> {
  if (!reservation.restaurant_id) return;
  await dispatchSync({
    restaurantId: reservation.restaurant_id,
    reservationId: reservation.id,
    eventType: 'booking.completed',
    toggleKey: 'pull_sales_data',
    requestPayload: reservationPayload(reservation),
  });
}

export async function syncDepositPaid(
  restaurantId: string,
  reservationId: string | null,
  paymentData: Record<string, unknown>
): Promise<void> {
  await dispatchSync({
    restaurantId,
    reservationId,
    eventType: 'deposit.paid',
    toggleKey: 'sync_deposits',
    requestPayload: paymentData,
  });
}
