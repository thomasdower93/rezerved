import { supabase } from '../lib/supabase';
import { TableCombinationTemplate, Table } from '../lib/types';

// ─── Load ─────────────────────────────────────────────────────────────────────

export async function getCombinationsForRestaurant(
  restaurantId: string
): Promise<TableCombinationTemplate[]> {
  const { data: templates, error } = await supabase
    .from('table_combination_templates')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: true });

  if (error) throw new Error('Failed to fetch combinations');
  if (!templates || templates.length === 0) return [];

  const templateIds = templates.map(t => t.id);
  const { data: rows, error: rowsError } = await supabase
    .from('table_combination_template_tables')
    .select('template_id, table_id')
    .in('template_id', templateIds);

  if (rowsError) throw new Error('Failed to fetch combination tables');

  const { data: allTables, error: tablesError } = await supabase
    .from('tables')
    .select('*')
    .eq('restaurant_id', restaurantId);

  if (tablesError) throw new Error('Failed to fetch tables');

  const tableMap = new Map<string, Table>((allTables || []).map(t => [t.id, t]));
  const tablesByTemplate = new Map<string, Table[]>();
  for (const row of (rows || [])) {
    if (!tablesByTemplate.has(row.template_id)) tablesByTemplate.set(row.template_id, []);
    const table = tableMap.get(row.table_id);
    if (table) tablesByTemplate.get(row.template_id)!.push(table);
  }

  return templates.map(t => ({
    ...t,
    tables: tablesByTemplate.get(t.id) || [],
  }));
}

export async function getActiveCombinationsForAvailability(
  restaurantId: string
): Promise<TableCombinationTemplate[]> {
  const { data: templates, error } = await supabase
    .from('table_combination_templates')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('active', true)
    .eq('allow_online_booking', true);

  if (error || !templates || templates.length === 0) return [];

  const templateIds = templates.map(t => t.id);
  const { data: rows } = await supabase
    .from('table_combination_template_tables')
    .select('template_id, table_id')
    .in('template_id', templateIds);

  const { data: allTables } = await supabase
    .from('tables')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('can_be_joined', true);

  const tableMap = new Map<string, Table>((allTables || []).map(t => [t.id, t]));
  const tablesByTemplate = new Map<string, Table[]>();
  for (const row of (rows || [])) {
    if (!tablesByTemplate.has(row.template_id)) tablesByTemplate.set(row.template_id, []);
    const table = tableMap.get(row.table_id);
    if (table) tablesByTemplate.get(row.template_id)!.push(table);
  }

  return templates
    .map(t => ({ ...t, tables: tablesByTemplate.get(t.id) || [] }))
    .filter(t => t.tables.length >= 2);
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createCombination(
  restaurantId: string,
  name: string,
  combinedCapacity: number,
  tableIds: string[],
  allowOnlineBooking: boolean,
  active: boolean,
  internalNote: string
): Promise<TableCombinationTemplate> {
  const { data: template, error } = await supabase
    .from('table_combination_templates')
    .insert({
      restaurant_id: restaurantId,
      name,
      combined_capacity: combinedCapacity,
      allow_online_booking: allowOnlineBooking,
      active,
      internal_note: internalNote || null,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create combination: ${error.message}`);

  const rows = tableIds.map(tableId => ({
    template_id: template.id,
    restaurant_id: restaurantId,
    table_id: tableId,
  }));

  const { error: rowsError } = await supabase
    .from('table_combination_template_tables')
    .insert(rows);

  if (rowsError) throw new Error(`Failed to add tables to combination: ${rowsError.message}`);

  return template;
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateCombination(
  templateId: string,
  restaurantId: string,
  name: string,
  combinedCapacity: number,
  tableIds: string[],
  allowOnlineBooking: boolean,
  active: boolean,
  internalNote: string
): Promise<void> {
  const { error } = await supabase
    .from('table_combination_templates')
    .update({
      name,
      combined_capacity: combinedCapacity,
      allow_online_booking: allowOnlineBooking,
      active,
      internal_note: internalNote || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', templateId)
    .eq('restaurant_id', restaurantId);

  if (error) throw new Error(`Failed to update combination: ${error.message}`);

  // Replace table associations
  await supabase
    .from('table_combination_template_tables')
    .delete()
    .eq('template_id', templateId);

  const rows = tableIds.map(tableId => ({
    template_id: templateId,
    restaurant_id: restaurantId,
    table_id: tableId,
  }));

  const { error: rowsError } = await supabase
    .from('table_combination_template_tables')
    .insert(rows);

  if (rowsError) throw new Error(`Failed to update combination tables: ${rowsError.message}`);
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteCombination(templateId: string, restaurantId: string): Promise<void> {
  const { error } = await supabase
    .from('table_combination_templates')
    .delete()
    .eq('id', templateId)
    .eq('restaurant_id', restaurantId);

  if (error) throw new Error(`Failed to delete combination: ${error.message}`);
}

// ─── Counts for warning ───────────────────────────────────────────────────────

/** Returns combination names that include this table and are active + online */
export async function getActiveCombinationNamesForTable(tableId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('table_combination_template_tables')
    .select('table_combination_templates(name, active, allow_online_booking)')
    .eq('table_id', tableId);

  if (error || !data) return [];

  return (data as any[])
    .map((r: any) => r.table_combination_templates)
    .filter((t: any) => t && t.active)
    .map((t: any) => t.name as string);
}

// ─── Reservation table assignments ───────────────────────────────────────────

export async function createReservationTableAssignments(
  reservationId: string,
  restaurantId: string,
  primaryTableId: string,
  joinedTableIds: string[]
): Promise<void> {
  const rows = [
    { reservation_id: reservationId, restaurant_id: restaurantId, table_id: primaryTableId, role: 'primary' },
    ...joinedTableIds.map(tid => ({
      reservation_id: reservationId,
      restaurant_id: restaurantId,
      table_id: tid,
      role: 'joined',
    })),
  ];

  const { error } = await supabase
    .from('reservation_table_assignments')
    .upsert(rows, { onConflict: 'reservation_id,table_id' });

  if (error) throw new Error(`Failed to create table assignments: ${error.message}`);
}

export async function getAssignmentsForReservations(
  reservationIds: string[]
): Promise<Record<string, { tableIds: string[]; roles: Record<string, 'primary' | 'joined'> }>> {
  if (reservationIds.length === 0) return {};

  const { data, error } = await supabase
    .from('reservation_table_assignments')
    .select('reservation_id, table_id, role')
    .in('reservation_id', reservationIds);

  if (error || !data) return {};

  const result: Record<string, { tableIds: string[]; roles: Record<string, 'primary' | 'joined'> }> = {};
  for (const row of data) {
    if (!result[row.reservation_id]) result[row.reservation_id] = { tableIds: [], roles: {} };
    result[row.reservation_id].tableIds.push(row.table_id);
    result[row.reservation_id].roles[row.table_id] = row.role as 'primary' | 'joined';
  }
  return result;
}

/** Returns all table IDs blocked by a reservation (primary + joined). Falls back to table_id. */
export function getReservationTableIds(reservation: {
  id: string;
  table_id: string;
  joined_table_ids?: string[];
}): string[] {
  if (reservation.joined_table_ids && reservation.joined_table_ids.length > 0) {
    return reservation.joined_table_ids;
  }
  return [reservation.table_id];
}
