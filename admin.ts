import { supabase } from '../lib/supabase';
import { Restaurant, OpeningHours } from '../lib/types';

export interface CreateRestaurantData {
  name: string;
  location: string;
  address: string;
  description?: string;
  cuisine?: string;
  business_type?: string;
  city?: string;
  postcode?: string;
  country?: string;
  opening_hours?: OpeningHours;
  table_map_enabled?: boolean;
  preorders_plan_enabled?: boolean;
  price_range?: string;
  amenities?: string[];
  tags?: string[];
  minimum_booking_notice_minutes?: number;
  max_online_party_size?: number | null;
  createOwner?: boolean;
  ownerEmail?: string;
  ownerName?: string;
}

export interface StaffMember {
  id: string;
  email: string;
  full_name: string;
  role: 'staff' | 'restaurant_admin';
  created_at: string;
}

export interface CreateStaffData {
  email: string;
  full_name: string;
  role: 'staff' | 'restaurant_admin';
  restaurant_id: string;
  initial_password?: string;
}

export interface CreateRestaurantResult {
  restaurant: Restaurant;
  ownerCredentials?: { email: string; temporaryPassword: string };
}

export async function createRestaurant(data: CreateRestaurantData): Promise<CreateRestaurantResult> {
  const { data: restaurant, error } = await supabase
    .from('restaurants')
    .insert({
      name: data.name,
      location: data.location,
      address: data.address,
      description: data.description || '',
      cuisine: data.cuisine || null,
      business_type: data.business_type || null,
      city: data.city || null,
      postcode: data.postcode || null,
      country: data.country || 'United Kingdom',
      opening_hours: data.opening_hours || {},
      table_map_enabled: data.table_map_enabled ?? true,
      preorders_plan_enabled: data.preorders_plan_enabled ?? false,
      price_range: data.price_range || '$$',
      amenities: data.amenities || [],
      tags: data.tags || [],
      minimum_booking_notice_minutes: data.minimum_booking_notice_minutes ?? 120,
      max_online_party_size: data.max_online_party_size !== undefined ? data.max_online_party_size : 8,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating restaurant:', error);
    throw new Error(`Failed to create restaurant: ${error.message}`);
  }

  let ownerCredentials: { email: string; temporaryPassword: string } | undefined;

  if (data.createOwner && data.ownerEmail && data.ownerName && restaurant) {
    ownerCredentials = await createStaffAccount({
      email: data.ownerEmail,
      full_name: data.ownerName,
      role: 'restaurant_admin',
      restaurant_id: restaurant.id,
    });
  }

  return { restaurant, ownerCredentials };
}

export async function createStaffAccount(data: CreateStaffData): Promise<{ email: string; temporaryPassword: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-staff-account`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'Apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      email: data.email,
      full_name: data.full_name,
      role: data.role,
      restaurant_id: data.restaurant_id,
      ...(data.initial_password ? { initial_password: data.initial_password } : {}),
    }),
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || 'Failed to create staff account');
  }

  return { email: result.email, temporaryPassword: result.temporaryPassword };
}

export async function getRestaurantStaff(restaurantId: string): Promise<StaffMember[]> {
  const { data, error } = await supabase
    .rpc('get_restaurant_staff', { p_restaurant_id: restaurantId });

  if (error) {
    console.error('Error fetching restaurant staff:', error);
    throw new Error(`Failed to fetch staff: ${error.message}`);
  }

  return data || [];
}

export async function removeStaffMember(userId: string, restaurantId: string): Promise<void> {
  const { error: membershipError } = await supabase
    .from('restaurant_memberships')
    .delete()
    .eq('user_id', userId)
    .eq('restaurant_id', restaurantId);

  if (membershipError) {
    console.error('Error removing restaurant membership:', membershipError);
    throw new Error(`Failed to remove staff member: ${membershipError.message}`);
  }

  const { error: staffError } = await supabase
    .from('staff_profiles')
    .delete()
    .eq('auth_user_id', userId)
    .eq('restaurant_id', restaurantId);

  if (staffError) {
    console.error('Error removing staff profile:', staffError);
  }
}

export async function updateStaffRole(userId: string, restaurantId: string, newRole: 'staff' | 'restaurant_admin'): Promise<void> {
  const { error: membershipError } = await supabase
    .from('restaurant_memberships')
    .update({ role: newRole })
    .eq('user_id', userId)
    .eq('restaurant_id', restaurantId);

  if (membershipError) {
    console.error('Error updating restaurant membership role:', membershipError);
    throw new Error(`Failed to update staff role: ${membershipError.message}`);
  }

  const { error: staffError } = await supabase
    .from('staff_profiles')
    .update({ role: newRole === 'restaurant_admin' ? 'admin' : 'staff' })
    .eq('auth_user_id', userId)
    .eq('restaurant_id', restaurantId);

  if (staffError) {
    console.error('Error updating staff profile role:', staffError);
  }
}

export async function updateRestaurantOpeningHours(restaurantId: string, openingHours: OpeningHours): Promise<void> {
  const { error } = await supabase
    .from('restaurants')
    .update({ opening_hours: openingHours })
    .eq('id', restaurantId);

  if (error) {
    console.error('Error updating opening hours:', error);
    throw new Error(`Failed to update opening hours: ${error.message}`);
  }
}

export async function updateRestaurantAmenities(restaurantId: string, amenities: string[]): Promise<void> {
  const { error } = await supabase
    .from('restaurants')
    .update({ amenities })
    .eq('id', restaurantId);

  if (error) {
    console.error('Error updating restaurant amenities:', error);
    throw new Error(`Failed to update amenities: ${error.message}`);
  }
}

export async function updateRestaurantTags(restaurantId: string, tags: string[]): Promise<void> {
  const { error } = await supabase
    .from('restaurants')
    .update({ tags })
    .eq('id', restaurantId);

  if (error) {
    console.error('Error updating restaurant tags:', error);
    throw new Error(`Failed to update tags: ${error.message}`);
  }
}

