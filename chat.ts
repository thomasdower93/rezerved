import { supabase } from '../lib/supabase';

export interface ReservationConversation {
  id: string;
  reservation_id: string;
  restaurant_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  status: 'open' | 'closed' | 'read_only';
  last_customer_message_at: string | null;
  last_restaurant_message_at: string | null;
  customer_last_viewed_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReservationMessage {
  id: string;
  conversation_id: string;
  reservation_id: string;
  restaurant_id: string;
  sender_type: 'customer' | 'restaurant' | 'system';
  sender_name: string;
  message_body: string;
  created_at: string;
  read_at: string | null;
}

// ─── Staff functions (authenticated) ─────────────────────────────────────────

/**
 * Looks up an existing conversation for a reservation.
 * Returns null if none exists yet — that is a normal state, not an error.
 * Throws only on genuine Supabase/network errors.
 */
export async function getConversationForReservation(
  reservationId: string,
): Promise<ReservationConversation | null> {
  const { data, error } = await supabase
    .from('reservation_conversations')
    .select('*')
    .eq('reservation_id', reservationId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? (data as ReservationConversation) : null;
}

/**
 * Finds or creates the conversation for a reservation.
 * Only called when staff sends the first message, so creation is intentional.
 * Uses upsert to avoid duplicate rows on rapid double-clicks.
 */
export async function getOrCreateConversationForReservation(
  reservationId: string,
  restaurantId: string,
  customerName: string,
  customerPhone: string,
  customerEmail: string
): Promise<ReservationConversation | null> {
  // Try to get existing first
  const { data: existing } = await supabase
    .from('reservation_conversations')
    .select('*')
    .eq('reservation_id', reservationId)
    .maybeSingle();

  if (existing) return existing as ReservationConversation;

  // Create new — upsert on reservation_id prevents duplicates on concurrent sends
  const { data, error } = await supabase
    .from('reservation_conversations')
    .upsert(
      {
        reservation_id: reservationId,
        restaurant_id: restaurantId,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail,
        status: 'open',
      },
      { onConflict: 'reservation_id', ignoreDuplicates: false }
    )
    .select()
    .maybeSingle();

  if (error) {
    console.error('[chat] Failed to create conversation:', error.message, { reservationId, restaurantId });
    return null;
  }

  return data as ReservationConversation;
}

export async function getMessagesForConversation(
  conversationId: string
): Promise<ReservationMessage[]> {
  const { data, error } = await supabase
    .from('reservation_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to load messages:', error);
    return [];
  }

  return (data || []) as ReservationMessage[];
}

export async function getOpenConversationsForRestaurant(
  restaurantId: string
): Promise<ReservationConversation[]> {
  const { data, error } = await supabase
    .from('reservation_conversations')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('status', 'open')
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []) as ReservationConversation[];
}

export async function markConversationReadByStaff(
  conversationId: string,
  restaurantId: string,
  reservationId: string,
  userId?: string
): Promise<void> {
  const readAt = new Date().toISOString();

  await Promise.all([
    supabase
      .from('reservation_messages')
      .update({ read_at: readAt })
      .eq('conversation_id', conversationId)
      .eq('restaurant_id', restaurantId)
      .eq('sender_type', 'customer')
      .is('read_at', null),
    supabase
      .from('app_error_events')
      .update({ resolved_at: readAt, resolved_by: userId ?? null })
      .eq('restaurant_id', restaurantId)
      .eq('reservation_id', reservationId)
      .eq('area', 'messages')
      .is('resolved_at', null),
  ]);

  window.dispatchEvent(new CustomEvent('rezerved:alerts-changed', {
    detail: { reservationId, restaurantId },
  }));
}

export type EmailNotificationStatus =
  | 'sent'
  | 'skipped_cooldown'
  | 'skipped_restaurant_disabled'
  | 'skipped_customer_disabled'
  | 'failed'
  | 'not_attempted';

export interface SendRestaurantMessageResult {
  message: ReservationMessage | null;
  emailStatus: EmailNotificationStatus;
}

export async function sendRestaurantMessage(
  conversationId: string,
  reservationId: string,
  restaurantId: string,
  messageBody: string,
  senderName: string,
  manageToken?: string
): Promise<SendRestaurantMessageResult> {
  const { data, error } = await supabase
    .from('reservation_messages')
    .insert({
      conversation_id: conversationId,
      reservation_id: reservationId,
      restaurant_id: restaurantId,
      sender_type: 'restaurant',
      sender_name: senderName,
      message_body: messageBody,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to send message:', error);
    return { message: null, emailStatus: 'not_attempted' };
  }

  // Update last_restaurant_message_at
  await supabase
    .from('reservation_conversations')
    .update({ last_restaurant_message_at: new Date().toISOString() })
    .eq('id', conversationId);

  // Fire chat email notification — non-blocking, result reported back to caller
  let emailStatus: EmailNotificationStatus = 'not_attempted';
  if (manageToken) {
    try {
      emailStatus = await triggerChatEmailNotification(
        (data as ReservationMessage).id,
        conversationId,
        reservationId,
        restaurantId,
        messageBody,
        manageToken
      );
    } catch (err) {
      console.warn('[chat] Email notification failed (non-blocking):', err);
      emailStatus = 'failed';
    }
  }

  return { message: data as ReservationMessage, emailStatus };
}

async function triggerChatEmailNotification(
  messageId: string,
  conversationId: string,
  reservationId: string,
  restaurantId: string,
  messageBody: string,
  manageToken: string
): Promise<EmailNotificationStatus> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return 'failed';

  const [reservationResult, restaurantResult] = await Promise.all([
    supabase
      .from('reservations')
      .select('customer_name, customer_email, start_time, party_size')
      .eq('id', reservationId)
      .maybeSingle(),
    supabase
      .from('restaurants')
      .select('name')
      .eq('id', restaurantId)
      .maybeSingle(),
  ]);

  const reservation = reservationResult.data;
  const restaurant = restaurantResult.data;

  if (!reservation?.customer_email || !restaurant?.name) {
    console.warn('[chat] Cannot send notification: missing reservation or restaurant data');
    return 'failed';
  }

  const startTime = new Date(reservation.start_time);
  const reservationDate = startTime.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  const reservationTime = startTime.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
  });

  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-chat-notification`;
  const response = await fetch(apiUrl, {
    method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message_id: messageId,
      conversation_id: conversationId,
      reservation_id: reservationId,
      restaurant_id: restaurantId,
      restaurant_name: restaurant.name,
      customer_email: reservation.customer_email,
      customer_name: reservation.customer_name,
      manage_token: manageToken,
      reservation_date: reservationDate,
      reservation_time: reservationTime,
      party_size: reservation.party_size,
      message_preview: messageBody,
    }),
  });

  const result = await response.json().catch(() => ({ success: false }));

  if (result.success) return 'sent';
  if (result.skipped) {
    if (result.reason === 'cooldown') return 'skipped_cooldown';
    if (result.reason === 'restaurant_disabled') return 'skipped_restaurant_disabled';
    if (result.reason === 'customer_disabled') return 'skipped_customer_disabled';
  }
  return 'failed';
}

// ─── Customer functions (token-based, via RPC) ────────────────────────────────

export async function getOrCreateConversationByToken(
  token: string
): Promise<{ conversation: ReservationConversation | null; error?: string }> {
  const { data, error } = await supabase.rpc('get_or_create_conversation_by_token', {
    p_token: token,
  });

  if (error) {
    console.error('Failed to get/create conversation by token:', error);
    return { conversation: null, error: error.message };
  }

  if (data?.error) {
    return { conversation: null, error: data.error };
  }

  return { conversation: data as ReservationConversation };
}

export async function getMessagesByToken(
  token: string,
  conversationId: string
): Promise<ReservationMessage[]> {
  const { data, error } = await supabase.rpc('get_messages_by_token', {
    p_token: token,
    p_conversation_id: conversationId,
  });

  if (error) {
    console.error('Failed to get messages by token:', error);
    return [];
  }

  if (data?.error) return [];

  return (data || []) as ReservationMessage[];
}

// Token-only variant — no conversation_id needed. The DB function resolves the
// conversation server-side from the token, so the frontend never has a stale/missing
// conversation_id. Used by the customer chat polling loop.
export async function getMessagesByTokenOnly(
  token: string
): Promise<ReservationMessage[]> {
  const { data, error } = await supabase.rpc('get_messages_by_token_v2', {
    p_token: token,
  });

  if (error) {
    console.error('[CustomerChat Poll] failed', error);
    return [];
  }

  if (data?.error) {
    console.error('[CustomerChat Poll] failed', data.error);
    return [];
  }

  return (data || []) as ReservationMessage[];
}

export async function sendCustomerMessage(
  token: string,
  conversationId: string,
  messageBody: string,
  senderName: string
): Promise<{ message: ReservationMessage | null; error?: string }> {
  const { data, error } = await supabase.rpc('send_customer_message', {
    p_token: token,
    p_conversation_id: conversationId,
    p_message_body: messageBody,
    p_sender_name: senderName,
  });

  if (error) {
    console.error('Failed to send customer message:', error);
    return { message: null, error: error.message };
  }

  if (data?.error) {
    return { message: null, error: data.error };
  }

  return { message: data as ReservationMessage };
}

export async function markConversationViewedByToken(
  token: string,
  conversationId: string
): Promise<void> {
  await supabase.rpc('mark_conversation_viewed_by_token', {
    p_token: token,
    p_conversation_id: conversationId,
  });
}

// ─── Conversation creation at booking time ────────────────────────────────────

export async function ensureConversationExists(
  reservationId: string,
  restaurantId: string,
  customerName: string,
  customerPhone: string,
  customerEmail: string
): Promise<void> {
  const { data: existing } = await supabase
    .from('reservation_conversations')
    .select('id')
    .eq('reservation_id', reservationId)
    .maybeSingle();

  if (existing) return;

  await supabase.from('reservation_conversations').insert({
    reservation_id: reservationId,
    restaurant_id: restaurantId,
    customer_name: customerName,
    customer_phone: customerPhone,
    customer_email: customerEmail,
    status: 'open',
  });
}
