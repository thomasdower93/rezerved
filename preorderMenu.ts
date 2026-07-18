import { supabase } from '../lib/supabase';

export interface PreorderMenuItem {
  id?: number;
  restaurant_id: string;
  name: string;
  description?: string;
  price: number;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export async function getPreorderMenuItems(restaurantId: string): Promise<PreorderMenuItem[]> {
  const { data, error } = await supabase
    .from('preorder_menu_items')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error('Failed to fetch preorder menu items');
  }

  return data || [];
}

export async function upsertPreorderMenuItems(
  restaurantId: string,
  items: PreorderMenuItem[]
): Promise<void> {
  const itemsToUpsert = items.map(item => ({
    ...item,
    restaurant_id: restaurantId,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('preorder_menu_items')
    .upsert(itemsToUpsert, { onConflict: 'id' });

  if (error) {
    throw new Error('Failed to save preorder menu items');
  }
}

export async function deletePreorderMenuItem(itemId: number): Promise<void> {
  const { error } = await supabase
    .from('preorder_menu_items')
    .delete()
    .eq('id', itemId);

  if (error) {
    throw new Error('Failed to delete preorder menu item');
  }
}
