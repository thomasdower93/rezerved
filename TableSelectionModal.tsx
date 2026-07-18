import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Users, Calendar, Clock } from 'lucide-react';
import { TableAvailability } from '../lib/types';
import { Button } from './Button';
import { createTableHold, createJoinedTableHolds, releaseHoldGroup } from '../services/holds';
import { parseDateTime, addMinutes, matchesPartySize } from '../lib/utils';
import { SLOT_MINUTES } from '../lib/constants';

interface TableSelectionModalProps {
  table: TableAvailability;
  partySize: number;
  requestedDate: string;
  requestedTime: string;
  restaurantId: string;
  onClose: () => void;
  onConfirm: (tableId: string, time: string, holdToken?: string, expiresAt?: string, holdGroupToken?: string) => void;
}

export function TableSelectionModal({
  table,
  partySize,
  requestedDate,
  requestedTime,
  restaurantId,
  onClose,
  onConfirm,
}: TableSelectionModalProps) {
  // For joined combos pre-loaded with a next-available time, start with that time selected
  const initialTime = (!!table.selectedCombination && table.alternativeTime) ? table.alternativeTime : requestedTime;
  const [selectedTime, setSelectedTime] = useState(initialTime);
  const [hasSwitchedToAlternative, setHasSwitchedToAlternative] = useState(
    !!(table.selectedCombination && table.alternativeTime)
  );
  const [mounted, setMounted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [holdError, setHoldError] = useState<string>('');

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    setMounted(true);
    console.log('[TableSelectionModal] Mounted with table:', {
      name: table.name,
      status: table.status,
      hasAlternativeTime: !!table.alternativeTime,
      bestBeforeTime: table.bestBeforeTime,
      bestAfterTime: table.bestAfterTime,
      amberReason: table.amberReason,
      fullTable: table
    });
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const isJoinedCombo = !!table.selectedCombination;
  const effectiveCapacity = isJoinedCombo ? (table.selectedCombination!.combined_capacity) : table.capacity;
  const isEligible = isJoinedCombo ? partySize <= effectiveCapacity : matchesPartySize(table.capacity, partySize);
  const isAvailable = table.status === 'green' || isJoinedCombo;
  const hasAlternative = table.status === 'yellow' && table.alternativeTime;
  const isUnavailable = table.status === 'red' && isEligible && !isJoinedCombo;

  // Debug logging for joined validation (always log, not just DEV, to aid live troubleshooting)
  const joinedValidationResult = isJoinedCombo
    ? partySize <= effectiveCapacity ? 'VALID' : 'INVALID_OVER_CAPACITY'
    : matchesPartySize(table.capacity, partySize) ? 'VALID' : 'INVALID_SINGLE_TABLE';
  const joinedValidationReason = isJoinedCombo
    ? partySize > effectiveCapacity
      ? `Party ${partySize} exceeds combined capacity ${effectiveCapacity}`
      : `Party ${partySize} fits combined capacity ${effectiveCapacity}`
    : matchesPartySize(table.capacity, partySize)
      ? `Party ${partySize} fits single-table capacity ${table.capacity}`
      : `Party ${partySize} does not fit single-table capacity ${table.capacity} (accepts ${table.capacity - 1} or ${table.capacity})`;

  console.log('[JoinedValidation] selected option', isJoinedCombo ? 'joined_combo' : 'single_table');
  console.log('[JoinedValidation] partySize', partySize);
  console.log('[JoinedValidation] combinedCapacity', table.selectedCombination?.combined_capacity ?? 'n/a');
  console.log('[JoinedValidation] primaryTableCapacity', table.capacity);
  console.log('[JoinedValidation] validation result', joinedValidationResult);
  console.log('[JoinedValidation] rejection reason', joinedValidationReason);
  console.log('[JoinedValidation] canConfirm will be', isEligible && (isAvailable || isJoinedCombo));

  const formattedDate = new Date(requestedDate + 'T00:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const handleSwitchToAlternative = (time: string) => {
    setSelectedTime(time);
    setHasSwitchedToAlternative(true);
  };

  const handleConfirm = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setHoldError('');

    try {
      if (!isJoinedCombo && !matchesPartySize(table.capacity, partySize)) {
        console.error('[TableSelectionModal] CAPACITY MISMATCH:', {
          tableId: table.id,
          tableName: table.name,
          capacityUsed: table.capacity,
          partySize,
          statusReason: 'Capacity validation failed',
          rule: `Table capacity ${table.capacity} accepts party ${table.capacity - 1} or ${table.capacity}`,
        });
        setHoldError(`This table doesn't fit your party size (capacity: ${table.capacity})`);
        setIsSubmitting(false);
        return;
      }

      const startTime = parseDateTime(requestedDate, selectedTime);
      const endTime = addMinutes(startTime, SLOT_MINUTES);

      const sessionKey = sessionStorage.getItem('booking_session_key') || undefined;

      if (isJoinedCombo) {
        // Create one hold per table in the combination, linked by a shared group token
        const joinedTableIds = (table.selectedCombination!.tables || [])
          .map(t => t.id)
          .filter(id => id !== table.id);

        console.log('[TableSelectionModal] CREATING JOINED HOLDS:', {
          primaryTableId: table.id,
          joinedTableIds,
          partySize,
          requestedTime: selectedTime,
        });

        const holdResult = await createJoinedTableHolds(
          restaurantId,
          table.id,
          joinedTableIds,
          startTime,
          endTime,
          partySize,
          undefined,
          sessionKey
        );

        console.log('[TableSelectionModal] JOINED HOLD RESULT:', {
          success: holdResult.success,
          error: holdResult.error,
          primaryHoldToken: holdResult.primaryHoldToken,
          holdGroupToken: holdResult.holdGroupToken,
        });

        if (!holdResult.success) {
          const friendlyMessage =
            holdResult.error === 'TABLE_UNAVAILABLE'
              ? 'One or more tables in this combination are already booked.'
              : holdResult.error === 'TABLE_HELD'
              ? 'One or more tables are temporarily held by another guest.'
              : holdResult.message || 'Failed to hold tables. Please try again.';

          setHoldError(friendlyMessage);
          setIsSubmitting(false);
          return;
        }

        await onConfirm(
          table.id,
          selectedTime,
          holdResult.primaryHoldToken,
          holdResult.expires_at,
          holdResult.holdGroupToken
        );
        return;
      }

      console.log('[TableSelectionModal] CREATING HOLD:', {
        tableId: table.id,
        tableName: table.name,
        capacityUsed: table.capacity,
        partySize,
        requestedTime: selectedTime,
        sessionKey,
        statusReason: 'Attempting hold creation',
      });

      const holdResult = await createTableHold(
        restaurantId,
        table.id,
        startTime,
        endTime,
        partySize,
        undefined,
        sessionKey
      );

      console.log('[TableSelectionModal] HOLD RESULT:', {
        success: holdResult.success,
        error: holdResult.error,
        message: holdResult.message,
        tableId: table.id,
        tableName: table.name,
      });

      if (!holdResult.success) {
        const friendlyMessage =
          holdResult.error === 'TABLE_UNAVAILABLE'
            ? 'Already booked for your selected time.'
            : holdResult.error === 'TABLE_HELD'
            ? 'Temporarily held by another guest.'
            : holdResult.error === 'CAPACITY_MISMATCH'
            ? `Doesn't fit your party size.`
            : holdResult.message || 'Failed to secure table. Please try again.';

        setHoldError(friendlyMessage);
        setIsSubmitting(false);
        return;
      }

      await onConfirm(table.id, selectedTime, holdResult.hold_token, holdResult.expires_at);
    } catch (error) {
      console.error('[TableSelectionModal] Booking failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'An error occurred. Please try again.';
      setHoldError(errorMessage);
      setIsSubmitting(false);
    }
  };

  const canConfirm = isEligible && (isAvailable || hasSwitchedToAlternative || isJoinedCombo) && !isSubmitting;

  if (!mounted) return null;

  const modalContent = (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-[99999] transition-opacity duration-200"
        style={{ animation: 'fadeIn 200ms ease-out' }}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[100000] w-[min(520px,calc(100vw-24px))] max-h-[90vh] overflow-y-auto rounded-xl bg-app-bg-secondary shadow-2xl"
        style={{ animation: 'modalSlideIn 200ms ease-out' }}
      >
        <div className="sticky top-0 bg-app-bg-secondary border-b border-app-border px-6 py-4 flex items-center justify-between rounded-t-xl">
          <h2 id="modal-title" className="text-xl font-semibold text-app-text">Confirm Table Selection</h2>
          <button
            onClick={onClose}
            className="text-app-text-tertiary hover:text-app-text-secondary transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-6 space-y-6">
          <div className="bg-app-bg-tertiary rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-app-text">
                  {isJoinedCombo
                    ? (table.selectedCombination!.tables || []).map(t => t.name).join(' + ') || table.name
                    : table.name}
                </div>
                <div className="text-sm text-app-text-secondary flex items-center gap-1 mt-1">
                  <Users className="w-4 h-4" />
                  {isJoinedCombo
                    ? `Combined capacity: ${effectiveCapacity} seats`
                    : `Capacity: ${table.capacity} ${table.capacity === 1 ? 'seat' : 'seats'}`}
                </div>
                {isJoinedCombo && (
                  <div className="text-xs text-app-text-tertiary mt-0.5">Joined tables</div>
                )}
              </div>
              <div className="flex gap-1 flex-wrap max-w-[120px] justify-end">
                {Array.from({ length: Math.min(effectiveCapacity, 12) }).map((_, i) => (
                  <div
                    key={i}
                    className="w-2.5 h-2.5 rounded-full bg-app-accent"
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-app-text">
              <Users className="w-5 h-5 text-app-text-tertiary" />
              <span>Party size: {partySize}</span>
            </div>
            <div className="flex items-center gap-2 text-app-text">
              <Calendar className="w-5 h-5 text-app-text-tertiary" />
              <span>{formattedDate}</span>
            </div>
            <div className="flex items-center gap-2 text-app-text">
              <Clock className="w-5 h-5 text-app-text-tertiary" />
              <span>{selectedTime}</span>
            </div>
          </div>

          {!isEligible && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              {isJoinedCombo ? (
                <>
                  <p className="text-sm text-red-800 dark:text-red-200">
                    This joined table setup cannot seat that party size.
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-300 mt-1">
                    Combined capacity {effectiveCapacity} — your party of {partySize} exceeds this.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-red-800 dark:text-red-200">
                    This table doesn't fit your party size.
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-300 mt-1">
                    Capacity {table.capacity} accepts parties of {table.capacity - 1} or {table.capacity}.
                  </p>
                </>
              )}
            </div>
          )}

          {isEligible && isAvailable && !holdError && (
            <div className="rounded-lg p-4" style={{ background: 'rgba(52,110,72,0.12)', border: '1px solid rgba(80,160,100,0.28)' }}>
              <p className="text-sm font-medium" style={{ color: 'rgba(100,185,130,0.90)' }}>
                This table is available at your requested time.
              </p>
            </div>
          )}

          {isEligible && hasAlternative && !hasSwitchedToAlternative && !holdError && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 space-y-3">
              <p className="text-sm text-amber-900 dark:text-amber-200 font-medium">
                {table.detailed_reason === 'held_by_other' && (
                  <>
                    Temporarily held by another guest.
                    {table.hold_expires_at && (
                      <span className="block text-xs mt-1 text-amber-700 dark:text-amber-300">
                        Hold expires at {new Date(table.hold_expires_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </>
                )}
                {table.detailed_reason === 'booked_conflict' && 'Already booked for your selected time.'}
                {!table.detailed_reason && table.amberReason === 'held' && 'Temporarily held by another guest.'}
                {!table.detailed_reason && table.amberReason !== 'held' && 'Not available at your selected time.'}
              </p>
              <p className="text-sm text-amber-800 dark:text-amber-300">
                Try these times instead:
              </p>
              <div className="space-y-2">
                {table.alternative_times && table.alternative_times.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {table.alternative_times.slice(0, 6).map((alt, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSwitchToAlternative(alt.time)}
                        className="bg-app-bg-secondary hover:bg-app-bg-tertiary text-app-text border-2 border-amber-300 hover:border-amber-400 rounded-lg px-3 py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500"
                      >
                        <div className="text-center">
                          <span className="text-sm font-semibold text-app-text">{alt.time}</span>
                          <span className="block text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                            {alt.distance > 0 ? `+${alt.distance}` : alt.distance} min
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <>
                    {table.bestBeforeTime && (
                      <button
                        onClick={() => handleSwitchToAlternative(table.bestBeforeTime!)}
                        className="w-full bg-app-bg-secondary hover:bg-app-bg-tertiary text-app-text border-2 border-amber-300 rounded-lg px-4 py-3 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 min-h-[56px]"
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="text-base font-semibold text-app-text">{table.bestBeforeTime}</span>
                          <span className="text-sm font-medium text-amber-700">
                            {table.bestBeforeDeltaMins} min earlier
                          </span>
                        </div>
                      </button>
                    )}
                    {table.bestAfterTime && (
                      <button
                        onClick={() => handleSwitchToAlternative(table.bestAfterTime!)}
                        className="w-full bg-app-bg-secondary hover:bg-app-bg-tertiary text-app-text border-2 border-amber-300 rounded-lg px-4 py-3 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 min-h-[56px]"
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="text-base font-semibold text-app-text">{table.bestAfterTime}</span>
                          <span className="text-sm font-medium text-amber-700">
                            {table.bestAfterDeltaMins} min later
                          </span>
                        </div>
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {isEligible && hasAlternative && hasSwitchedToAlternative && !holdError && (
            <div className="rounded-lg p-4" style={{ background: 'rgba(52,110,72,0.12)', border: '1px solid rgba(80,160,100,0.28)' }}>
              <p className="text-sm font-medium" style={{ color: 'rgba(100,185,130,0.90)' }}>
                Table is available at {selectedTime}.
              </p>
            </div>
          )}

          {isEligible && isUnavailable && !holdError && (
            <div className="bg-gray-50 dark:bg-gray-800/20 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <p className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                {table.detailed_reason === 'held_by_other' && 'Temporarily held by another guest'}
                {table.detailed_reason === 'booked_conflict' && 'Already booked for your selected time'}
                {table.detailed_reason === 'no_alternatives' && 'No available times within the next 2 hours'}
                {!table.detailed_reason && 'This table is unavailable at the selected time'}
              </p>
              {table.detailed_reason === 'held_by_other' && (
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                  Try again in a few minutes or select a different table.
                  {table.hold_expires_at && (
                    <span className="block mt-1">
                      Hold expires at {new Date(table.hold_expires_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </p>
              )}
              {table.detailed_reason === 'booked_conflict' && (
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                  This time slot is fully booked. Please select a different table or time.
                </p>
              )}
              {table.reason && !table.detailed_reason && (
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{table.reason}</p>
              )}
            </div>
          )}

          {holdError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 space-y-3">
              <p className="text-sm text-red-800 dark:text-red-200 font-medium">
                {holdError}
              </p>
              {(table.alternative_times && table.alternative_times.length > 0) && (
                <>
                  <p className="text-sm text-red-700 dark:text-red-300">
                    Try these alternative times:
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {table.alternative_times.slice(0, 4).map((alt, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setHoldError('');
                          handleSwitchToAlternative(alt.time);
                        }}
                        className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-app-text border-2 border-red-300 hover:border-red-400 rounded-lg px-3 py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                      >
                        <div className="text-center">
                          <span className="text-sm font-semibold text-app-text">{alt.time}</span>
                          <span className="block text-xs text-red-600 dark:text-red-400 mt-0.5">
                            {alt.distance > 0 ? `+${alt.distance}` : alt.distance} min
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-app-bg-secondary border-t border-app-border px-6 py-4 flex gap-3">
          <Button
            onClick={onClose}
            variant="outline"
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="flex-1 bg-app-accent hover:bg-app-accent/90 text-white disabled:bg-gray-300 disabled:cursor-not-allowed font-semibold shadow-sm"
          >
            {isSubmitting ? 'Processing...' : 'Confirm Booking'}
          </Button>
        </div>
      </div>
    </>
  );

  if (typeof document === 'undefined') return null;

  return createPortal(modalContent, document.body);
}
