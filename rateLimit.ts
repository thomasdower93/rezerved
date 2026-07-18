import { supabase } from '../lib/supabase';

export const RATE_LIMIT_ERROR = 'RATE_LIMIT';
export const RATE_LIMIT_MESSAGE =
  'Too many booking attempts. Please wait a few minutes before trying again.';

/**
 * Calls the server-side RPC to check and record a reservation creation attempt.
 * Returns true if the attempt is allowed, throws an error with RATE_LIMIT_ERROR
 * if the rate limit has been exceeded.
 *
 * Must be called immediately before reservation creation (both the hold-confirm
 * path and the direct-create path).
 */
export async function checkBookingRateLimit(
  restaurantId: string,
  customerEmail: string
): Promise<void> {
  const { data, error } = await supabase.rpc('check_and_record_booking_attempt', {
    p_restaurant_id: restaurantId,
    p_customer_email: customerEmail.trim().toLowerCase(),
    p_ip_address: null,
  });

  if (error) {
    // If the RPC itself fails, log but allow the booking to proceed so a
    // transient DB issue never blocks a legitimate customer.
    console.error('[rateLimit] RPC error — allowing booking to proceed:', error);
    return;
  }

  const result = data as { allowed: boolean; reason: string } | null;

  if (result && !result.allowed) {
    const err = new Error(RATE_LIMIT_MESSAGE);
    (err as any).code = RATE_LIMIT_ERROR;
    throw err;
  }
}
