import { supabase } from '../lib/supabase';
import { Table, V2LayoutData, V2LayoutObject } from '../lib/types';

export async function getTables(restaurantId: string): Promise<Table[]> {
  const { data, error } = await supabase
    .from('tables')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('name');

  if (error) {
    throw new Error('Failed to fetch tables');
  }

  return (data || []).map(table => ({
    ...table,
    scale_x: table.scale_x ?? 1,
    scale_y: table.scale_y ?? 1,
    rotation: table.rotation ?? 0,
    can_be_joined: table.can_be_joined ?? false,
  }));
}

export async function getTablesByArea(areaId: string): Promise<Table[]> {
  const { data, error } = await supabase
    .from('tables')
    .select('*')
    .eq('area_id', areaId)
    .order('name');

  if (error) {
    throw new Error('Failed to fetch tables');
  }

  return (data || []).map(table => ({
    ...table,
    scale_x: table.scale_x ?? 1,
    scale_y: table.scale_y ?? 1,
    rotation: table.rotation ?? 0,
    can_be_joined: table.can_be_joined ?? false,
  }));
}

export async function updateTableCanBeJoined(tableId: string, canBeJoined: boolean): Promise<void> {
  const { error } = await supabase
    .from('tables')
    .update({ can_be_joined: canBeJoined })
    .eq('id', tableId);
  if (error) throw new Error('Failed to update table');
}

export async function createTable(
  restaurantId: string,
  areaId: string,
  name: string,
  capacity: number,
  shape: 'circle' | 'square' | 'rectangle' = 'circle',
  posX: number = 50,
  posY: number = 50
): Promise<Table> {
  const { data, error } = await supabase
    .from('tables')
    .insert({
      restaurant_id: restaurantId,
      area_id: areaId,
      name,
      capacity,
      pos_x: posX,
      pos_y: posY,
      shape,
      default_pos_x: posX,
      default_pos_y: posY,
      scale_x: 1,
      scale_y: 1,
      rotation: 0,
    })
    .select()
    .single();

  if (error) {
    throw new Error('Failed to create table');
  }

  return {
    ...data,
    scale_x: data.scale_x ?? 1,
    scale_y: data.scale_y ?? 1,
    rotation: data.rotation ?? 0,
  };
}

export async function updateTablePosition(
  tableId: string,
  posX: number,
  posY: number
): Promise<void> {
  const { error } = await supabase
    .from('tables')
    .update({
      pos_x: Math.max(0, Math.min(100, posX)),
      pos_y: Math.max(0, Math.min(100, posY)),
    })
    .eq('id', tableId);

  if (error) {
    throw new Error('Failed to update table position');
  }
}

export async function deleteTable(tableId: string): Promise<void> {
  const { error } = await supabase
    .from('tables')
    .delete()
    .eq('id', tableId);

  if (error) {
    console.error('deleteTable error', error);
    throw new Error('Failed to delete table');
  }
}

export async function batchUpdateTablePositions(
  updates: Array<{ id: string; pos_x: number; pos_y: number }>
): Promise<void> {
  const promises = updates.map(({ id, pos_x, pos_y }) =>
    supabase
      .from('tables')
      .update({
        pos_x: Math.max(0, Math.min(100, pos_x)),
        pos_y: Math.max(0, Math.min(100, pos_y)),
      })
      .eq('id', id)
  );

  const results = await Promise.all(promises);
  const errors = results.filter(r => r.error);

  if (errors.length > 0) {
    throw new Error('Failed to save some table positions');
  }
}

export async function saveTableLayout(
  restaurantId: string,
  updates: { id: string; pos_x: number; pos_y: number; shape?: string; scale_x?: number; scale_y?: number; rotation?: number }[]
): Promise<void> {
  if (!updates.length) return;

  for (const u of updates) {
    const { error } = await supabase
      .from('tables')
      .update({
        pos_x: u.pos_x,
        pos_y: u.pos_y,
        ...(u.shape ? { shape: u.shape } : {}),
        ...(u.scale_x !== undefined ? { scale_x: u.scale_x } : {}),
        ...(u.scale_y !== undefined ? { scale_y: u.scale_y } : {}),
        ...(u.rotation !== undefined ? { rotation: u.rotation } : {}),
      })
      .eq('id', u.id)
      .eq('restaurant_id', restaurantId);

    if (error) {
      console.error('saveTableLayout error for table', u.id, error);
      throw new Error('Failed to save table layout');
    }
  }
}

export async function syncV2LayoutToDatabase(
  restaurantId: string,
  layoutData: V2LayoutData
): Promise<V2LayoutData> {
  console.log('syncV2LayoutToDatabase: Starting sync for restaurant', restaurantId);

  const tableObjects = layoutData.objects.filter(obj => obj.type === 'table' || obj.type === 'booth');
  console.log('syncV2LayoutToDatabase: Found', tableObjects.length, 'table/booth objects');

  const existingTables = await getTables(restaurantId);
  console.log('syncV2LayoutToDatabase: Found', existingTables.length, 'existing tables in database');

  const { data: validAreas } = await supabase
    .from('areas')
    .select('id')
    .eq('restaurant_id', restaurantId)
    .order('order', { ascending: true });

  if (!validAreas || validAreas.length === 0) {
    throw new Error('No areas found for restaurant. Please create at least one area first.');
  }

  const validAreaIds = new Set(validAreas.map(a => a.id));
  const defaultAreaId = validAreas[0].id;
  console.log('syncV2LayoutToDatabase: Found', validAreaIds.size, 'valid areas, default area:', defaultAreaId);

  const existingTableIds = new Set(existingTables.map(t => t.id));
  const layoutTableIds = new Set<string>();

  const updatedObjects: V2LayoutObject[] = [];

  for (const obj of tableObjects) {
    const tableId = obj.properties?.tableId;
    console.log('syncV2LayoutToDatabase: Processing table object', obj.id, 'with tableId', tableId);

    if (tableId && !existingTableIds.has(tableId)) {
      console.log('syncV2LayoutToDatabase: Skipping orphaned table object', obj.id, 'referencing deleted table', tableId);
      continue;
    }

    if (tableId && existingTableIds.has(tableId)) {
      console.log('syncV2LayoutToDatabase: Updating existing table', tableId);
      const shape = obj.type === 'booth' ? 'booth' : (obj.shape || 'circle');
      const baseSize = shape === 'circle' ? 60 : 80;
      const scale_x = obj.width / baseSize;
      const scale_y = obj.height / baseSize;

      const areaId = obj.areaId && validAreaIds.has(obj.areaId) ? obj.areaId : defaultAreaId;

      const { error } = await supabase
        .from('tables')
        .update({
          name: obj.name || 'Unnamed Table',
          capacity: obj.capacity || 4,
          shape: shape,
          scale_x,
          scale_y,
          rotation: obj.rotation || 0,
          area_id: areaId,
          can_be_joined: obj.properties?.joinable === true,
        })
        .eq('id', tableId)
        .eq('restaurant_id', restaurantId);

      if (error) {
        console.error('Failed to update table:', tableId, error);
        throw new Error(`Failed to update table ${obj.name}: ${error.message}`);
      }

      layoutTableIds.add(tableId);
      updatedObjects.push({
        ...obj,
        properties: {
          ...obj.properties,
          tableId: tableId,
        },
      });
    } else {
      console.log('syncV2LayoutToDatabase: Creating new table for object', obj.id);
      const shape = obj.type === 'booth' ? 'booth' : (obj.shape || 'circle');
      const baseSize = shape === 'circle' ? 60 : 80;
      const scale_x = obj.width / baseSize;
      const scale_y = obj.height / baseSize;

      const areaId = obj.areaId && validAreaIds.has(obj.areaId) ? obj.areaId : defaultAreaId;

      const { data: newTable, error } = await supabase
        .from('tables')
        .insert({
          restaurant_id: restaurantId,
          name: obj.name || 'Unnamed Table',
          capacity: obj.capacity || 4,
          shape: shape,
          pos_x: 50,
          pos_y: 50,
          default_pos_x: 50,
          default_pos_y: 50,
          scale_x,
          scale_y,
          rotation: obj.rotation || 0,
          area_id: areaId,
          can_be_joined: obj.properties?.joinable === true,
        })
        .select()
        .single();

      if (error) {
        console.error('Failed to create table:', obj.name, error);
        throw new Error(`Failed to create table ${obj.name}: ${error.message}`);
      }

      console.log('syncV2LayoutToDatabase: Created new table with id', newTable.id);
      layoutTableIds.add(newTable.id);
      updatedObjects.push({
        ...obj,
        properties: {
          ...obj.properties,
          tableId: newTable.id,
        },
      });
    }
  }

  const tablesToDelete = existingTables
    .filter(t => !layoutTableIds.has(t.id))
    .map(t => t.id);

  console.log('syncV2LayoutToDatabase: Tables to delete:', tablesToDelete);

  if (tablesToDelete.length > 0) {
    const { error } = await supabase
      .from('tables')
      .delete()
      .in('id', tablesToDelete);

    if (error) {
      console.error('Failed to delete tables:', error);
      throw new Error(`Failed to delete removed tables: ${error.message}`);
    }
  }

  const nonTableObjects = layoutData.objects
    .filter(obj => obj.type !== 'table' && obj.type !== 'booth')
    .filter(obj => {
      if (obj.areaId && !validAreaIds.has(obj.areaId)) {
        console.log('syncV2LayoutToDatabase: Skipping object', obj.id, 'referencing deleted area', obj.areaId);
        return false;
      }
      return true;
    });

  console.log('syncV2LayoutToDatabase: Sync complete');

  return {
    ...layoutData,
    objects: [...updatedObjects, ...nonTableObjects],
  };
}
