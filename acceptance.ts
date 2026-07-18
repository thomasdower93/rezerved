import { supabase } from '../lib/supabase';

export interface ReviewReservationResult {
  success: boolean;
  status?: string;
  action?: 'accept' | 'decline';
  payment_url?: string | null;
  error?: string;
}

export async function notifyBookingRequestReceived(
  reservationId: string,
  manageToken: string
): Promise<void> {
  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/booking-request-notification`;
  await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reservation_id: reservationId, manage_token: manageToken }),
  });
}

export async function reviewReservationRequest(
  reservationId: string,
  action: 'accept' | 'decline',
  reason?: string
): Promise<ReviewReservationResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Your session has expired. Please sign in again.');

  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/review-reservation-request`;
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reservation_id: reservationId, action, reason: reason || null }),
  });

  const result = await response.json().catch(() => ({ success: false, error: 'Invalid server response' }));
  if (!response.ok || !result.success) {
    throw new Error(result.error || 'Unable to update the reservation request.');
  }
  return result as ReviewReservationResult;
}
