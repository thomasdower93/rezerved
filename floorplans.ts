import { supabase } from '../lib/supabase';
import { Floorplan, V1LayoutData, V2LayoutData, Table, Area, StructuralElement } from '../lib/types';
import { getTables } from './tables';
import { getAreas } from './areas';

export async function getActiveFloorplan(restaurantId: string): Promise<Floorplan | null> {
  const { data, error } = await supabase
    .from('floorplans')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('[getActiveFloorplan] Error:', error);
    throw new Error('Failed to fetch active floorplan');
  }

  return data?.[0] ?? null;
}

export async function getFloorplanById(id: string): Promise<Floorplan | null> {
  const { data, error } = await supabase
    .from('floorplans')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[getFloorplanById] Error:', error);
    throw new Error('Failed to fetch floorplan');
  }

  return data;
}

export async function getAllFloorplans(restaurantId: string): Promise<Floorplan[]> {
  const { data, error } = await supabase
    .from('floorplans')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[getAllFloorplans] Error:', error);
    throw new Error('Failed to fetch floorplans');
  }

  return data || [];
}

export async function getOrCreateLegacyFloorplan(restaurantId: string): Promise<Floorplan> {
  const existingFloorplan = await getActiveFloorplan(restaurantId);

  if (existingFloorplan) {
    return existingFloorplan;
  }

  const tables = await getTables(restaurantId);
  const areas = await getAreas(restaurantId);

  const { data: structuralElements, error: seError } = await supabase
    .from('structural_elements')
    .select('*')
    .in('area_id', areas.map(a => a.id));

  if (seError) {
    console.error('[getOrCreateLegacyFloorplan] Error fetching structural elements:', seError);
  }

  const v1LayoutData: V1LayoutData = {
    tables: tables || [],
    areas: areas || [],
    structural_elements: structuralElements || [],
  };

  const { data: user } = await supabase.auth.getUser();

  const { data: newFloorplan, error: insertError } = await supabase
    .from('floorplans')
    .insert({
      restaurant_id: restaurantId,
      version: 1,
      engine: 'legacy',
      layout_data: v1LayoutData,
      is_active: true,
      created_by: user?.user?.id || null,
    })
    .select()
    .single();

  if (insertError) {
    console.error('[getOrCreateLegacyFloorplan] Error creating floorplan:', insertError);
    throw new Error('Failed to create legacy floorplan');
  }

  return newFloorplan;
}

export async function saveFloorplan(
  restaurantId: string,
  layoutData: V1LayoutData | V2LayoutData,
  version: 1 | 2,
  engine: 'legacy' | 'v2',
  upgradedFrom?: string
): Promise<Floorplan> {
  const { data: user } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('floorplans')
    .insert({
      restaurant_id: restaurantId,
      version,
      engine,
      layout_data: layoutData,
      upgraded_from: upgradedFrom || null,
      is_active: true,
      created_by: user?.user?.id || null,
    })
    .select()
    .single();

  if (error) {
    console.error('[saveFloorplan] Error:', error);
    throw new Error('Failed to save floorplan');
  }

  return data;
}

export async function rollbackToFloorplan(floorplanId: string): Promise<void> {
  const floorplan = await getFloorplanById(floorplanId);

  if (!floorplan) {
    throw new Error('Floorplan not found');
  }

  const { error } = await supabase
    .from('floorplans')
    .update({ is_active: false })
    .eq('restaurant_id', floorplan.restaurant_id)
    .eq('is_active', true);

  if (error) {
    console.error('[rollbackToFloorplan] Error deactivating current:', error);
    throw new Error('Failed to deactivate current floorplan');
  }

  const { error: activateError } = await supabase
    .from('floorplans')
    .update({ is_active: true })
    .eq('id', floorplanId);

  if (activateError) {
    console.error('[rollbackToFloorplan] Error activating:', activateError);
    throw new Error('Failed to activate floorplan');
  }
}

export async function loadLegacyDataAsV1(restaurantId: string): Promise<V1LayoutData> {
  const tables = await getTables(restaurantId);
  const areas = await getAreas(restaurantId);

  const { data: structuralElements } = await supabase
    .from('structural_elements')
    .select('*')
    .in('area_id', areas.map(a => a.id));

  return {
    tables: tables || [],
    areas: areas || [],
    structural_elements: structuralElements || [],
  };
}
