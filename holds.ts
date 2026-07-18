import { supabase } from '../lib/supabase';
import { PreOrderItem } from '../lib/types';
import { formatTime, checkBookingLimits } from '../lib/utils';
import { checkBookingRateLimit } from './rateLimit';
import { logAppError } from './errorLogger';
import { notifyBookingRequestReceived } from './acceptance';

export interface TableHold {
  hold_token: string;
  expires_at: string;
}

export interface CreateHoldResult {
  success: boolean;
  hold_token?: string;
  expires_at?: string;
  error?: string;
  message?: string;
}

export interface ConfirmReservationResult {
  success: boolean;
  reservation_id?: string;
  manage_token?: string;
  reservation_code?: string;
  error?: string;
  message?: string;
  emailSent?: boolean;
  emailError?: string;
  status?: string;
  awaitingAcceptance?: boolean;
  payment_required?: boolean;
  deposit_amount_pence?: number;
}

export async function createTableHold(
  restaurantId: string,
  tableId: string,
  startTime: Date,
  endTime: Date,
  partySize: number,
  userId?: string,
  sessionKey?: string
): Promise<CreateHoldResult> {
  try {
    const { data, error } = await supabase.rpc('create_table_hold', {
      p_restaurant_id: restaurantId,
      p_table_id: tableId,
      p_start_time: startTime.toISOString(),
      p_end_time: endTime.toISOString(),
      p_party_size: partySize,
      p_user_id: userId || null,
      p_session_key: sessionKey || null,
    });

    if (error) {
      console.error('[holds] Failed to create hold:', error);
      logAppError({
        area: 'holds',
        event_type: 'hold_create_failed',
        restaurant_id: restaurantId,
        table_id: tableId,
        message: 'RPC error creating table hold',
        metadata: { rpc_error: error.message, code: error.code },
      });
      return {
        success: false,
        error: 'RPC_ERROR',
        message: 'Failed to create table hold',
      };
    }

    return data as CreateHoldResult;
  } catch (error) {
    console.error('[holds] Exception creating hold:', error);
    logAppError({
      area: 'holds',
      event_type: 'hold_create_failed',
      restaurant_id: restaurantId,
      table_id: tableId,
      message: error instanceof Error ? error.message : 'Exception creating table hold',
    });
    return {
      success: false,
      error: 'EXCEPTION',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/** Variant of createTableHold used for joined-combo tables — skips the single-table capacity check. */
async function createTableHoldForJoined(
  restaurantId: string,
  tableId: string,
  startTime: Date,
  endTime: Date,
  partySize: number,
  userId?: string,
  sessionKey?: string
): Promise<CreateHoldResult> {
  try {
    const { data, error } = await supabase.rpc('create_table_hold', {
      p_restaurant_id: restaurantId,
      p_table_id: tableId,
      p_start_time: startTime.toISOString(),
      p_end_time: endTime.toISOString(),
      p_party_size: partySize,
      p_user_id: userId || null,
      p_session_key: sessionKey || null,
      p_skip_capacity_check: true,
    });

    if (error) {
      console.error('[holds] Failed to create joined hold:', error);
      return { success: false, error: 'RPC_ERROR', message: 'Failed to create table hold' };
    }

    return data as CreateHoldResult;
  } catch (error) {
    console.error('[holds] Exception creating joined hold:', error);
    return {
      success: false,
      error: 'EXCEPTION',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export interface JoinedHoldResult {
  success: boolean;
  primaryHoldToken?: string;
  holdGroupToken?: string;
  allHoldTokens?: string[];
  expires_at?: string;
  error?: string;
  message?: string;
}

/**
 * Creates one hold per table in a joined-combination and links them via a shared
 * hold_group_token. If any individual hold fails (table already taken), all
 * previously created holds in this group are released atomically.
 *
 * Returns the primary table's hold_token so the existing BookingPage/confirmation
 * flow is unchanged, plus holdGroupToken so all can be released on cancel.
 */
export async function createJoinedTableHolds(
  restaurantId: string,
  primaryTableId: string,
  joinedTableIds: string[],
  startTime: Date,
  endTime: Date,
  partySize: number,
  userId?: string,
  sessionKey?: string
): Promise<JoinedHoldResult> {
  const allTableIds = [primaryTableId, ...joinedTableIds];
  const holdGroupToken = crypto.randomUUID();
  const createdTokens: string[] = [];

  console.log('[JoinedValidation] createJoinedTableHolds called', {
    primaryTableId,
    joinedTableIds,
    partySize,
    allTableIds,
  });

  try {
    for (const tableId of allTableIds) {
      // Pass p_skip_capacity_check = true so the per-table capacity rule is not applied.
      // For joined combos the party size is validated against combined_capacity before this call.
      const result = await createTableHoldForJoined(
        restaurantId,
        tableId,
        startTime,
        endTime,
        partySize,
        userId,
        sessionKey
      );

      console.log('[JoinedValidation] hold result for table', tableId, result);

      if (!result.success) {
        // Roll back all holds created so far
        await Promise.allSettled(createdTokens.map(token => releaseTableHold(token)));
        return {
          success: false,
          error: result.error,
          message: result.message || `Could not hold table — it may have just been booked.`,
        };
      }

      createdTokens.push(result.hold_token!);

      // Tag hold with group token so all can be released together
      await supabase
        .from('table_holds')
        .update({ hold_group_token: holdGroupToken })
        .eq('hold_token', result.hold_token!);
    }

    const primaryToken = createdTokens[0];
    const primaryHold = await supabase
      .from('table_holds')
      .select('expires_at')
      .eq('hold_token', primaryToken)
      .maybeSingle();

    return {
      success: true,
      primaryHoldToken: primaryToken,
      holdGroupToken,
      allHoldTokens: createdTokens,
      expires_at: primaryHold.data?.expires_at,
    };
  } catch (err) {
    await Promise.allSettled(createdTokens.map(token => releaseTableHold(token)));
    return {
      success: false,
      error: 'EXCEPTION',
      message: err instanceof Error ? err.message : 'Failed to create joined table holds',
    };
  }
}

/** Releases all holds belonging to a hold group. */
export async function releaseHoldGroup(holdGroupToken: string): Promise<void> {
  await supabase
    .from('table_holds')
    .delete()
    .eq('hold_group_token', holdGroupToken);
}

export async function releaseTableHold(holdToken: string): Promise<boolean> {
  try {
    console.log('[holds] Releasing hold:', holdToken);

    const { error } = await supabase
      .from('table_holds')
      .delete()
      .eq('hold_token', holdToken);

    if (error) {
      console.error('[holds] Failed to release hold:', error);
      return false;
    }

    console.log('[holds] Hold released successfully');
    return true;
  } catch (error) {
    console.error('[holds] Exception releasing hold:', error);
    return false;
  }
}

export async function confirmReservationFromHold(
  holdToken: string,
  customerName: string,
  customerEmail: string,
  customerPhone: string,
  notes: string,
  preorderItems: PreOrderItem[],
  preorderTotal: number,
  source: string,
  customerUserId?: string,
  restaurantId?: string,
  marketingOptIn?: boolean,
  combinedCapacity?: number
): Promise<ConfirmReservationResult> {
  try {
    console.log('[holds] Confirming reservation with params:', {
      holdToken,
      customerName,
      customerEmail,
      customerPhone,
      hasNotes: !!notes,
      preorderItemsCount: preorderItems.length,
      preorderTotal,
      source,
      customerUserId,
    });

    // Server-side rate limit check before any DB write
    if (restaurantId) {
      await checkBookingRateLimit(restaurantId, customerEmail);
    }

    // Re-validate booking limits against the hold's stored date/time/partySize
    const { data: holdData } = await supabase
      .from('table_holds')
      .select('start_time, party_size, restaurant_id')
      .eq('hold_token', holdToken)
      .maybeSingle();

    if (holdData) {
      const holdRestaurantId = holdData.restaurant_id || restaurantId;
      const { data: restData } = await supabase
        .from('restaurants')
        .select('minimum_booking_notice_minutes, max_online_party_size')
        .eq('id', holdRestaurantId)
        .maybeSingle();

      if (restData) {
        const holdStart = new Date(holdData.start_time);
        const holdDate = holdStart.toISOString().slice(0, 10);
        const holdTime = holdStart.toISOString().slice(11, 16);
        // For joined-combo bookings the combined capacity may exceed max_online_party_size.
        // Extend the effective limit so the combo booking is not blocked.
        const baseMax = restData.max_online_party_size ?? 8;
        const effectiveMax = combinedCapacity && combinedCapacity > baseMax ? combinedCapacity : baseMax;
        const violation = checkBookingLimits(
          holdDate,
          holdTime,
          holdData.party_size,
          restData.minimum_booking_notice_minutes ?? 120,
          effectiveMax
        );
        if (violation) {
          return { success: false, error: 'BOOKING_LIMIT', message: violation.message };
        }
      }
    }

    const { data, error } = await supabase.rpc('confirm_reservation_from_hold', {
      p_hold_token: holdToken,
      p_customer_name: customerName,
      p_customer_email: customerEmail,
      p_customer_phone: customerPhone,
      p_notes: notes || '',
      p_preorder_items: preorderItems,
      p_preorder_total: preorderTotal,
      p_source: source,
      p_customer_user_id: customerUserId || null,
    });

    if (error) {
      console.error('[holds] RPC error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        fullError: error,
      });
      logAppError({
        area: 'holds',
        event_type: 'hold_confirm_failed',
        restaurant_id: restaurantId,
        customer_email: customerEmail,
        message: 'RPC error confirming reservation from hold',
        metadata: { rpc_error: error.message, code: error.code },
      });
      return {
        success: false,
        error: 'RPC_ERROR',
        message: `Database error: ${error.message || 'Failed to confirm reservation'}`,
      };
    }

    console.log('[holds] Confirmation successful:', data);

    let result = data as ConfirmReservationResult;

    if (!result.success || !result.reservation_id || !result.manage_token || !result.reservation_code) {
      console.error('[holds] RPC returned success but missing required fields:', result);
      return {
        success: false,
        error: 'RPC_ERROR',
        message: result.message || 'Reservation confirmed but required fields are missing',
      };
    }

    const reservationId = result.reservation_id;
    const manageToken = result.manage_token;

    // Deposit requirements and acceptance mode are calculated from canonical
    // restaurant settings in the database, never from client-supplied amounts.
    const { data: depositPreparation } = await supabase.rpc('prepare_reservation_deposit', {
      p_reservation_id: reservationId,
      p_manage_token: manageToken,
    });
    const requiresDeposit = depositPreparation?.success === true && depositPreparation?.required === true;

    const { data: acceptanceData } = await supabase.rpc('apply_reservation_acceptance_mode', {
      p_reservation_id: reservationId,
      p_manage_token: manageToken,
    });
    const awaitingAcceptance = acceptanceData?.success && acceptanceData?.status === 'pending_acceptance';
    result = {
      ...result,
      status: acceptanceData?.status || 'booked',
      awaitingAcceptance,
      payment_required: requiresDeposit,
      deposit_amount_pence: requiresDeposit ? depositPreparation.amount_pence : undefined,
    };

    if (result.success && result.reservation_id) {
      // Patch contact preference and reconfirmation fields — the RPC doesn't set these
      const optIn = marketingOptIn ?? false;

      // Check whether this restaurant has reconfirmation enabled
      const { data: rcSettings } = await supabase
        .from('restaurant_booking_settings')
        .select('reconfirmation_enabled')
        .eq('restaurant_id', restaurantId)
        .maybeSingle();
      const reconfirmationRequired = !awaitingAcceptance && rcSettings?.reconfirmation_enabled === true;

      await supabase
        .from('reservations')
        .update({
          marketing_opt_in: optIn,
          marketing_opt_in_at: optIn ? new Date().toISOString() : null,
          marketing_opt_in_source: optIn ? 'booking_form' : null,
          service_email_notifications_allowed: true,
          service_sms_notifications_allowed: customerPhone.trim().length > 0,
          reconfirmation_required: reconfirmationRequired,
          confirmation_status: reconfirmationRequired ? 'pending' : 'not_required',
        })
        .eq('id', result.reservation_id);
    }

    let emailSent = false;
    let emailError: string | undefined;

    if (result.awaitingAcceptance) {
      notifyBookingRequestReceived(reservationId, manageToken).catch(() => {});
      return { ...result, emailSent, emailError };
    }

    if (requiresDeposit) {
      return { ...result, emailSent, emailError };
    }

    try {
      const { data: reservation, error: resError } = await supabase
        .from('reservations')
        .select(`
          *,
          restaurants:restaurant_id (
            name,
            address
          ),
          tables:table_id (
            name
          )
        `)
        .eq('id', result.reservation_id)
        .maybeSingle();

      if (resError || !reservation) {
        console.error('[holds] Failed to fetch reservation for email:', resError);
        emailError = 'Failed to fetch reservation details';
      } else {
        const startTime = new Date(reservation.start_time);
        const endTime = new Date(reservation.end_time);

        const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-confirmation-email`;
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            reservation_id: reservation.id,
            customer_name: customerName,
            customer_email: customerEmail,
            restaurant_name: reservation.restaurants.name,
            restaurant_address: reservation.restaurants.address,
            date: startTime.toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            }),
            start_time: formatTime(startTime),
            end_time: formatTime(endTime),
            table_name: reservation.tables.name,
            party_size: reservation.party_size,
            manage_token: result.manage_token,
            reservation_code: result.reservation_code,
          }),
        });

        const emailResult = await response.json();

        if (emailResult.success) {
          console.log('[holds] Confirmation email sent successfully:', emailResult);
          emailSent = true;
        } else {
          console.error('[holds] Email sending failed:', emailResult);
          emailError = emailResult.error || 'Failed to send confirmation email';
          logAppError({
            area: 'email',
            event_type: 'confirmation_email_failed',
            restaurant_id: restaurantId,
            reservation_id: result.reservation_id,
            reservation_code: result.reservation_code,
            customer_email: customerEmail,
            message: emailError,
          });
        }
      }
    } catch (error) {
      console.error('[holds] Failed to send confirmation email:', error);
      emailError = error instanceof Error ? error.message : 'Failed to send confirmation email';
      logAppError({
        area: 'email',
        event_type: 'confirmation_email_failed',
        restaurant_id: restaurantId,
        reservation_id: result.reservation_id,
        reservation_code: result.reservation_code,
        customer_email: customerEmail,
        message: emailError,
      });
    }

    return {
      ...result,
      emailSent,
      emailError,
    };
  } catch (error) {
    console.error('[holds] Exception confirming reservation:', error);
    // Don't log rate-limit exceptions as internal errors
    const isRateLimit = (error as any)?.code === 'RATE_LIMIT';
    if (!isRateLimit) {
      logAppError({
        area: 'holds',
        event_type: 'hold_confirm_failed',
        restaurant_id: restaurantId,
        customer_email: customerEmail,
        message: error instanceof Error ? error.message : 'Exception confirming reservation from hold',
      });
    }
    return {
      success: false,
      error: isRateLimit ? 'RATE_LIMIT' : 'EXCEPTION',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
