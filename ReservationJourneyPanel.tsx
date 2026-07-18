import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Armchair, Wine, UtensilsCrossed, ChefHat, Cake, Receipt, CheckCircle2,
  ChevronRight, Clock, Loader2, Sparkles, Check, ClipboardList, MonitorCheck, MonitorX,
} from 'lucide-react';
import { Reservation, ReservationJourneyStage, ReservationJourneyEvent } from '../lib/types';
import { getJourneyStages, getJourneyEvents, advanceJourneyStage } from '../services/journey';
import { openTableOnPos } from '../services/sumup';

interface ReservationJourneyPanelProps {
  reservation: Reservation;
  onUpdate: () => void;
  dessertsEnabled?: boolean;
  posEnabled?: boolean;
  restaurantId?: string;
}

const STAGE_ICONS: Record<ReservationJourneyStage, React.ComponentType<{ className?: string }>> = {
  seated: Armchair,
  drinks_taken: Wine,
  drinks_served: Wine,
  food_order_taken: ClipboardList,
  starters_served: UtensilsCrossed,
  mains_served: ChefHat,
  desserts_served: Cake,
  bill_requested: Receipt,
  bill_paid: CheckCircle2,
  table_cleared: Sparkles,
};

const TAKEN_STAGES: ReservationJourneyStage[] = ['seated', 'drinks_taken', 'food_order_taken', 'bill_requested'];

function getStageAmberVariant(stage: ReservationJourneyStage): 'light' | 'deep' {
  return TAKEN_STAGES.includes(stage) ? 'light' : 'deep';
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function LiveTimer({ since }: { since: string }) {
  const [elapsed, setElapsed] = useState(Date.now() - new Date(since).getTime());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setElapsed(Date.now() - new Date(since).getTime());
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [since]);

  return <span className="font-mono tabular-nums">{formatDuration(elapsed)}</span>;
}

export function ReservationJourneyPanel({
  reservation, onUpdate, dessertsEnabled = true, posEnabled = false, restaurantId,
}: ReservationJourneyPanelProps) {
  const [events, setEvents] = useState<ReservationJourneyEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [posStatus, setPosStatus] = useState<'idle' | 'opening' | 'open' | 'shadow' | 'failed'>('idle');

  const STAGES = getJourneyStages(dessertsEnabled);

  const isCompleted = reservation.journey_stage === 'table_cleared';
  const hasStarted = !!reservation.journey_stage || !!reservation.journey_started_at;

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getJourneyEvents(reservation.id);
      setEvents(data);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [reservation.id]);

  useEffect(() => {
    if (showPanel) loadEvents();
  }, [showPanel, loadEvents]);

  const currentStageIndex = reservation.journey_stage
    ? STAGES.findIndex(s => s.stage === reservation.journey_stage)
    : -1;

  const nextStage = currentStageIndex < STAGES.length - 1
    ? STAGES[currentStageIndex + 1]
    : null;

  const handleAdvance = async () => {
    if (advancing) return;
    if (isCompleted) return;
    const target = hasStarted ? nextStage?.stage : STAGES[0].stage;
    if (!target) return;
    const expectedNextIndex = hasStarted ? currentStageIndex + 1 : 0;
    if (STAGES[expectedNextIndex]?.stage !== target) return;
    setAdvancing(true);
    try {
      await advanceJourneyStage(reservation.id, target, reservation.journey_stage ?? null);
      await loadEvents();
      onUpdate();

      // When guests are seated, open a table on SumUp POS if enabled
      if (target === 'seated' && posEnabled && restaurantId) {
        setPosStatus('opening');
        // Use the actual table name(s) from the reservation so SumUp matches the physical table.
        // For joined/combined bookings, join all names (e.g. "T1 + T2").
        const posTableName = reservation.joined_table_names && reservation.joined_table_names.length > 0
          ? reservation.joined_table_names.join(' + ')
          : 'Table';
        const result = await openTableOnPos(
          reservation.id,
          restaurantId,
          posTableName,
          reservation.party_size,
          reservation.customer_name,
        );
        setPosStatus(result.success ? (result.shadow_mode ? 'shadow' : 'open') : 'failed');
      }
    } catch {
    } finally {
      setAdvancing(false);
    }
  };

  if (reservation.status === 'cancelled') return null;

  const getStageEvent = (stage: ReservationJourneyStage) => events.find(e => e.stage === stage);
  const getStageDuration = (event: ReservationJourneyEvent) => {
    if (!event.exited_at) return null;
    return new Date(event.exited_at).getTime() - new Date(event.entered_at).getTime();
  };

  return (
    <div className="mt-3 border-t border-slate-800 pt-3">
      <button
        onClick={() => setShowPanel(p => !p)}
        className="flex items-center justify-between w-full group py-1"
      >
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${
            isCompleted ? 'bg-emerald-500' : hasStarted ? 'bg-amber-400 animate-pulse' : 'bg-slate-600'
          }`} />
          <span className="text-xs font-semibold text-slate-400 group-hover:text-slate-300 transition-colors">
            {isCompleted ? 'Journey Complete' : hasStarted ? 'Journey in Progress' : 'Track Journey'}
          </span>
          {hasStarted && !isCompleted && reservation.journey_stage && (
            <span className="text-xs text-slate-500">
              — {STAGES.find(s => s.stage === reservation.journey_stage)?.activeLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasStarted && !isCompleted && reservation.journey_started_at && (
            <span className="text-xs text-amber-500 font-medium flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <LiveTimer since={reservation.journey_started_at} />
            </span>
          )}
          <ChevronRight className={`w-3.5 h-3.5 text-slate-600 transition-transform ${showPanel ? 'rotate-90' : ''}`} />
        </div>
      </button>

      {showPanel && (
        <div className="mt-3 space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-slate-500 text-xs py-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading journey...
            </div>
          ) : (
            <>
              <div className="relative">
                <div className="absolute left-[13px] top-4 bottom-4 w-px bg-slate-800" />
                <div className="space-y-1">
                  {STAGES.map((s, index) => {
                    const event = getStageEvent(s.stage);
                    const isActive = !isCompleted && reservation.journey_stage === s.stage;
                    const isPast = isCompleted ? currentStageIndex >= index : currentStageIndex > index;
                    const isFuture = !isActive && !isPast;
                    const Icon = STAGE_ICONS[s.stage];
                    const duration = event ? getStageDuration(event) : null;
                    const amberVariant = getStageAmberVariant(s.stage);

                    const dotBg = isPast
                      ? 'bg-emerald-500 border-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]'
                      : isActive
                        ? amberVariant === 'light'
                          ? 'bg-amber-400 border-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]'
                          : 'bg-amber-500 border-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                        : 'bg-slate-900 border-slate-700';

                    const labelColor = isPast
                      ? 'text-emerald-400'
                      : isActive
                        ? amberVariant === 'light' ? 'text-amber-300' : 'text-amber-400'
                        : 'text-slate-600';

                    const rowBg = isActive
                      ? amberVariant === 'light'
                        ? 'bg-amber-400/8 border border-amber-400/15 rounded-lg'
                        : 'bg-amber-500/10 border border-amber-500/20 rounded-lg'
                      : isPast
                        ? 'bg-emerald-500/5 rounded-lg'
                        : '';

                    return (
                      <div
                        key={s.stage}
                        className={`relative flex items-center gap-3 px-2 py-1.5 transition-colors ${rowBg}`}
                      >
                        <div className={`relative z-10 flex-shrink-0 w-[27px] h-[27px] rounded-full flex items-center justify-center border ${dotBg}`}>
                          {isPast ? (
                            <Check className="w-3 h-3 text-white" strokeWidth={3} />
                          ) : (
                            <Icon className={`w-3 h-3 ${isActive ? 'text-white' : 'text-slate-600'}`} />
                          )}
                        </div>

                        <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                          <span className={`text-xs font-medium ${labelColor}`}>
                            {isActive ? s.activeLabel : s.label}
                          </span>
                          <div className="flex items-center gap-1.5 text-xs flex-shrink-0">
                            {event && (
                              <>
                                <span className="text-slate-600">
                                  {new Date(event.entered_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                {duration !== null && (
                                  <span className={`font-mono px-1.5 py-0.5 rounded text-xs ${
                                    isPast
                                      ? 'bg-emerald-500/15 text-emerald-400'
                                      : amberVariant === 'light'
                                        ? 'bg-amber-400/15 text-amber-300'
                                        : 'bg-amber-500/15 text-amber-400'
                                  }`}>
                                    {formatDuration(duration)}
                                  </span>
                                )}
                                {isActive && (
                                  <span className={`font-mono px-1.5 py-0.5 rounded text-xs flex items-center gap-1 ${
                                    amberVariant === 'light'
                                      ? 'bg-amber-400/15 text-amber-300'
                                      : 'bg-amber-500/15 text-amber-400'
                                  }`}>
                                    <Clock className="w-2.5 h-2.5" />
                                    <LiveTimer since={event.entered_at} />
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-1">
                {!isCompleted && (
                  <button
                    onClick={handleAdvance}
                    disabled={advancing}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-white active:scale-[0.98]"
                  >
                    {advancing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : hasStarted ? (
                      <>
                        <ChevronRight className="w-4 h-4" />
                        {nextStage ? `Advance to: ${nextStage.label}` : 'Complete Journey'}
                      </>
                    ) : (
                      <>
                        <Armchair className="w-4 h-4" />
                        Advance to: Guests Seated
                      </>
                    )}
                  </button>
                )}

                {isCompleted && (
                  <div className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium">
                    <Sparkles className="w-4 h-4" />
                    Table Cleared — Visit Complete
                  </div>
                )}
              </div>

              {reservation.journey_started_at && !isCompleted && (
                <div className="flex items-center gap-1.5 text-xs text-slate-600 pt-0.5">
                  <Clock className="w-3 h-3" />
                  Total seated: <LiveTimer since={reservation.journey_started_at} />
                </div>
              )}

              {posEnabled && posStatus !== 'idle' && (
                <div className={`flex items-center gap-1.5 text-xs pt-0.5 ${
                  posStatus === 'open' ? 'text-emerald-500' :
                  posStatus === 'shadow' ? 'text-amber-400' :
                  posStatus === 'failed' ? 'text-red-400' : 'text-slate-500'
                }`}>
                  {posStatus === 'opening' && <Loader2 className="w-3 h-3 animate-spin" />}
                  {posStatus === 'open' && <MonitorCheck className="w-3 h-3" />}
                  {posStatus === 'shadow' && <MonitorCheck className="w-3 h-3" />}
                  {posStatus === 'failed' && <MonitorX className="w-3 h-3" />}
                  {posStatus === 'opening' && 'Opening table on SumUp POS…'}
                  {posStatus === 'open' && 'Table opened on SumUp POS'}
                  {posStatus === 'shadow' && 'Shadow mode — table opened on POS, close it manually'}
                  {posStatus === 'failed' && 'POS sync failed — open manually on terminal'}
                </div>
              )}

              {isCompleted && reservation.journey_started_at && reservation.journey_completed_at && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 pt-0.5">
                  <Clock className="w-3 h-3" />
                  Total visit: {formatDuration(
                    new Date(reservation.journey_completed_at).getTime() -
                    new Date(reservation.journey_started_at).getTime()
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
