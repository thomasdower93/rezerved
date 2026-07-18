import { supabase } from '../lib/supabase';

export interface TrialRequestPayload {
  restaurant_name: string;
  contact_name: string;
  email: string;
  phone: string;
  location: string;
  current_booking_system: string;
  website?: string;
  covers?: string;
  interests?: string[];
  message?: string;
  consent_to_contact: boolean;
}

export interface TrialRequest extends TrialRequestPayload {
  id: string;
  status: string;
  created_at: string;
}

export async function submitTrialRequest(payload: TrialRequestPayload): Promise<void> {
  const { error } = await supabase.from('trial_requests').insert([payload]);
  if (error) throw new Error(error.message);
}

export async function getTrialRequests(): Promise<TrialRequest[]> {
  const { data, error } = await supabase
    .from('trial_requests')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function updateTrialRequestStatus(id: string, status: string): Promise<void> {
  const { error } = await supabase
    .from('trial_requests')
    .update({ status })
    .eq('id', id);
  if (error) throw new Error(error.message);
}
