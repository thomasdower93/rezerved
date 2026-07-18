import { supabase } from '../lib/supabase';
import { Area, StructuralElement } from '../lib/types';

export async function getAreas(restaurantId: string): Promise<Area[]> {
  const { data, error } = await supabase
    .from('areas')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('order', { ascending: true });

  if (error) {
    throw new Error('Failed to fetch areas');
  }

  return data || [];
}

export async function createArea(restaurantId: string, name: string): Promise<Area> {
  const { data: existingAreas, error: countError } = await supabase
    .from('areas')
    .select('order')
    .eq('restaurant_id', restaurantId)
    .order('order', { ascending: false })
    .limit(1);

  if (countError) {
    console.error('Failed to check existing areas:', countError);
    throw new Error(`Failed to check existing areas: ${countError.message}`);
  }

  const nextOrder = existingAreas && existingAreas.length > 0 ? existingAreas[0].order + 1 : 0;

  const { data, error } = await supabase
    .from('areas')
    .insert({
      restaurant_id: restaurantId,
      name,
      order: nextOrder,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create area:', error);
    throw new Error(`Failed to create area: ${error.message}`);
  }

  return data;
}

export async function deleteArea(areaId: string): Promise<void> {
  const { error } = await supabase
    .from('areas')
    .delete()
    .eq('id', areaId);

  if (error) {
    throw new Error('Failed to delete area');
  }
}

export async function getStructuralElements(areaId: string): Promise<StructuralElement[]> {
  const { data, error } = await supabase
    .from('structural_elements')
    .select('*')
    .eq('area_id', areaId);

  if (error) {
    throw new Error('Failed to fetch structural elements');
  }

  return data || [];
}

export async function createStructuralElement(
  areaId: string,
  type: 'wall' | 'door' | 'window' | 'wc',
  properties: any
): Promise<StructuralElement> {
  const { data, error } = await supabase
    .from('structural_elements')
    .insert({
      area_id: areaId,
      type,
      properties,
    })
    .select()
    .single();

  if (error) {
    throw new Error('Failed to create structural element');
  }

  return data;
}

export async function updateStructuralElement(
  elementId: string,
  properties: any
): Promise<void> {
  const { error } = await supabase
    .from('structural_elements')
    .update({ properties })
    .eq('id', elementId);

  if (error) {
    throw new Error('Failed to update structural element');
  }
}

export async function deleteStructuralElement(elementId: string): Promise<void> {
  const { error } = await supabase
    .from('structural_elements')
    .delete()
    .eq('id', elementId);

  if (error) {
    throw new Error('Failed to delete structural element');
  }
}
