import { supabase } from '../lib/supabase';

export type ErrorSeverity = 'error' | 'warning' | 'info';

export type ErrorArea =
  | 'booking'
  | 'holds'
  | 'email'
  | 'floorplan'
  | 'availability'
  | 'manage';

export type ErrorEventType =
  | 'booking_create_failed'
  | 'hold_create_failed'
  | 'hold_confirm_failed'
  | 'hold_release_failed'
  | 'confirmation_email_failed'
  | 'manage_lookup_failed'
  | 'floorplan_load_failed'
  | 'availability_load_failed'
  | 'supabase_query_failed';

export interface LogAppErrorParams {
  severity?: ErrorSeverity;
  area: ErrorArea;
  event_type: ErrorEventType;
  restaurant_id?: string | null;
  reservation_id?: string | null;
  table_id?: string | null;
  reservation_code?: string | null;
  /** Raw customer email — will be hashed before storage, never stored as-is. */
  customer_email?: string | null;
  message?: string | null;
  /** Arbitrary metadata — sensitive fields will be stripped before storage. */
  metadata?: Record<string, unknown> | null;
}

// Fields that must never appear in stored metadata.
const SENSITIVE_KEYS = [
  'manage_token',
  'manageToken',
  'cancellation_token',
  'cancellationToken',
  'secure_token',
  'secureToken',
  'access_token',
  'accessToken',
  'refresh_token',
  'refreshToken',
  'anon_key',
  'anonKey',
  'service_role_key',
  'serviceRoleKey',
  'api_key',
  'apiKey',
  'password',
  'customer_email',
  'customerEmail',
  'customer_phone',
  'customerPhone',
  'customer_name',
  'customerName',
  'phone',
  'email',
  'name',
  'token',
  'secret',
  'key',
];

function scrubMetadata(
  raw: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!raw) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    const lower = k.toLowerCase();
    if (SENSITIVE_KEYS.some(s => lower === s || lower.includes(s))) continue;
    out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Simple deterministic hash using the Web Crypto API (available in all modern browsers). */
async function hashEmail(email: string): Promise<string | null> {
  try {
    const normalised = email.trim().toLowerCase();
    const encoded = new TextEncoder().encode(normalised);
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

/**
 * Log a critical operational error to app_error_events via a SECURITY DEFINER
 * RPC. This function NEVER throws — a logging failure must never block the
 * customer booking flow.
 */
export async function logAppError(params: LogAppErrorParams): Promise<void> {
  try {
    const emailHash = params.customer_email
      ? await hashEmail(params.customer_email)
      : null;

    const scrubbedMetadata = scrubMetadata(params.metadata ?? null);

    await supabase.rpc('insert_app_error_event', {
      p_severity: params.severity ?? 'error',
      p_area: params.area,
      p_event_type: params.event_type,
      p_restaurant_id: params.restaurant_id ?? null,
      p_reservation_id: params.reservation_id ?? null,
      p_table_id: params.table_id ?? null,
      p_reservation_code: params.reservation_code ?? null,
      p_customer_email_hash: emailHash,
      p_message: params.message ?? null,
      p_metadata: scrubbedMetadata ? JSON.stringify(scrubbedMetadata) : null,
    });
  } catch (err) {
    // Silently swallow — logging must never break the booking flow.
    console.error('[errorLogger] Failed to log error event (non-critical):', err);
  }
}
