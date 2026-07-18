import { supabase } from '../lib/supabase';
import { ReservationJourneyEvent, ReservationJourneyStage } from '../lib/types';
import { syncBookingSeated, syncBookingCompleted } from './epos';

export type JourneyStageDefinition = {
  stage: ReservationJourneyStage;
  label: string;
  activeLabel: string;
  icon: string;
};

export const ALL_JOURNEY_STAGES: JourneyStageDefinition[] = [
  { stage: 'seated',           label: 'Seated',           activeLabel: 'Guests Seated',    icon: 'armchair' },
  { stage: 'drinks_taken',     label: 'Drinks Taken',     activeLabel: 'Drinks Taken',     icon: 'wine' },
  { stage: 'drinks_served',    label: 'Drinks Served',    activeLabel: 'Drinks Served',    icon: 'wine' },
  { stage: 'food_order_taken', label: 'Food Order Taken', activeLabel: 'Food Order Taken', icon: 'clipboard' },
  { stage: 'starters_served',  label: 'Starters Served',  activeLabel: 'Starters Served',  icon: 'utensils' },
  { stage: 'mains_served',     label: 'Mains Served',     activeLabel: 'Mains Served',     icon: 'chef-hat' },
  { stage: 'desserts_served',  label: 'Desserts Served',  activeLabel: 'Desserts Served',  icon: 'cake' },
  { stage: 'bill_requested',   label: 'Bill Requested',   activeLabel: 'Bill Requested',   icon: 'receipt' },
  { stage: 'bill_paid',        label: 'Bill Paid',        activeLabel: 'Bill Paid',        icon: 'circle-check' },
  { stage: 'table_cleared',    label: 'Table Cleared',    activeLabel: 'Table Cleared',    icon: 'sparkles' },
];

export function getJourneyStages(dessertsEnabled = true): JourneyStageDefinition[] {
  if (dessertsEnabled) return ALL_JOURNEY_STAGES;
  return ALL_JOURNEY_STAGES.filter(s => s.stage !== 'desserts_served');
}

export const JOURNEY_STAGES = ALL_JOURNEY_STAGES;

export async function getJourneyEvents(reservationId: string): Promise<ReservationJourneyEvent[]> {
  const { data, error } = await supabase
    .from('reservation_journey_events')
    .select('*')
    .eq('reservation_id', reservationId)
    .order('entered_at', { ascending: true });

  if (error) throw error;
  return data as ReservationJourneyEvent[];
}

export async function advanceJourneyStage(
  reservationId: string,
  newStage: ReservationJourneyStage,
  currentStage: ReservationJourneyStage | null | undefined
): Promise<void> {
  const now = new Date().toISOString();

  if (currentStage) {
    const { error: updateError } = await supabase
      .from('reservation_journey_events')
      .update({ exited_at: now })
      .eq('reservation_id', reservationId)
      .eq('stage', currentStage)
      .is('exited_at', null);

    if (updateError) throw updateError;
  }

  const { error: insertError } = await supabase
    .from('reservation_journey_events')
    .insert({
      reservation_id: reservationId,
      stage: newStage,
      entered_at: now,
    });

  if (insertError) throw insertError;

  const updatePayload: Record<string, string | null> = {
    journey_stage: newStage,
    updated_at: now,
  };

  if (!currentStage) {
    updatePayload.journey_started_at = now;
  }

  if (newStage === 'table_cleared') {
    updatePayload.journey_completed_at = now;
  }

  const { error: reservationError } = await supabase
    .from('reservations')
    .update(updatePayload)
    .eq('id', reservationId);

  if (reservationError) throw reservationError;

  // Fire-and-forget EPOS sync for stage transitions
  if (newStage === 'seated' || newStage === 'table_cleared') {
    supabase
      .from('reservations')
      .select('*')
      .eq('id', reservationId)
      .maybeSingle()
      .then(({ data: reservation }) => {
        if (!reservation) return;
        if (newStage === 'seated') {
          syncBookingSeated(reservation).catch(err =>
            console.warn('[advanceJourneyStage] EPOS seated sync error (non-blocking):', err)
          );
        } else {
          syncBookingCompleted(reservation).catch(err =>
            console.warn('[advanceJourneyStage] EPOS completed sync error (non-blocking):', err)
          );
        }
      })
      .catch(() => {});
  }
}

export async function resetJourney(reservationId: string): Promise<void> {
  const { error: deleteError } = await supabase
    .from('reservation_journey_events')
    .delete()
    .eq('reservation_id', reservationId);

  if (deleteError) throw deleteError;

  const { error: reservationError } = await supabase
    .from('reservations')
    .update({
      journey_stage: null,
      journey_started_at: null,
      journey_completed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', reservationId);

  if (reservationError) throw reservationError;
}
