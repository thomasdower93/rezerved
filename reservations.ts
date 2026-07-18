import { supabase } from '../lib/supabase';
import { Reservation, TableAvailability, Table, Restaurant, BookingFormData, PreOrderItem, AlternativeTimeOption, JoinedCombinationAvailability } from '../lib/types';
import { SLOT_MINUTES, DEFAULT_DURATION_MINUTES } from '../lib/constants';
import { getTables } from './tables';
import { getActiveCombinationsForAvailability, getAssignmentsForReservations, createReservationTableAssignments } from './combinations';
import { checkBookingRateLimit } from './rateLimit';
import { logAppError } from './errorLogger';
import { ensureConversationExists } from './chat';
import { syncBookingCreated, syncBookingCancelled, syncBookingUpdated } from './epos';
import { notifyBookingRequestReceived } from './acceptance';
import {
  parseDateTime,
  addMinutes,
  formatDateTime,
  generateManageToken,
  getTokenExpiry,
  checkOverlap,
  getDayOfWeek,
  isValidTimeSlot,
  formatTime,
  matchesPartySize,
  isInPast,
  checkBookingLimits,
} from '../lib/utils';

const BLOCKING_RESERVATION_STATUSES = ['booked', 'pending_acceptance', 'pending_payment'] as const;

export async function getBatchAvailabilityCounts(
  restaurantIds: string[],
  date: string,
  time: string,
  partySize: number,
  currentSessionKey?: string
): Promise<Record<string, number>> {
  if (restaurantIds.length === 0) {
    return {};
  }

  try {
    const startOfDay = `${date}T00:00:00Z`;
    const endOfDay = `${date}T23:59:59Z`;
    const now = new Date().toISOString();

    const [restaurantsResult, tablesResult, reservationsResult, holdsResult, combinationsResult, comboTablesResult] = await Promise.all([
      supabase.from('restaurants').select('id, opening_hours').in('id', restaurantIds),
      supabase.from('tables').select('id, restaurant_id, capacity, area_id, shape').in('restaurant_id', restaurantIds),
      supabase.from('reservations').select('restaurant_id, table_id, start_time, end_time').in('restaurant_id', restaurantIds).in('status', [...BLOCKING_RESERVATION_STATUSES]).lt('start_time', endOfDay).gt('end_time', startOfDay),
      supabase.from('table_holds').select('restaurant_id, table_id, start_time, end_time, session_key').in('restaurant_id', restaurantIds).lt('start_time', endOfDay).gt('end_time', startOfDay).gt('expires_at', now),
      supabase.from('table_combination_templates').select('id, restaurant_id, combined_capacity').in('restaurant_id', restaurantIds).eq('active', true).eq('allow_online_booking', true),
      supabase.from('table_combination_template_tables').select('template_id, table_id'),
    ]);

    if (restaurantsResult.error || tablesResult.error || reservationsResult.error || holdsResult.error) {
      console.error('[getBatchAvailabilityCounts] Query errors:', {
        restaurants: restaurantsResult.error,
        tables: tablesResult.error,
        reservations: reservationsResult.error,
        holds: holdsResult.error,
      });
      return {};
    }

    const restaurants = restaurantsResult.data || [];
    const tables = tablesResult.data || [];
    const reservations = reservationsResult.data || [];
    const holds = holdsResult.data || [];
    const combinations = combinationsResult.data || [];
    const comboTableRows = comboTablesResult.data || [];

    const requestedStart = parseDateTime(date, time);
    const requestedEnd = addMinutes(requestedStart, SLOT_MINUTES);

    const restaurantMap = Object.fromEntries(restaurants.map(r => [r.id, r]));
    const tablesByRestaurant = tables.reduce((acc, table) => {
      if (!acc[table.restaurant_id]) acc[table.restaurant_id] = [];
      acc[table.restaurant_id].push(table);
      return acc;
    }, {} as Record<string, typeof tables>);

    const reservationsByRestaurant = reservations.reduce((acc, res) => {
      if (!acc[res.restaurant_id]) acc[res.restaurant_id] = [];
      acc[res.restaurant_id].push(res);
      return acc;
    }, {} as Record<string, typeof reservations>);

    const holdsByRestaurant = holds.reduce((acc, hold) => {
      if (!acc[hold.restaurant_id]) acc[hold.restaurant_id] = [];
      acc[hold.restaurant_id].push(hold);
      return acc;
    }, {} as Record<string, typeof holds>);

    // Build a map of template_id → table_ids for combination lookup
    const tableIdsByTemplate = comboTableRows.reduce((acc, row) => {
      if (!acc[row.template_id]) acc[row.template_id] = [];
      acc[row.template_id].push(row.table_id);
      return acc;
    }, {} as Record<string, string[]>);

    const combinationsByRestaurant = combinations.reduce((acc, combo) => {
      if (!acc[combo.restaurant_id]) acc[combo.restaurant_id] = [];
      acc[combo.restaurant_id].push({
        ...combo,
        tableIds: tableIdsByTemplate[combo.id] || [],
      });
      return acc;
    }, {} as Record<string, Array<typeof combinations[number] & { tableIds: string[] }>>);

    const result: Record<string, number> = {};

    for (const restaurantId of restaurantIds) {
      const restaurant = restaurantMap[restaurantId];
      if (!restaurant) {
        result[restaurantId] = 0;
        continue;
      }

      const dayOfWeek = getDayOfWeek(requestedStart);
      const dayHours = restaurant.opening_hours[dayOfWeek];

      if (!dayHours || dayHours.closed || !isValidTimeSlot(requestedStart, dayHours.open, dayHours.close, dayHours.last_booking)) {
        result[restaurantId] = 0;
        continue;
      }

      const restaurantTables = tablesByRestaurant[restaurantId] || [];
      const restaurantReservations = reservationsByRestaurant[restaurantId] || [];
      const restaurantHolds = holdsByRestaurant[restaurantId] || [];

      // Helper: is this table timewise-free (no conflicting reservation or active hold)?
      const isTableTimewiseFree = (tableId: string): boolean => {
        const tableReservations = restaurantReservations.filter(r => r.table_id === tableId);
        const tableHolds = restaurantHolds.filter(h => h.table_id === tableId && (!currentSessionKey || h.session_key !== currentSessionKey));
        const hasReservationOverlap = tableReservations.some(r => checkOverlap(requestedStart, requestedEnd, new Date(r.start_time), new Date(r.end_time)));
        const hasHoldOverlap = tableHolds.some(h => checkOverlap(requestedStart, requestedEnd, new Date(h.start_time), new Date(h.end_time)));
        return !hasReservationOverlap && !hasHoldOverlap;
      };

      let availableCount = 0;

      // Count individual tables that directly match the party size
      for (const table of restaurantTables) {
        if (!matchesPartySize(table.capacity, partySize)) continue;
        if (isTableTimewiseFree(table.id)) availableCount++;
      }

      // Count available combinations: each available combo counts as its number of tables
      // (a 2-table combo = 2, a 3-table combo = 3)
      const restaurantCombos = combinationsByRestaurant[restaurantId] || [];
      for (const combo of restaurantCombos) {
        if ((combo.combined_capacity ?? 0) < partySize) continue;
        const allFree = combo.tableIds.length >= 2 && combo.tableIds.every(id => isTableTimewiseFree(id));
        if (allFree) availableCount += combo.tableIds.length;
      }

      result[restaurantId] = availableCount;
    }

    return result;
  } catch (error) {
    console.error('[getBatchAvailabilityCounts] Exception:', error);
    return {};
  }
}

export interface RestaurantAvailabilityInfo {
  count: number;
  nextAvailableTime?: string;
  nextAvailableIsJoined?: boolean;
}

/**
 * Like getBatchAvailabilityCounts but also returns the earliest alternative time
 * when no tables/combos are immediately available at the requested time.
 */
export async function getBatchAvailabilityInfo(
  restaurantIds: string[],
  date: string,
  time: string,
  partySize: number,
  currentSessionKey?: string
): Promise<Record<string, RestaurantAvailabilityInfo>> {
  if (restaurantIds.length === 0) return {};

  try {
    const startOfDay = `${date}T00:00:00Z`;
    const endOfDay = `${date}T23:59:59Z`;
    const now = new Date().toISOString();

    const [restaurantsResult, tablesResult, reservationsResult, holdsResult, combinationsResult, comboTablesResult] = await Promise.all([
      supabase.from('restaurants').select('id, opening_hours').in('id', restaurantIds),
      supabase.from('tables').select('id, restaurant_id, capacity').in('restaurant_id', restaurantIds),
      supabase.from('reservations').select('restaurant_id, table_id, start_time, end_time').in('restaurant_id', restaurantIds).in('status', [...BLOCKING_RESERVATION_STATUSES]).lt('start_time', endOfDay).gt('end_time', startOfDay),
      supabase.from('table_holds').select('restaurant_id, table_id, start_time, end_time, session_key').in('restaurant_id', restaurantIds).lt('start_time', endOfDay).gt('end_time', startOfDay).gt('expires_at', now),
      supabase.from('table_combination_templates').select('id, restaurant_id, combined_capacity').in('restaurant_id', restaurantIds).eq('active', true).eq('allow_online_booking', true),
      supabase.from('table_combination_template_tables').select('template_id, table_id'),
    ]);

    if (restaurantsResult.error || tablesResult.error) return {};

    const restaurants = restaurantsResult.data || [];
    const tables = tablesResult.data || [];
    const reservations = reservationsResult.data || [];
    const holds = holdsResult.data || [];
    const combinations = combinationsResult.data || [];
    const comboTableRows = comboTablesResult.data || [];

    const requestedStart = parseDateTime(date, time);
    const requestedEnd = addMinutes(requestedStart, SLOT_MINUTES);

    const restaurantMap = Object.fromEntries(restaurants.map(r => [r.id, r]));
    const tablesByRestaurant = tables.reduce((acc, t) => {
      if (!acc[t.restaurant_id]) acc[t.restaurant_id] = [];
      acc[t.restaurant_id].push(t);
      return acc;
    }, {} as Record<string, typeof tables>);

    const reservationsByRestaurant = reservations.reduce((acc, r) => {
      if (!acc[r.restaurant_id]) acc[r.restaurant_id] = [];
      acc[r.restaurant_id].push(r);
      return acc;
    }, {} as Record<string, typeof reservations>);

    const holdsByRestaurant = holds.reduce((acc, h) => {
      if (!acc[h.restaurant_id]) acc[h.restaurant_id] = [];
      acc[h.restaurant_id].push(h);
      return acc;
    }, {} as Record<string, typeof holds>);

    const tableIdsByTemplate = comboTableRows.reduce((acc, row) => {
      if (!acc[row.template_id]) acc[row.template_id] = [];
      acc[row.template_id].push(row.table_id);
      return acc;
    }, {} as Record<string, string[]>);

    const combinationsByRestaurant = combinations.reduce((acc, combo) => {
      if (!acc[combo.restaurant_id]) acc[combo.restaurant_id] = [];
      acc[combo.restaurant_id].push({ ...combo, tableIds: tableIdsByTemplate[combo.id] || [] });
      return acc;
    }, {} as Record<string, Array<typeof combinations[number] & { tableIds: string[] }>>);

    const result: Record<string, RestaurantAvailabilityInfo> = {};

    for (const restaurantId of restaurantIds) {
      const restaurant = restaurantMap[restaurantId];
      if (!restaurant) { result[restaurantId] = { count: 0 }; continue; }

      const dayOfWeek = getDayOfWeek(requestedStart);
      const dayHours = restaurant.opening_hours[dayOfWeek];
      if (!dayHours || dayHours.closed || !isValidTimeSlot(requestedStart, dayHours.open, dayHours.close, dayHours.last_booking)) {
        result[restaurantId] = { count: 0 };
        continue;
      }

      const restaurantTables = tablesByRestaurant[restaurantId] || [];
      const restaurantReservations = reservationsByRestaurant[restaurantId] || [];
      const restaurantHolds = holdsByRestaurant[restaurantId] || [];
      const restaurantCombos = combinationsByRestaurant[restaurantId] || [];

      const isTableFreeAt = (tableId: string, start: Date, end: Date): boolean => {
        const hasResOverlap = restaurantReservations.some(r => r.table_id === tableId && checkOverlap(start, end, new Date(r.start_time), new Date(r.end_time)));
        const hasHoldOverlap = restaurantHolds.some(h => h.table_id === tableId && (!currentSessionKey || h.session_key !== currentSessionKey) && checkOverlap(start, end, new Date(h.start_time), new Date(h.end_time)));
        return !hasResOverlap && !hasHoldOverlap;
      };

      // Count exact-time availability
      let availableCount = 0;
      for (const t of restaurantTables) {
        if (!matchesPartySize(t.capacity, partySize)) continue;
        if (isTableFreeAt(t.id, requestedStart, requestedEnd)) availableCount++;
      }
      for (const combo of restaurantCombos) {
        if ((combo.combined_capacity ?? 0) < partySize) continue;
        const allFree = combo.tableIds.length >= 2 && combo.tableIds.every(id => isTableFreeAt(id, requestedStart, requestedEnd));
        if (allFree) availableCount += 1; // each combo counts as one bookable option
      }

      console.log('[RestaurantCardAvailability] exact availability', { restaurantId, availableCount });

      if (availableCount > 0) {
        result[restaurantId] = { count: availableCount };
        continue;
      }

      // No exact availability — scan for next available time within operating hours
      // Build all blocking interval endpoints as candidates
      const closeTime = parseDateTime(date, dayHours.last_booking || dayHours.close);
      const candidateTimes = new Set<number>();

      // Add 15-min slots from requested time up to close
      let scanTime = new Date(requestedStart.getTime() + SLOT_MINUTES * 60000);
      while (scanTime <= closeTime) {
        candidateTimes.add(scanTime.getTime());
        scanTime = new Date(scanTime.getTime() + SLOT_MINUTES * 60000);
      }

      // Also add times when blocking intervals end (reservations/holds release)
      for (const r of restaurantReservations) {
        const endMs = new Date(r.end_time).getTime();
        if (endMs > requestedStart.getTime() && endMs <= closeTime.getTime()) candidateTimes.add(endMs);
      }
      for (const h of restaurantHolds) {
        const endMs = new Date(h.end_time).getTime();
        if (endMs > requestedStart.getTime() && endMs <= closeTime.getTime()) candidateTimes.add(endMs);
      }

      const sortedCandidates = Array.from(candidateTimes).sort((a, b) => a - b);

      let nextAvailableTime: string | undefined;
      let nextAvailableIsJoined = false;

      for (const candidateMs of sortedCandidates) {
        const candStart = new Date(candidateMs);
        const candEnd = addMinutes(candStart, SLOT_MINUTES);
        if (!isValidTimeSlot(candStart, dayHours.open, dayHours.close, dayHours.last_booking)) continue;

        // Check single tables
        for (const t of restaurantTables) {
          if (!matchesPartySize(t.capacity, partySize)) continue;
          if (isTableFreeAt(t.id, candStart, candEnd)) {
            nextAvailableTime = `${String(candStart.getUTCHours()).padStart(2, '0')}:${String(candStart.getUTCMinutes()).padStart(2, '0')}`;
            break;
          }
        }
        if (nextAvailableTime) break;

        // Check combos
        for (const combo of restaurantCombos) {
          if ((combo.combined_capacity ?? 0) < partySize) continue;
          if (combo.tableIds.length < 2) continue;
          if (combo.tableIds.every(id => isTableFreeAt(id, candStart, candEnd))) {
            nextAvailableTime = `${String(candStart.getUTCHours()).padStart(2, '0')}:${String(candStart.getUTCMinutes()).padStart(2, '0')}`;
            nextAvailableIsJoined = true;
            break;
          }
        }
        if (nextAvailableTime) break;
      }

      console.log('[RestaurantCardAvailability] next available', { restaurantId, nextAvailableTime, nextAvailableIsJoined });

      result[restaurantId] = { count: 0, nextAvailableTime, nextAvailableIsJoined };
    }

    return result;
  } catch (error) {
    console.error('[getBatchAvailabilityInfo] Exception:', error);
    return {};
  }
}

export async function getAvailability(
  restaurantId: string,
  date: string,
  time: string,
  partySize: number,
  currentSessionKey?: string
): Promise<TableAvailability[]> {
  console.log('[getAvailability] Called with:', {
    restaurantId,
    date,
    time,
    partySize,
    currentSessionKey
  });

  if (isInPast(date, time, 15)) {
    console.error('[getAvailability] Requested date/time is in the past:', { date, time });
    throw new Error('Reservations must be in the future');
  }

  const restaurant = await getRestaurantData(restaurantId);
  if (!restaurant) {
    throw new Error('Restaurant not found');
  }

  // Fetch the restaurant's configured default duration for new bookings.
  // This is used to size the requested slot so we never offer a time that would
  // cut into an existing reservation once the customer confirms.
  const { data: bookingSettingsForAvail } = await supabase
    .from('restaurant_booking_settings')
    .select('default_reservation_duration_minutes')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  const requestedDurationMinutes =
    bookingSettingsForAvail?.default_reservation_duration_minutes ?? DEFAULT_DURATION_MINUTES;

  const tables = await getTables(restaurantId);
  const requestedStart = parseDateTime(date, time);
  const requestedEnd = addMinutes(requestedStart, requestedDurationMinutes);

  console.log('[getAvailability] Parsed times:', {
    requestedStart: requestedStart.toISOString(),
    requestedEnd: requestedEnd.toISOString()
  });

  const dayOfWeek = getDayOfWeek(requestedStart);
  const dayHours = restaurant.opening_hours[dayOfWeek];

  if (!dayHours || dayHours.closed) {
    return tables.map(table => ({
      ...table,
      status: 'red' as const,
      reason: 'Restaurant is closed on this day',
    }));
  }

  console.log('[getAvailability] About to fetch reservations...');
  const existingReservations = await getReservationsForDate(restaurantId, date);
  console.log('[getAvailability] About to fetch holds...');
  const activeHolds = await getActiveHoldsForDate(restaurantId, date);

  console.log('[getAvailability] Data fetched:', {
    reservationsCount: existingReservations.length,
    holdsCount: activeHolds.length,
    currentSessionKey,
    reservationDetails: existingReservations.map(r => ({
      table_id: r.table_id,
      start: r.start_time,
      end: r.end_time,
      status: r.status
    }))
  });

  // Fetch active online combinations and determine their availability
  const activeCombinations = await getActiveCombinationsForAvailability(restaurantId);

  console.log('[CustomerAvailabilityJoinedData]', {
    restaurantId,
    date,
    time,
    partySize,
    templatesLoaded: activeCombinations.length,
    validJoinedCombinations: activeCombinations.map(c => ({
      name: c.name,
      combined_capacity: c.combined_capacity,
      tableCount: (c.tables || []).length,
    })),
  });

  const tableResults = tables.map(table => {
    if (!isValidTimeSlot(requestedStart, dayHours.open, dayHours.close, dayHours.last_booking)) {
      const latestTime = addMinutes(
        parseDateTime(date, dayHours.last_booking || dayHours.close),
        dayHours.last_booking ? 0 : -SLOT_MINUTES
      );
      return {
        ...table,
        status: 'red' as const,
        reason: `Last bookable time is ${formatTime(latestTime)}`,
        detailed_reason: 'past_time' as const,
      };
    }

    // A table is blocked if it appears in any booked reservation's assigned table IDs,
    // or by a non-expired pending_payment reservation (treated as a temporary hold)
    const tableReservations = existingReservations.filter(r => {
      const isBooked = BLOCKING_RESERVATION_STATUSES.includes(r.status as typeof BLOCKING_RESERVATION_STATUSES[number]);
      const isPendingPayment = r.status === 'pending_payment' &&
        r.pending_expires_at != null &&
        new Date(r.pending_expires_at) > new Date();
      if (!isBooked && !isPendingPayment) return false;
      const ids = r.joined_table_ids && r.joined_table_ids.length > 0 ? r.joined_table_ids : [r.table_id];
      return ids.includes(table.id);
    });

    if (tableReservations.length > 0) {
      console.log('[getAvailability] Table has reservations:', {
        tableId: table.id,
        tableName: table.name,
        reservationCount: tableReservations.length,
        reservations: tableReservations.map(r => ({
          start: r.start_time,
          end: r.end_time
        }))
      });
    }

    const tableHolds = activeHolds.filter(h => h.table_id === table.id);

    const tableHoldsExcludingCurrent = tableHolds.filter(hold => {
      if (currentSessionKey && hold.session_key === currentSessionKey) {
        console.log('[getAvailability] Excluding own hold:', { tableId: table.id, sessionKey: currentSessionKey });
        return false;
      }
      return true;
    });

    if (tableHolds.length > 0) {
      console.log('[getAvailability] Table holds detected:', {
        tableId: table.id,
        tableName: table.name,
        totalHolds: tableHolds.length,
        excludedHolds: tableHolds.length - tableHoldsExcludingCurrent.length,
        currentSessionKey,
        holdSessionKeys: tableHolds.map(h => h.session_key),
      });
    }

    const hasReservationOverlap = tableReservations.some(reservation => {
      const resStart = new Date(reservation.start_time);
      const resEnd = new Date(reservation.end_time);
      const overlaps = checkOverlap(requestedStart, requestedEnd, resStart, resEnd);

      if (import.meta.env.DEV && overlaps) {
        console.log('[getAvailability] Reservation overlap detected:', {
          tableId: table.id,
          tableName: table.name,
          requestedStart: requestedStart.toISOString(),
          requestedEnd: requestedEnd.toISOString(),
          reservationStart: resStart.toISOString(),
          reservationEnd: resEnd.toISOString(),
          overlap: overlaps
        });
      }

      return overlaps;
    });

    const hasHoldOverlap = tableHoldsExcludingCurrent.some(hold => {
      const holdStart = new Date(hold.start_time);
      const holdEnd = new Date(hold.end_time);
      const overlaps = checkOverlap(requestedStart, requestedEnd, holdStart, holdEnd);
      if (overlaps) {
        console.log('[getAvailability] Hold overlap detected:', {
          tableId: table.id,
          tableName: table.name,
          requestedStart,
          requestedEnd,
          holdStart,
          holdEnd,
          holdSessionKey: hold.session_key
        });
      }
      return overlaps;
    });

    console.log('[getAvailability] Table status check:', {
      tableId: table.id,
      tableName: table.name,
      hasReservationOverlap,
      hasHoldOverlap,
      totalHolds: tableHolds.length,
      filteredHolds: tableHoldsExcludingCurrent.length,
      currentSessionKey
    });

    if (!hasReservationOverlap && !hasHoldOverlap) {
      const isEligible = matchesPartySize(table.capacity, partySize);
      const calculatedState = isEligible ? 'available' : 'capacity_mismatch';
      console.log('[getAvailability] State resolved:', {
        tableId: table.id,
        tableName: table.name,
        capacity: table.capacity,
        partySize,
        calculatedState,
      });
      if (!isEligible) {
        return {
          ...table,
          status: 'red' as const,
          reason: `Seats ${table.capacity} — your party is ${partySize}`,
          detailed_reason: 'capacity_mismatch' as const,
        };
      }
      return {
        ...table,
        status: 'green' as const,
        detailed_reason: undefined,
      };
    }

    const isEligible = matchesPartySize(table.capacity, partySize);
    const bookingState = hasHoldOverlap ? 'held' : 'booked';
    console.log('[getAvailability] State resolved:', {
      tableId: table.id,
      tableName: table.name,
      capacity: table.capacity,
      partySize,
      calculatedState: bookingState,
      isEligible,
    });

    // Find the actual conflicting interval so alternatives anchor to its start/end times.
    // end_time on each reservation is the stored blocking end (start + stored duration).
    const allConflictingIntervals = [
      ...tableReservations.map(r => ({ start: new Date(r.start_time), end: new Date(r.end_time) })),
      ...tableHoldsExcludingCurrent.map(h => ({ start: new Date(h.start_time), end: new Date(h.end_time) })),
    ].filter(iv => checkOverlap(requestedStart, requestedEnd, iv.start, iv.end));

    // Use the earliest conflicting interval as the anchor.
    // Fallback uses requestedDurationMinutes so it's consistent with the requested slot size.
    const earliestConflict = allConflictingIntervals.length > 0
      ? allConflictingIntervals.reduce((earliest, iv) =>
          iv.start < earliest.start ? iv : earliest
        )
      : { start: requestedStart, end: addMinutes(requestedStart, requestedDurationMinutes) };

    const alternatives = findEnhancedAlternativeSlots(
      requestedStart,
      earliestConflict.start,
      earliestConflict.end,
      tableReservations,
      tableHoldsExcludingCurrent,
      dayHours.open,
      dayHours.close,
      date,
      requestedDurationMinutes
    );

    const holdForThisTable = tableHolds.find(hold => {
      const holdStart = new Date(hold.start_time);
      const holdEnd = new Date(hold.end_time);
      return checkOverlap(requestedStart, requestedEnd, holdStart, holdEnd);
    });

    const detailedReason = holdForThisTable
      ? (currentSessionKey && holdForThisTable.session_key === currentSessionKey ? 'held_by_me' : 'held_by_other')
      : hasHoldOverlap
      ? 'held_by_other'
      : hasReservationOverlap
      ? 'booked_conflict'
      : undefined;

    if (alternatives.length > 0) {
      const result: TableAvailability = {
        ...table,
        status: 'yellow' as const,
        amberReason: hasHoldOverlap ? 'held' : 'reserved',
        detailed_reason: detailedReason,
        alternative_times: alternatives,
        hold_expires_at: holdForThisTable?.expires_at,
      };

      const beforeAlt = alternatives.find(a => a.distance < 0);
      const afterAlt = alternatives.find(a => a.distance > 0);
      const primaryAlt = alternatives[0];

      if (primaryAlt) {
        const altDateTime = parseDateTime(date, primaryAlt.time);
        result.suggested_start = formatDateTime(altDateTime);
        result.suggested_end = formatDateTime(addMinutes(altDateTime, requestedDurationMinutes));
        result.alternativeTime = primaryAlt.time;
        result.alternativeDirection = primaryAlt.distance < 0 ? 'before' : 'after';
      }

      if (beforeAlt) {
        result.bestBeforeTime = beforeAlt.time;
        result.bestBeforeDeltaMins = Math.abs(beforeAlt.distance);
      }

      if (afterAlt) {
        result.bestAfterTime = afterAlt.time;
        result.bestAfterDeltaMins = afterAlt.distance;
      }

      return result;
    }

    return {
      ...table,
      status: 'red' as const,
      reason: 'No available time slots',
      detailed_reason: detailedReason ?? 'no_alternatives',
      hold_expires_at: holdForThisTable?.expires_at,
    };
  });

  // Build a map: tableId → whether it is free at the requested time (ignoring capacity mismatch)
  // A table that is red only due to capacity_mismatch is still timewise-free and can contribute to a combo
  const tableIsTimewiseFree = new Map<string, boolean>();
  for (const result of tableResults) {
    const freeForCombos = result.status === 'green' || result.detailed_reason === 'capacity_mismatch';
    tableIsTimewiseFree.set(result.id, freeForCombos);
  }

  // Build per-table blocking intervals (reservations + non-self holds) for next-available computation
  const tableBlockingIntervals = new Map<string, Array<{ start: Date; end: Date }>>();
  for (const table of tables) {
    const tableReservations = existingReservations.filter(r => {
      if (!BLOCKING_RESERVATION_STATUSES.includes(r.status as typeof BLOCKING_RESERVATION_STATUSES[number])) return false;
      const ids = r.joined_table_ids && r.joined_table_ids.length > 0 ? r.joined_table_ids : [r.table_id];
      return ids.includes(table.id);
    });
    const tableHoldsExcl = activeHolds.filter(h =>
      h.table_id === table.id && (!currentSessionKey || h.session_key !== currentSessionKey)
    );
    tableBlockingIntervals.set(table.id, [
      ...tableReservations.map(r => ({ start: new Date(r.start_time), end: new Date(r.end_time) })),
      ...tableHoldsExcl.map(h => ({ start: new Date(h.start_time), end: new Date(h.end_time) })),
    ]);
  }

  /**
   * Find the earliest time >= requestedStart where all tables in the combo are free
   * for the full requestedDurationMinutes, within today's operating hours.
   */
  const findNextAvailableForCombo = (comboTableIds: string[]): string | null => {
    const openDateTime = new Date(`${date}T${dayHours.open}:00`);
    const closeDateTime = new Date(`${date}T${dayHours.close}:00`);
    const durMs = requestedDurationMinutes * 60_000;
    const stepMs = 15 * 60_000; // search in 15-minute increments

    // Collect ALL blocking intervals across all combo tables, sorted by end time
    const allIntervals = comboTableIds.flatMap(id => tableBlockingIntervals.get(id) ?? []);
    allIntervals.sort((a, b) => a.end.getTime() - b.end.getTime());

    // Candidate slots: immediately after each blocking interval end, and at requestedStart
    const candidateStarts = new Set<number>();
    candidateStarts.add(requestedStart.getTime());
    for (const iv of allIntervals) {
      candidateStarts.add(iv.end.getTime());
      // Also try a step past the interval end to account for back-to-back bookings
      candidateStarts.add(iv.end.getTime() + stepMs);
    }

    for (const startMs of Array.from(candidateStarts).sort((a, b) => a - b)) {
      const slotStart = new Date(startMs);
      const slotEnd = new Date(startMs + durMs);
      if (slotStart < requestedStart) continue;
      if (slotStart < openDateTime || slotEnd > closeDateTime) continue;
      const slotTimeStr = formatTime(slotStart);
      if (isInPast(date, slotTimeStr, 15)) continue;

      const allFree = comboTableIds.every(tableId => {
        const intervals = tableBlockingIntervals.get(tableId) ?? [];
        return !intervals.some(iv => checkOverlap(slotStart, slotEnd, iv.start, iv.end));
      });

      if (allFree) {
        return slotTimeStr;
      }
    }
    return null;
  };

  // Joined-table mode: only activate when no valid single table can seat the party.
  // If any single table is available (green) and matches the party size, single-table
  // options take full priority — no combo enrichment, no "+" markers, no joined popups.
  const singleTableAvailable = tableResults.some(
    r => r.status === 'green' && matchesPartySize(r.capacity, partySize)
  );

  // Enrich tables with their joined combination availability.
  // Only attach joinedCombinations when:
  // 1. No valid single table is available for this party/time, AND
  // 2. The party strictly exceeds this table's individual capacity.
  const enriched = tableResults.map(result => {
    if (singleTableAvailable || partySize <= result.capacity) {
      return result;
    }
    const combosForTable = activeCombinations.filter(combo => (combo.tables || []).some(t => t.id === result.id));
    const capacityValidCombos = combosForTable.filter(combo => combo.combined_capacity >= partySize);
    const capacityInvalidCombos = combosForTable.filter(combo => combo.combined_capacity < partySize);
    if (combosForTable.length > 0) {
      console.log('[JoinedCapacityFilter]', {
        partySize,
        tableName: result.name,
        allCombinations: combosForTable.map(c => ({ name: c.name, combined_capacity: c.combined_capacity })),
        capacityValidCombinations: capacityValidCombos.map(c => ({ name: c.name, combined_capacity: c.combined_capacity })),
        excludedCapacityInvalidCombinations: capacityInvalidCombos.map(c => ({ name: c.name, combined_capacity: c.combined_capacity })),
      });
    }

    const comboResults = capacityValidCombos
      .map(combo => {
        const comboTables = combo.tables || [];
        // A combo is available if all its tables are timewise-free
        const unavailableTable = comboTables.find(t => !tableIsTimewiseFree.get(t.id));
        const available = !unavailableTable;
        const nextAvailableTime = !available
          ? findNextAvailableForCombo(comboTables.map(t => t.id))
          : undefined;
        console.log('[JoinedAlternativeTime]', {
          partySize,
          selectedTime: time,
          combinationName: combo.name,
          combinedCapacity: combo.combined_capacity,
          isCapacityValid: combo.combined_capacity >= partySize,
          available,
          nextAvailableTime: nextAvailableTime ?? null,
        });
        return {
          template: combo,
          available,
          unavailableTableName: unavailableTable?.name,
          nextAvailableTime,
        } satisfies JoinedCombinationAvailability;
      });

    if (comboResults.length === 0) {
      return result;
    }

    // Derive the visual status from the best combo available:
    // green  → at least one combo is available right now
    // yellow → no combo available now but at least one has a later slot
    // red    → no combo available and no alternative found
    const anyAvailable = comboResults.some(c => c.available);
    const bestNextTime = comboResults
      .map(c => c.nextAvailableTime)
      .filter((t): t is string => !!t)
      .sort()[0];

    let comboStatus: 'green' | 'yellow' | 'red';
    let extraFields: Partial<TableAvailability> = {};

    if (anyAvailable) {
      comboStatus = 'green';
    } else if (bestNextTime) {
      comboStatus = 'yellow';
      extraFields = {
        alternativeTime: bestNextTime,
        alternativeDirection: 'after' as const,
        suggested_start: (() => {
          const [h, m] = bestNextTime.split(':').map(Number);
          const base = new Date(requestedStart);
          base.setUTCHours(h, m, 0, 0);
          return base.toISOString();
        })(),
      };
    } else {
      comboStatus = 'red';
    }

    console.log('[getAvailability] Final status for table:', {
      tableName: result.name,
      originalStatus: result.status,
      comboStatus,
      anyAvailable,
      bestNextTime,
    });

    return {
      ...result,
      ...extraFields,
      status: comboStatus,
      joinedCombinations: comboResults,
    } as TableAvailability;
  });

  return enriched as TableAvailability[];
}

interface Hold {
  table_id: string;
  start_time: string;
  end_time: string;
  expires_at: string;
  session_key?: string;
  user_id?: string;
}

async function getActiveHoldsForDate(restaurantId: string, date: string): Promise<Hold[]> {
  try {
    const { data, error } = await supabase
      .from('table_holds')
      .select('table_id, start_time, end_time, expires_at, session_key, user_id')
      .eq('restaurant_id', restaurantId)
      .gte('start_time', `${date} 00:00:00`)
      .lt('start_time', `${date} 23:59:59`)
      .gt('expires_at', new Date().toISOString());

    if (error) {
      console.error('[getActiveHoldsForDate] Error fetching holds:', error);
      return [];
    }

    console.log('[getActiveHoldsForDate] Fetched holds:', {
      count: data?.length || 0,
      holds: data?.map(h => ({
        table_id: h.table_id,
        session_key: h.session_key,
        start: h.start_time,
        expires: h.expires_at
      }))
    });

    return data || [];
  } catch (error) {
    console.error('[getActiveHoldsForDate] Exception:', error);
    return [];
  }
}

/**
 * Finds available alternative times for a table that has a conflict.
 *
 * Key invariants:
 * - conflictEnd is the stored end_time of the blocking reservation — never
 *   recalculated from the restaurant's current setting.
 * - requestedDurationMinutes is the duration of the NEW booking being attempted,
 *   taken from the restaurant's current booking settings.
 * - "After" candidates start at conflictEnd (not conflictStart + some fixed offset).
 * - "Before" candidates step back from conflictStart in requestedDuration increments.
 * - Candidate validation checks the full requestedDuration fits without overlap.
 *
 * Example: conflict 18:00–20:30 (stored 150 min), requested duration 150 min →
 *   before: 15:30, after: 20:30.
 */
function findEnhancedAlternativeSlots(
  requestedStart: Date,
  conflictStart: Date,
  conflictEnd: Date,
  reservations: Reservation[],
  holds: Hold[],
  openTime: string,
  closeTime: string,
  date: string,
  requestedDurationMinutes: number = DEFAULT_DURATION_MINUTES
): AlternativeTimeOption[] {
  const openDateTime = new Date(`${date}T${openTime}:00`);
  const closeDateTime = new Date(`${date}T${closeTime}:00`);
  // The requested booking's own duration in ms — used to size candidate slots.
  const reqDurMs = requestedDurationMinutes * 60000;
  // Step size for searching backward/forward when a candidate is also blocked.
  // Use the requested duration so steps are always a full slot-width apart.
  const stepMs = reqDurMs;

  type Interval = { start: Date; end: Date };

  const busyIntervals: Interval[] = [
    ...reservations.map(r => ({ start: new Date(r.start_time), end: new Date(r.end_time) })),
    ...holds.map(h => ({ start: new Date(h.start_time), end: new Date(h.end_time) })),
  ].sort((a, b) => a.start.getTime() - b.start.getTime());

  const slotOverlapsAnyBusy = (slotStartMs: number): boolean => {
    const slotEnd = slotStartMs + reqDurMs;
    return busyIntervals.some(iv =>
      checkOverlap(new Date(slotStartMs), new Date(slotEnd), iv.start, iv.end)
    );
  };

  const isValidCandidate = (slotStartMs: number): boolean => {
    const slotStart = new Date(slotStartMs);
    const slotEnd = new Date(slotStartMs + reqDurMs);
    // Full requested slot must fit inside operating hours
    if (slotStart < openDateTime || slotEnd > closeDateTime) return false;
    // Must not be in the past
    const slotTime = formatTime(slotStart);
    if (isInPast(date, slotTime, 15)) return false;
    // Must not overlap any existing booking or hold for the full requested duration
    if (slotOverlapsAnyBusy(slotStartMs)) return false;
    return true;
  };

  const conflictMs = conflictStart.getTime();
  const conflictEndMs = conflictEnd.getTime();
  const candidates: AlternativeTimeOption[] = [];
  const MAX_STEPS = 48; // guard against infinite search; 48 * any step is plenty

  // Step backward from conflict start in requestedDuration increments.
  // conflictStart - 1*reqDur is the latest slot that ends before the conflict begins.
  for (let n = 1; n <= MAX_STEPS; n++) {
    const candidateMs = conflictMs - n * stepMs;
    if (new Date(candidateMs) < openDateTime) break;
    if (isValidCandidate(candidateMs)) {
      const slotTime = formatTime(new Date(candidateMs));
      const distanceMins = Math.round((candidateMs - requestedStart.getTime()) / 60000);
      candidates.push({ time: slotTime, distance: distanceMins });
      break; // take only the nearest valid before-slot
    }
  }

  // Step forward from conflictEnd: first candidate starts exactly when the blocking
  // reservation ends. If that slot is also taken (another reservation), step forward
  // by requestedDuration until a free slot is found.
  for (let n = 0; n <= MAX_STEPS; n++) {
    const candidateMs = conflictEndMs + n * stepMs;
    if (new Date(candidateMs + reqDurMs) > closeDateTime) break;
    if (isValidCandidate(candidateMs)) {
      const slotTime = formatTime(new Date(candidateMs));
      const distanceMins = Math.round((candidateMs - requestedStart.getTime()) / 60000);
      candidates.push({ time: slotTime, distance: distanceMins });
      break; // take only the nearest valid after-slot
    }
  }

  return candidates.sort((a, b) => Math.abs(a.distance) - Math.abs(b.distance));
}

// ─── Reservation code generator ──────────────────────────────────────────────

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateReservationCode(): string {
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  const code = `FD-${suffix}`;
  if (!/^FD-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(code)) {
    throw new Error('Invalid reservation code generated');
  }
  return code;
}

async function generateUniqueReservationCode(maxAttempts = 5): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const code = generateReservationCode();
    const { data } = await supabase
      .from('reservations')
      .select('id')
      .eq('reservation_code', code)
      .maybeSingle();
    if (!data) return code;
  }
  throw new Error('Failed to generate a unique reservation code after max attempts');
}

// ─── Lookup by short code + email ────────────────────────────────────────────

export async function getReservationByCode(
  reservationCode: string,
  customerEmail: string
): Promise<(Reservation & { table_name?: string }) | null> {
  const normalised = reservationCode
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
    .replace(/\s*-\s*/g, '-');

  const { data, error } = await supabase
    .from('reservations')
    .select(`*, tables:table_id (name)`)
    .eq('reservation_code', normalised)
    .ilike('customer_email', customerEmail.trim())
    .in('status', ['booked', 'confirmed', 'pending'])
    .maybeSingle();

  if (error) throw new Error('Failed to fetch reservation');
  if (!data) return null;

  return { ...data, table_name: (data as any).tables?.name };
}

export async function createReservation(
  restaurantId: string,
  tableId: string,
  date: string,
  time: string,
  partySize: number,
  formData: BookingFormData,
  options?: {
    preorderItems?: PreOrderItem[];
    preorderTotal?: number;
    source?: 'online' | 'walk_in' | 'phone' | 'quick_visit';
    customerUserId?: string;
    marketingOptIn?: boolean;
    joinedTableIds?: string[];
    combinedCapacity?: number;
    combinationName?: string;
  }
): Promise<Reservation & { preorderWarning?: string; emailSent?: boolean; emailError?: string; awaitingAcceptance?: boolean }> {
  if (!restaurantId || !tableId || !date || !time) {
    const error = new Error('Missing required fields: restaurantId, tableId, date, or time');
    console.error('[createReservation] Validation error:', error);
    throw error;
  }

  if (isInPast(date, time, 10)) {
    const error = new Error('Reservations must be in the future');
    console.error('[createReservation] Past date/time rejected:', { date, time });
    throw error;
  }

  // Re-fetch restaurant booking limits and re-validate server-side
  const { data: restaurantData } = await supabase
    .from('restaurants')
    .select('minimum_booking_notice_minutes, max_online_party_size')
    .eq('id', restaurantId)
    .maybeSingle();

  if (restaurantData) {
    // For joined-combo bookings the combined capacity may exceed max_online_party_size.
    // Use combined capacity as the effective limit so the combo booking is not blocked.
    const baseMax = restaurantData.max_online_party_size ?? 8;
    const effectiveMax = options?.combinedCapacity && options.combinedCapacity > baseMax
      ? options.combinedCapacity
      : baseMax;
    const limitViolation = checkBookingLimits(
      date,
      time,
      partySize,
      restaurantData.minimum_booking_notice_minutes ?? 120,
      effectiveMax
    );
    if (limitViolation) {
      const error = new Error(limitViolation.message);
      console.error('[createReservation] Booking limit violation:', limitViolation);
      throw error;
    }
  }

  // Server-side rate limit check: must happen before any DB write
  await checkBookingRateLimit(restaurantId, formData.customer_email);

  // Validate table capacity before creating reservation
  const { data: table } = await supabase
    .from('tables')
    .select('capacity')
    .eq('id', tableId)
    .maybeSingle();

  if (!table) {
    const error = new Error('Table not found');
    console.error('[createReservation] Table not found:', tableId);
    throw error;
  }

  const isJoinedBooking = (options?.joinedTableIds?.length ?? 0) > 0;
  const effectiveCapacity = isJoinedBooking ? (options?.combinedCapacity ?? table.capacity) : table.capacity;

  if (!isJoinedBooking && !matchesPartySize(table.capacity, partySize)) {
    const error = new Error(`This table doesn't fit your party size`);
    console.error('[createReservation] Capacity mismatch:', {
      tableId,
      tableCapacity: table.capacity,
      partySize,
      rule: `Table capacity ${table.capacity} accepts party ${table.capacity - 1} or ${table.capacity}`,
    });
    throw error;
  }

  if (isJoinedBooking && partySize > effectiveCapacity) {
    const error = new Error(`Party size exceeds the combined table capacity`);
    console.error('[createReservation] Joined capacity mismatch:', { partySize, effectiveCapacity });
    throw error;
  }

  if (import.meta.env.DEV) {
    console.log('[createReservation] Capacity validation passed:', {
      tableId,
      tableCapacity: table.capacity,
      partySize,
    });
  }

  // Fetch the restaurant's booking settings to determine the reservation duration.
  // At booking time we snapshot the duration so future changes to the setting
  // do not retroactively alter this reservation's blocking window.
  const { data: bookingSettings } = await supabase
    .from('restaurant_booking_settings')
    .select('default_reservation_duration_minutes, reconfirmation_enabled, reservation_acceptance_mode')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  const reservationDurationMinutes =
    bookingSettings?.default_reservation_duration_minutes ?? DEFAULT_DURATION_MINUTES;
  const manualAcceptanceRequested = (options?.source ?? 'online') === 'online'
    && bookingSettings?.reservation_acceptance_mode === 'manual';
  const reconfirmationRequired = !manualAcceptanceRequested && bookingSettings?.reconfirmation_enabled === true;

  const startTime = parseDateTime(date, time);
  const endTime = addMinutes(startTime, reservationDurationMinutes);

  if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
    const error = new Error('Invalid date/time values');
    console.error('[createReservation] Date parse error:', { date, time, startTime, endTime });
    throw error;
  }

  const manageToken = generateManageToken();
  const tokenExpiry = getTokenExpiry();
  const reservationCode = await generateUniqueReservationCode();

  const marketingOptIn = options?.marketingOptIn ?? false;
  const insertPayload = {
    restaurant_id: restaurantId,
    table_id: tableId,
    customer_name: formData.customer_name,
    customer_phone: formData.customer_phone,
    customer_email: formData.customer_email,
    party_size: partySize,
    start_time: formatDateTime(startTime),
    end_time: formatDateTime(endTime),
    reservation_duration_minutes: reservationDurationMinutes,
    status: 'booked' as const,
    notes: formData.notes || '',
    manage_token: manageToken,
    manage_token_expires_at: formatDateTime(tokenExpiry),
    reservation_code: reservationCode,
    preorder_items: options?.preorderItems ?? [],
    preorder_total: options?.preorderTotal ?? 0,
    source: options?.source ?? 'online',
    customer_user_id: options?.customerUserId ?? null,
    marketing_opt_in: marketingOptIn,
    marketing_opt_in_at: marketingOptIn ? new Date().toISOString() : null,
    marketing_opt_in_source: marketingOptIn ? 'booking_form' : null,
    service_email_notifications_allowed: true,
    service_sms_notifications_allowed: formData.customer_phone.trim().length > 0,
    reconfirmation_required: reconfirmationRequired,
    confirmation_status: reconfirmationRequired ? 'pending' : 'not_required',
  };

  console.log('[createReservation] Attempting insert with payload:', {
    restaurant_id: insertPayload.restaurant_id,
    table_id: insertPayload.table_id,
    customer_user_id: insertPayload.customer_user_id,
    has_session: !!options?.customerUserId,
    start_time: insertPayload.start_time,
    end_time: insertPayload.end_time,
  });

  const { data, error } = await supabase
    .from('reservations')
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    console.error('[createReservation] Supabase error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      full_error: error,
    });
    logAppError({
      area: 'booking',
      event_type: 'booking_create_failed',
      restaurant_id: restaurantId,
      table_id: tableId,
      customer_email: formData.customer_email,
      message: `Supabase insert error: ${error.message}`,
      metadata: { code: error.code },
    });
    throw new Error(`Failed to create reservation: ${error.message} (Code: ${error.code})`);
  }

  console.log('[createReservation] Reservation created successfully:', data.id);

  const { data: depositPreparation } = await supabase.rpc('prepare_reservation_deposit', {
    p_reservation_id: data.id,
    p_manage_token: data.manage_token,
  });
  const requiresDeposit = depositPreparation?.success === true && depositPreparation?.required === true;

  const { data: acceptanceData } = await supabase.rpc('apply_reservation_acceptance_mode', {
    p_reservation_id: data.id,
    p_manage_token: data.manage_token,
  });
  const awaitingAcceptance = acceptanceData?.success && acceptanceData?.status === 'pending_acceptance';
  const reservationResult = {
    ...data,
    status: awaitingAcceptance ? 'pending_acceptance' as const : data.status,
    awaitingAcceptance,
    payment_required: requiresDeposit,
    deposit_amount_pence: requiresDeposit ? depositPreparation.amount_pence : data.deposit_amount_pence,
  };

  // Fire-and-forget EPOS sync — must never block or throw
  if (!awaitingAcceptance) {
    syncBookingCreated(data).catch(err =>
      console.warn('[createReservation] EPOS sync error (non-blocking):', err)
    );
  }

  // Create table assignments (primary + joined) for joined-table bookings.
  // For single-table bookings this still creates a primary assignment row for consistency.
  createReservationTableAssignments(
    data.id,
    restaurantId,
    tableId,
    options?.joinedTableIds ?? []
  ).catch(err => console.warn('[createReservation] Failed to create table assignments:', err));

  // Eagerly create the conversation so it exists before the customer opens the chat link.
  // Fire-and-forget: a failure here must not break the booking.
  ensureConversationExists(
    data.id,
    restaurantId,
    formData.customer_name,
    formData.customer_phone,
    formData.customer_email
  ).catch(err => console.warn('[createReservation] Failed to create conversation:', err));

  let emailSent = false;
  let emailError: string | undefined;

  if (awaitingAcceptance) {
    notifyBookingRequestReceived(data.id, data.manage_token).catch(() => {});
    return { ...reservationResult, emailSent, emailError };
  }

  if (requiresDeposit) {
    return { ...reservationResult, emailSent, emailError };
  }

  try {
    const restaurant = await getRestaurantData(restaurantId);
    const { data: primaryTable } = await supabase
      .from('tables')
      .select('name')
      .eq('id', tableId)
      .maybeSingle();

    if (restaurant && primaryTable) {
      let displayTableName = primaryTable.name;
      if (isJoinedBooking && (options?.joinedTableIds?.length ?? 0) > 0) {
        const { data: joinedTableRows } = await supabase
          .from('tables')
          .select('name')
          .in('id', options!.joinedTableIds!);
        const joinedNames = (joinedTableRows || []).map(t => t.name);
        displayTableName = [primaryTable.name, ...joinedNames].join(' + ');
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-confirmation-email`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reservation_id: data.id,
          customer_name: formData.customer_name,
          customer_email: formData.customer_email,
          restaurant_name: restaurant.name,
          restaurant_address: restaurant.address,
          date: new Date(startTime).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
          start_time: formatTime(startTime),
          end_time: formatTime(endTime),
          table_name: displayTableName,
          party_size: partySize,
          manage_token: manageToken,
          reservation_code: reservationCode,
          reservation_duration_minutes: reservationDurationMinutes,
        }),
      });

      const result = await response.json();

      if (result.success) {
        console.log('Confirmation email sent successfully:', result);
        emailSent = true;
      } else {
        console.error('Email sending failed:', result);
        emailError = result.error || 'Failed to send confirmation email';
        logAppError({
          area: 'email',
          event_type: 'confirmation_email_failed',
          restaurant_id: restaurantId,
          reservation_id: data.id,
          reservation_code: reservationCode,
          customer_email: formData.customer_email,
          message: emailError,
        });
      }
    }
  } catch (error) {
    console.error('Failed to send confirmation email:', error);
    emailError = error instanceof Error ? error.message : 'Failed to send confirmation email';
    logAppError({
      area: 'email',
      event_type: 'confirmation_email_failed',
      restaurant_id: restaurantId,
      reservation_id: data.id,
      reservation_code: reservationCode,
      customer_email: formData.customer_email,
      message: emailError,
    });
  }

  return {
    ...reservationResult,
    emailSent,
    emailError,
  };
}

export async function getReservationByToken(token: string): Promise<(Reservation & { table_name?: string }) | null> {
  if (!token) return null;

  const { data, error } = await supabase.rpc('get_reservation_by_manage_token', {
    p_token: token,
  });

  if (error) {
    throw new Error('Failed to fetch reservation');
  }

  if (!data) return null;

  return data as Reservation & { table_name?: string };
}

export async function cancelReservation(token: string): Promise<void> {
  if (!token) throw new Error('Invalid token');

  const { data, error } = await supabase.rpc('cancel_reservation_by_manage_token', {
    p_token: token,
  });

  if (error) {
    throw new Error('Failed to cancel reservation');
  }

  if (!data?.success) {
    throw new Error('TOKEN_EXPIRED_OR_INVALID');
  }

  if (data.reservation) {
    syncBookingCancelled(data.reservation as Reservation).catch(err =>
      console.warn('[cancelReservation] EPOS sync error (non-blocking):', err)
    );
  }
}

export async function getRestaurantReservations(
  restaurantId: string,
  date?: string
): Promise<Reservation[]> {
  let query = supabase
    .from('reservations')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('start_time', { ascending: true });

  if (date) {
    const startOfDay = `${date}T00:00:00Z`;
    const endOfDay = `${date}T23:59:59Z`;
    query = query.gte('start_time', startOfDay).lte('start_time', endOfDay);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error('Failed to fetch reservations');
  }

  const reservations = data || [];

  if (reservations.length > 0) {
    const assignments = await getAssignmentsForReservations(reservations.map(r => r.id));

    // Collect all unique table IDs across all reservations for a single name lookup
    const allTableIds = new Set<string>();
    for (const res of reservations) {
      if (res.table_id) allTableIds.add(res.table_id);
      const asn = assignments[res.id];
      if (asn) asn.tableIds.forEach(id => allTableIds.add(id));
    }

    const tableNameMap = new Map<string, string>();
    if (allTableIds.size > 0) {
      const { data: tableRows } = await supabase
        .from('tables')
        .select('id, name')
        .in('id', Array.from(allTableIds));
      for (const t of tableRows || []) tableNameMap.set(t.id, t.name);
    }

    for (const res of reservations) {
      const asn = assignments[res.id];
      if (asn && asn.tableIds.length > 0) {
        res.joined_table_ids = asn.tableIds;
        res.joined_table_names = asn.tableIds.map(id => tableNameMap.get(id) ?? '').filter(Boolean);
      } else if (res.table_id) {
        const name = tableNameMap.get(res.table_id);
        if (name) res.joined_table_names = [name];
      }
    }
  }

  return reservations;
}

export async function getCustomerReservations(email: string): Promise<Reservation[]> {
  const { data, error } = await supabase
    .from('reservations')
    .select(`
      *,
      restaurants:restaurant_id (
        name,
        address
      ),
      tables:table_id (
        name
      )
    `)
    .eq('customer_email', email)
    .order('start_time', { ascending: false });

  if (error) {
    throw new Error('Failed to fetch reservations');
  }

  return data || [];
}

async function getRestaurantData(restaurantId: string): Promise<Restaurant | null> {
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .eq('id', restaurantId)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data;
}

async function getReservationsForDate(restaurantId: string, date: string): Promise<Reservation[]> {
  console.log('[getReservationsForDate] Querying reservations:', { restaurantId, date });

  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .in('status', [...BLOCKING_RESERVATION_STATUSES])
    .gte('start_time', `${date} 00:00:00`)
    .lt('start_time', `${date} 23:59:59`);

  if (error) {
    console.error('[getReservationsForDate] ERROR:', error);
    return [];
  }

  const reservations = data || [];

  // Enrich with joined table IDs and names from reservation_table_assignments
  if (reservations.length > 0) {
    const assignments = await getAssignmentsForReservations(reservations.map(r => r.id));

    const allTableIds = new Set<string>();
    for (const res of reservations) {
      if (res.table_id) allTableIds.add(res.table_id);
      const asn = assignments[res.id];
      if (asn) asn.tableIds.forEach(id => allTableIds.add(id));
    }

    const tableNameMap = new Map<string, string>();
    if (allTableIds.size > 0) {
      const { data: tableRows } = await supabase
        .from('tables')
        .select('id, name')
        .in('id', Array.from(allTableIds));
      for (const t of tableRows || []) tableNameMap.set(t.id, t.name);
    }

    for (const res of reservations) {
      const asn = assignments[res.id];
      if (asn && asn.tableIds.length > 0) {
        res.joined_table_ids = asn.tableIds;
        res.joined_table_names = asn.tableIds.map(id => tableNameMap.get(id) ?? '').filter(Boolean);
      } else if (res.table_id) {
        const name = tableNameMap.get(res.table_id);
        if (name) res.joined_table_names = [name];
      }
    }
  }

  console.log('[getReservationsForDate] SUCCESS - Found reservations:', {
    count: reservations.length,
    reservations: reservations.map(r => ({
      id: r.id,
      table_id: r.table_id,
      joined_table_ids: r.joined_table_ids,
      start_time: r.start_time,
      end_time: r.end_time
    }))
  });

  return reservations;
}

export interface TimeSlot {
  time: string;
  hasAvailability: boolean;
  availableTableId?: string;
}

export async function getAvailableTimeSlots(
  restaurantId: string,
  date: string,
  partySize: number
): Promise<TimeSlot[]> {
  const [restaurant, bookingSettingsResult] = await Promise.all([
    getRestaurantData(restaurantId),
    supabase
      .from('restaurant_booking_settings')
      .select('default_reservation_duration_minutes')
      .eq('restaurant_id', restaurantId)
      .maybeSingle(),
  ]);
  if (!restaurant) {
    throw new Error('Restaurant not found');
  }

  const slotDurationMinutes =
    bookingSettingsResult.data?.default_reservation_duration_minutes ?? DEFAULT_DURATION_MINUTES;

  const dateObj = new Date(date + 'T00:00:00Z');
  const dayOfWeek = getDayOfWeek(dateObj);
  const dayHours = restaurant.opening_hours[dayOfWeek];

  if (!dayHours || dayHours.closed) {
    return [];
  }

  const [openHour, openMin] = dayHours.open.split(':').map(Number);
  const [closeHour, closeMin] = dayHours.close.split(':').map(Number);
  const openMinutes = openHour * 60 + openMin;
  const closeMinutes = closeHour * 60 + closeMin;
  const lastBookableMinutes = closeMinutes - slotDurationMinutes;

  const tables = await getTables(restaurantId);
  const eligibleTables = tables.filter(t => matchesPartySize(t.capacity, partySize));

  if (eligibleTables.length === 0) {
    return [];
  }

  const now = new Date().toISOString();
  const [reservationsResult, holdsResult] = await Promise.all([
    supabase
      .from('reservations')
      .select('table_id, start_time, end_time')
      .eq('restaurant_id', restaurantId)
      .in('status', [...BLOCKING_RESERVATION_STATUSES])
      .gte('start_time', `${date} 00:00:00`)
      .lt('start_time', `${date} 23:59:59`),
    supabase
      .from('table_holds')
      .select('table_id, start_time, end_time, expires_at')
      .eq('restaurant_id', restaurantId)
      .gte('start_time', `${date} 00:00:00`)
      .lt('start_time', `${date} 23:59:59`)
      .gt('expires_at', now),
  ]);

  const reservations = reservationsResult.data || [];
  const holds = holdsResult.data || [];

  const timeSlots: TimeSlot[] = [];

  for (let minutes = openMinutes; minutes <= lastBookableMinutes; minutes += 15) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const timeStr = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;

    if (isInPast(date, timeStr, 15)) continue;

    const slotStart = parseDateTime(date, timeStr);
    const slotEnd = addMinutes(slotStart, slotDurationMinutes);

    if (!isValidTimeSlot(slotStart, dayHours.open, dayHours.close, dayHours.last_booking)) continue;

    const availableTable = eligibleTables.find(table => {
      const hasReservationOverlap = reservations
        .filter(r => r.table_id === table.id)
        .some(r => checkOverlap(slotStart, slotEnd, new Date(r.start_time), new Date(r.end_time)));

      const hasHoldOverlap = holds
        .filter(h => h.table_id === table.id)
        .some(h => checkOverlap(slotStart, slotEnd, new Date(h.start_time), new Date(h.end_time)));

      return !hasReservationOverlap && !hasHoldOverlap;
    });

    if (availableTable) {
      timeSlots.push({
        time: timeStr,
        hasAvailability: true,
        availableTableId: availableTable.id,
      });
    }
  }

  return timeSlots;
}

// ─── Reservation modification ─────────────────────────────────────────────────

export interface ModifyReservationResult {
  success: boolean;
  reservation_id?: string;
  manage_token?: string;
  reservation_code?: string;
  error?: string;
  message?: string;
  emailSent?: boolean;
  emailError?: string;
}

export async function modifyReservation(
  manageToken: string,
  newDate: string,
  newTime: string,
  newPartySize: number,
  newTableId: string,
  customerName: string,
  customerEmail: string,
  restaurantId: string
): Promise<ModifyReservationResult> {
  try {
    const { data, error } = await supabase.rpc('modify_reservation', {
      p_manage_token:   manageToken,
      p_new_date:       newDate,
      p_new_time:       newTime,
      p_new_party_size: newPartySize,
      p_new_table_id:   newTableId,
    });

    if (error) {
      logAppError({
        area: 'booking',
        event_type: 'booking_create_failed',
        restaurant_id: restaurantId,
        customer_email: customerEmail,
        message: `modify_reservation RPC error: ${error.message}`,
        metadata: { code: error.code },
      });
      return { success: false, error: 'RPC_ERROR', message: 'Failed to update reservation. Your original booking is unchanged.' };
    }

    const result = data as ModifyReservationResult;
    if (!result.success) return result;

    // Send update email (non-blocking)
    let emailSent = false;
    let emailError: string | undefined;

    try {
      const { data: reservationRow } = await supabase
        .from('reservations')
        .select(`*, restaurants:restaurant_id (name, address), tables:table_id (name)`)
        .eq('id', result.reservation_id!)
        .maybeSingle();

      if (reservationRow) {
        const startTime = new Date(reservationRow.start_time);
        const endTime   = new Date(reservationRow.end_time);
        const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-confirmation-email`;
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            reservation_id:    reservationRow.id,
            customer_name:     customerName,
            customer_email:    customerEmail,
            restaurant_name:   reservationRow.restaurants.name,
            restaurant_address: reservationRow.restaurants.address,
            date: startTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
            start_time:        formatTime(startTime),
            end_time:          formatTime(endTime),
            table_name:        reservationRow.tables.name,
            party_size:        reservationRow.party_size,
            manage_token:      result.manage_token,
            reservation_code:  result.reservation_code,
            is_modification:   true,
          }),
        });
        const emailResult = await response.json();
        if (emailResult.success) {
          emailSent = true;
        } else {
          emailError = emailResult.error || 'Failed to send update email';
          logAppError({
            area: 'email',
            event_type: 'confirmation_email_failed',
            restaurant_id: restaurantId,
            reservation_id: result.reservation_id,
            reservation_code: result.reservation_code,
            customer_email: customerEmail,
            message: emailError,
            metadata: { is_modification: true },
          });
        }
      }
    } catch (emailErr) {
      emailError = emailErr instanceof Error ? emailErr.message : 'Failed to send update email';
      logAppError({
        area: 'email',
        event_type: 'confirmation_email_failed',
        restaurant_id: restaurantId,
        reservation_id: result.reservation_id,
        customer_email: customerEmail,
        message: emailError,
        metadata: { is_modification: true },
      });
    }

    // Fire-and-forget EPOS sync for the updated booking
    if (result.reservation_id) {
      supabase
        .from('reservations')
        .select('*')
        .eq('id', result.reservation_id)
        .maybeSingle()
        .then(({ data: updated }) => {
          if (updated) {
            syncBookingUpdated(updated).catch(err =>
              console.warn('[modifyReservation] EPOS sync error (non-blocking):', err)
            );
          }
        })
        .catch(() => {});
    }

    return { ...result, emailSent, emailError };
  } catch (err) {
    logAppError({
      area: 'booking',
      event_type: 'booking_create_failed',
      restaurant_id: restaurantId,
      customer_email: customerEmail,
      message: err instanceof Error ? err.message : 'Exception in modifyReservation',
    });
    return { success: false, error: 'EXCEPTION', message: 'We couldn\'t update your reservation. Your original booking is still unchanged.' };
  }
}

export async function getAvailabilityExcludingReservation(
  restaurantId: string,
  date: string,
  time: string,
  partySize: number,
  excludeReservationId: string,
  currentSessionKey?: string
): Promise<TableAvailability[]> {
  const [tables, restaurant, bookingSettingsResult] = await Promise.all([
    getTables(restaurantId),
    getRestaurantData(restaurantId),
    supabase
      .from('restaurant_booking_settings')
      .select('default_reservation_duration_minutes')
      .eq('restaurant_id', restaurantId)
      .maybeSingle(),
  ]);
  if (!restaurant) throw new Error('Restaurant not found');

  const requestedDurationMinutes =
    bookingSettingsResult.data?.default_reservation_duration_minutes ?? DEFAULT_DURATION_MINUTES;

  const requestedStart = parseDateTime(date, time);
  const requestedEnd   = addMinutes(requestedStart, requestedDurationMinutes);

  const dayOfWeek = getDayOfWeek(requestedStart);
  const dayHours  = restaurant.opening_hours[dayOfWeek];

  if (!dayHours || dayHours.closed) {
    return tables.map(table => ({ ...table, status: 'red' as const, reason: 'Restaurant is closed on this day' }));
  }

  const [reservationsResult, holdsResult] = await Promise.all([
    supabase
      .from('reservations')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .in('status', [...BLOCKING_RESERVATION_STATUSES])
      .neq('id', excludeReservationId)
      .gte('start_time', `${date} 00:00:00`)
      .lt('start_time',  `${date} 23:59:59`),
    supabase
      .from('table_holds')
      .select('table_id, start_time, end_time, expires_at, session_key')
      .eq('restaurant_id', restaurantId)
      .gte('start_time', `${date} 00:00:00`)
      .lt('start_time',  `${date} 23:59:59`)
      .gt('expires_at', new Date().toISOString()),
  ]);

  const existingReservations = (reservationsResult.data || []) as Reservation[];
  const activeHolds = (holdsResult.data || []) as Array<{
    table_id: string; start_time: string; end_time: string; expires_at: string; session_key?: string;
  }>;

  return tables.map(table => {
    if (!isValidTimeSlot(requestedStart, dayHours.open, dayHours.close, dayHours.last_booking)) {
      const latestTime = dayHours.last_booking
        ? parseDateTime(date, dayHours.last_booking)
        : addMinutes(parseDateTime(date, dayHours.close), -requestedDurationMinutes);
      return { ...table, status: 'red' as const, reason: `Last bookable time is ${formatTime(latestTime)}`, detailed_reason: 'past_time' as const };
    }

    const tableReservations = existingReservations.filter(r =>
      r.table_id === table.id
      && BLOCKING_RESERVATION_STATUSES.includes(r.status as typeof BLOCKING_RESERVATION_STATUSES[number])
    );
    const tableHolds = activeHolds.filter(h => h.table_id === table.id && (!currentSessionKey || h.session_key !== currentSessionKey));

    const hasReservationOverlap = tableReservations.some(r =>
      checkOverlap(requestedStart, requestedEnd, new Date(r.start_time), new Date(r.end_time))
    );
    const hasHoldOverlap = tableHolds.some(h =>
      checkOverlap(requestedStart, requestedEnd, new Date(h.start_time), new Date(h.end_time))
    );

    if (!hasReservationOverlap && !hasHoldOverlap) {
      const isEligible = matchesPartySize(table.capacity, partySize);
      if (!isEligible) {
        return { ...table, status: 'red' as const, reason: `Seats ${table.capacity} — your party is ${partySize}`, detailed_reason: 'capacity_mismatch' as const };
      }
      return { ...table, status: 'green' as const };
    }

    const isEligible = matchesPartySize(table.capacity, partySize);
    const allConflictingIntervals = [
      ...tableReservations.map(r => ({ start: new Date(r.start_time), end: new Date(r.end_time) })),
      ...tableHolds.map(h => ({ start: new Date(h.start_time), end: new Date(h.end_time) })),
    ].filter(iv => checkOverlap(requestedStart, requestedEnd, iv.start, iv.end));

    const conflictStart = allConflictingIntervals.length > 0
      ? allConflictingIntervals.reduce((e, iv) => iv.start < e.start ? iv : e).start
      : requestedStart;
    const conflictEnd = allConflictingIntervals.length > 0
      ? allConflictingIntervals.reduce((e, iv) => iv.end > e.end ? iv : e).end
      : requestedEnd;

    const alternatives = findEnhancedAlternativeSlots(
      requestedStart, conflictStart, conflictEnd, tableReservations, tableHolds as any,
      dayHours.open, dayHours.close, date, requestedDurationMinutes
    );

    const detailedReason: TableAvailability['detailed_reason'] = hasHoldOverlap ? 'held_by_other' : 'booked_conflict';

    if (alternatives.length > 0) {
      const result: TableAvailability = {
        ...table,
        status: 'yellow' as const,
        amberReason: hasHoldOverlap ? 'held' : 'reserved',
        detailed_reason: detailedReason,
        alternative_times: alternatives,
      };
      const primaryAlt = alternatives[0];
      if (primaryAlt) {
        const altDateTime = parseDateTime(date, primaryAlt.time);
        result.suggested_start = formatDateTime(altDateTime);
        result.suggested_end   = formatDateTime(addMinutes(altDateTime, requestedDurationMinutes));
        result.alternativeTime = primaryAlt.time;
        result.alternativeDirection = primaryAlt.distance < 0 ? 'before' : 'after';
      }
      const beforeAlt = alternatives.find(a => a.distance < 0);
      const afterAlt  = alternatives.find(a => a.distance > 0);
      if (beforeAlt) { result.bestBeforeTime = beforeAlt.time; result.bestBeforeDeltaMins = Math.abs(beforeAlt.distance); }
      if (afterAlt)  { result.bestAfterTime  = afterAlt.time;  result.bestAfterDeltaMins  = afterAlt.distance; }
      return result;
    }

    return { ...table, status: 'red' as const, reason: 'No available time slots', detailed_reason: detailedReason };
  });
}
