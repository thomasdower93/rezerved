import { supabase } from '../lib/supabase';
import { Restaurant } from '../lib/types';

export interface RestaurantFilters {
  cuisine?: string;
  location?: string;
  city?: string;
  postcode?: string;
  business_type?: string;
}

export async function getRestaurants(filters?: RestaurantFilters): Promise<Restaurant[]> {
  try {
    let query = supabase
      .from('public_restaurants')
      .select('*');

    if (filters?.cuisine) {
      query = query.ilike('cuisine', `%${filters.cuisine}%`);
    }

    if (filters?.location) {
      query = query.or(`location.ilike.%${filters.location}%,city.ilike.%${filters.location}%,postcode.ilike.%${filters.location}%`);
    }

    if (filters?.city) {
      query = query.ilike('city', `%${filters.city}%`);
    }

    if (filters?.postcode) {
      query = query.ilike('postcode', `%${filters.postcode}%`);
    }

    if (filters?.business_type) {
      query = query.ilike('business_type', `%${filters.business_type}%`);
    }

    query = query.order('name');

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Query timeout after 10 seconds')), 10000);
    });

    const [restaurantsResult, countsResult] = await Promise.all([
      Promise.race([query, timeoutPromise]) as Promise<{ data: any[] | null; error: any }>,
      supabase.rpc('get_recent_booking_counts'),
    ]);

    if (restaurantsResult.error) {
      throw new Error(`Failed to fetch restaurants: ${restaurantsResult.error.message}`);
    }

    // Build a lookup map: restaurant_id → live recent booking count
    const recentCountMap = new Map<string, number>();
    if (!countsResult.error && countsResult.data) {
      for (const row of countsResult.data as { restaurant_id: string; recent_count: number }[]) {
        recentCountMap.set(row.restaurant_id, Number(row.recent_count));
      }
    }

    return (restaurantsResult.data || []).map(restaurant => ({
      ...restaurant,
      table_map_enabled: restaurant.table_map_enabled ?? true,
      preorders_enabled: restaurant.preorders_enabled ?? true,
      preorders_plan_enabled: restaurant.preorders_plan_enabled ?? true,
      minimum_booking_notice_minutes: restaurant.minimum_booking_notice_minutes ?? 120,
      max_online_party_size: restaurant.max_online_party_size ?? 8,
      cover_image_url: restaurant.cover_image_url ?? null,
      gallery_images: restaurant.gallery_images ?? [],
      // Live count from reservations table overwrites the stale stored column
      recent_bookings: recentCountMap.get(restaurant.id) ?? 0,
    }));
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error('Unknown error fetching restaurants');
  }
}

export async function getEnabledRestaurants(): Promise<Restaurant[]> {
  const { data, error } = await supabase
    .from('public_restaurants')
    .select('*')
    .eq('table_map_enabled', true)
    .order('name');

  if (error) {
    throw new Error('Failed to fetch restaurants');
  }

  return (data || []).map(restaurant => ({
    ...restaurant,
    table_map_enabled: restaurant.table_map_enabled ?? true,
    preorders_enabled: restaurant.preorders_enabled ?? true,
    preorders_plan_enabled: restaurant.preorders_plan_enabled ?? true,
    minimum_booking_notice_minutes: restaurant.minimum_booking_notice_minutes ?? 120,
    max_online_party_size: restaurant.max_online_party_size ?? 8,
  }));
}

export async function getRestaurant(id: string): Promise<Restaurant | null> {
  const { data, error } = await supabase
    .from('public_restaurants')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error('Failed to fetch restaurant');
  }

  if (!data) return null;

  return {
    ...data,
    table_map_enabled: data.table_map_enabled ?? true,
    preorders_enabled: data.preorders_enabled ?? true,
    preorders_plan_enabled: data.preorders_plan_enabled ?? true,
    minimum_booking_notice_minutes: data.minimum_booking_notice_minutes ?? 120,
    max_online_party_size: data.max_online_party_size ?? 8,
  };
}

export async function getRestaurantBySlug(slug: string): Promise<Restaurant | null> {
  const { data, error } = await supabase
    .from('public_restaurants')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    throw new Error('Failed to fetch restaurant');
  }

  if (!data) return null;

  return {
    ...data,
    table_map_enabled: data.table_map_enabled ?? true,
    preorders_enabled: data.preorders_enabled ?? true,
    preorders_plan_enabled: data.preorders_plan_enabled ?? true,
    minimum_booking_notice_minutes: data.minimum_booking_notice_minutes ?? 120,
    max_online_party_size: data.max_online_party_size ?? 8,
  };
}

export async function updateRestaurantTableMapEnabled(
  restaurantId: string,
  enabled: boolean
): Promise<void> {
  const { error } = await supabase
    .from('restaurants')
    .update({ table_map_enabled: enabled })
    .eq('id', restaurantId);

  if (error) {
    throw new Error('Failed to update restaurant table map status');
  }
}

export async function updateRestaurantPreordersEnabled(
  restaurantId: string,
  enabled: boolean
): Promise<void> {
  const { error } = await supabase
    .from('restaurants')
    .update({ preorders_enabled: enabled })
    .eq('id', restaurantId);

  if (error) {
    throw new Error('Failed to update restaurant preorders status');
  }
}

export async function updateRestaurantPreordersPlanEnabled(
  restaurantId: string,
  enabled: boolean
): Promise<void> {
  const updates: { preorders_plan_enabled: boolean; preorders_enabled?: boolean } = {
    preorders_plan_enabled: enabled,
  };

  if (!enabled) {
    updates.preorders_enabled = false;
  }

  const { error } = await supabase
    .from('restaurants')
    .update(updates)
    .eq('id', restaurantId);

  if (error) {
    throw new Error('Failed to update restaurant preorders plan status');
  }
}

export async function updateRestaurantDessertsEnabled(
  restaurantId: string,
  enabled: boolean
): Promise<void> {
  const { error } = await supabase
    .from('restaurants')
    .update({ desserts_enabled: enabled })
    .eq('id', restaurantId);

  if (error) {
    throw new Error('Failed to update restaurant desserts setting');
  }
}

export async function getRecentBookingCount(restaurantId: string): Promise<number> {
  const { data, error } = await supabase.rpc('get_recent_booking_counts');
  if (error || !data) return 0;
  const row = (data as { restaurant_id: string; recent_count: number }[])
    .find(r => r.restaurant_id === restaurantId);
  return row ? Number(row.recent_count) : 0;
}

export async function updateRestaurantGooglePlaceId(
  restaurantId: string,
  googlePlaceId: string | null
): Promise<void> {
  const { error } = await supabase
    .from('restaurants')
    .update({ google_place_id: googlePlaceId || null })
    .eq('id', restaurantId);

  if (error) {
    throw new Error('Failed to update Google Place ID');
  }
}

export async function updateRestaurantBookingLimits(
  restaurantId: string,
  minimumBookingNoticeMinutes: number,
  maxOnlinePartySize: number | null
): Promise<void> {
  const { error } = await supabase
    .from('restaurants')
    .update({
      minimum_booking_notice_minutes: minimumBookingNoticeMinutes,
      max_online_party_size: maxOnlinePartySize,
    })
    .eq('id', restaurantId);

  if (error) {
    throw new Error('Failed to update restaurant booking limits');
  }
}
