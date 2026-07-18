import { supabase } from '../lib/supabase';
import { SumUpSettings, SumUpPosSession } from '../lib/types';

export async function getSumUpSettings(restaurantId: string): Promise<SumUpSettings> {
  const { data, error } = await supabase.rpc('get_sumup_settings', {
    p_restaurant_id: restaurantId,
  });
  if (error) throw new Error(error.message);
  return data as SumUpSettings;
}

export async function saveSumUpCredentials(
  restaurantId: string,
  apiKey: string,
  merchantCode: string,
  depositsEnabled: boolean,
  posEnabled: boolean,
  posTestMode: boolean,
): Promise<void> {
  const { error } = await supabase.rpc('save_sumup_credentials', {
    p_restaurant_id: restaurantId,
    p_api_key: apiKey,
    p_merchant_code: merchantCode,
    p_deposits_enabled: depositsEnabled,
    p_pos_enabled: posEnabled,
    p_pos_test_mode: posTestMode,
  });
  if (error) throw new Error(error.message);
}

export async function getPosSessionForReservation(reservationId: string): Promise<SumUpPosSession | null> {
  const { data, error } = await supabase
    .from('sumup_pos_sessions')
    .select('*')
    .eq('reservation_id', reservationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data as SumUpPosSession | null;
}

export async function openTableOnPos(
  reservationId: string,
  restaurantId: string,
  tableName: string,
  covers: number,
  customerName: string,
): Promise<{ success: boolean; already_open?: boolean; shadow_mode?: boolean; session_id?: string; error?: string }> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const { data: { session } } = await supabase.auth.getSession();

  const res = await fetch(`${supabaseUrl}/functions/v1/sumup-open-table`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token ?? anonKey}`,
      'Apikey': anonKey,
    },
    body: JSON.stringify({
      reservation_id: reservationId,
      restaurant_id: restaurantId,
      table_name: tableName,
      covers,
      customer_name: customerName,
    }),
  });

  const json = await res.json();
  if (!res.ok) return { success: false, error: json.error || 'Failed to open table on POS.' };
  return { success: true, already_open: json.already_open, shadow_mode: json.shadow_mode, session_id: json.session_id };
}
