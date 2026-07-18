import { SLOT_MINUTES, TOKEN_EXPIRY_DAYS, DEFAULT_DURATION_MINUTES } from './constants';
import { Restaurant, DayHours } from './types';

/** Format a duration in minutes to a human-readable string, e.g. "1 hour 30 minutes", "2 hours", "45 minutes" */
export function formatDuration(minutes: number): string {
  const m = Math.max(1, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${m} minute${m !== 1 ? 's' : ''}`;
  if (rem === 0) return `${h} hour${h !== 1 ? 's' : ''}`;
  return `${h} hour${h !== 1 ? 's' : ''} ${rem} minute${rem !== 1 ? 's' : ''}`;
}

/** Return the reservation duration in minutes, falling back safely */
export function getReservationDuration(reservationDurationMinutes?: number | null): number {
  return (reservationDurationMinutes && reservationDurationMinutes > 0)
    ? reservationDurationMinutes
    : DEFAULT_DURATION_MINUTES;
}

export function parseDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00`);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}

export function formatTime(date: Date): string {
  return date.toTimeString().slice(0, 5);
}

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDateTime(date: Date): string {
  return date.toISOString();
}

export function generateManageToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function getTokenExpiry(): Date {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + TOKEN_EXPIRY_DAYS);
  return expiry;
}

export function checkOverlap(
  start1: Date,
  end1: Date,
  start2: Date,
  end2: Date
): boolean {
  return !(end1 <= start2 || start1 >= end2);
}

export function getDayOfWeek(date: Date): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[date.getDay()];
}

export function isValidTimeSlot(
  startTime: Date,
  openTime: string,
  closeTime: string,
  lastBookingTime?: string
): boolean {
  const endTime = addMinutes(startTime, SLOT_MINUTES);

  const todayDateStr = formatDate(startTime);
  const openDateTime = new Date(`${todayDateStr}T${openTime}:00`);
  const closeDateTime = new Date(`${todayDateStr}T${closeTime}:00`);

  if (startTime < openDateTime) {
    return false;
  }

  if (endTime > closeDateTime) {
    return false;
  }

  // Respect last_booking_time: start must be at or before it
  if (lastBookingTime) {
    const lastBookingDateTime = new Date(`${todayDateStr}T${lastBookingTime}:00`);
    if (startTime > lastBookingDateTime) {
      return false;
    }
  } else {
    // Without last_booking_time, enforce the slot fits before close
    const latestStart = addMinutes(closeDateTime, -SLOT_MINUTES);
    if (startTime > latestStart) {
      return false;
    }
  }

  return true;
}

export function formatOpeningHoursForDate(restaurant: Restaurant, dateStr?: string): string {
  const date = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  const dayOfWeek = getDayOfWeek(date);
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });

  const hours = restaurant.opening_hours;
  if (!hours || Object.keys(hours).length === 0) {
    return 'Opening hours unavailable';
  }

  const dayHours: DayHours | undefined = hours[dayOfWeek];

  if (!dayHours || dayHours.closed) {
    return `Closed ${dayName}`;
  }

  const base = `Open ${dayName}: ${dayHours.open}–${dayHours.close}`;
  if (dayHours.last_booking) {
    return `${base} · Last booking ${dayHours.last_booking}`;
  }
  return base;
}

export function getTodayOpeningHours(openingHours: Restaurant['opening_hours']): DayHours | null {
  if (!openingHours) {
    return null;
  }

  const date = new Date();
  const dayOfWeek = getDayOfWeek(date);
  const dayHours: DayHours | undefined = openingHours[dayOfWeek];

  if (!dayHours) {
    return null;
  }

  return dayHours;
}

/**
 * Checks if a table with a given capacity can accommodate a party of a given size.
 *
 * CAPACITY MATCHING RULE:
 * A table with capacity C accepts a party of size P if and only if:
 *   P == C OR P == (C - 1)
 *
 * Equivalent to: (C - 1) <= P <= C
 *
 * Examples:
 * - Capacity 4 → allows party 3 or 4
 * - Capacity 6 → allows party 5 or 6
 * - Capacity 2 → allows party 1 or 2
 * - Party 3 on capacity 6 → NOT allowed
 *
 * @param capacity - The table's seating capacity
 * @param partySize - The size of the party
 * @returns true if the table can accommodate the party, false otherwise
 */
export function matchesPartySize(capacity: number, partySize: number): boolean {
  if (!capacity || !partySize) return false;
  return partySize >= (capacity - 1) && partySize <= capacity;
}

/**
 * Checks if a given date/time is in the past.
 *
 * @param date - The date string in YYYY-MM-DD format
 * @param time - The time string in HH:MM format
 * @param bufferMinutes - Optional buffer in minutes to consider (default: 0)
 * @returns true if the date/time is in the past (plus buffer), false otherwise
 */
export function isInPast(date: string, time: string, bufferMinutes: number = 0): boolean {
  try {
    const requestedDateTime = parseDateTime(date, time);
    if (isNaN(requestedDateTime.getTime())) {
      return false;
    }

    const now = new Date();
    const threshold = addMinutes(now, bufferMinutes);

    return requestedDateTime < threshold;
  } catch (error) {
    console.error('[isInPast] Error checking date/time:', error);
    return false;
  }
}

/**
 * Gets the minimum valid date (today).
 *
 * @returns Date string in YYYY-MM-DD format
 */
export function getMinDate(): string {
  return formatDate(new Date());
}

/**
 * Gets the minimum valid time for a given date.
 * If the date is today, returns the next available 15-minute slot.
 * Otherwise, returns null (no time restriction).
 *
 * @param date - The date string in YYYY-MM-DD format
 * @returns Time string in HH:MM format, or null if no restriction
 */
export function getMinTime(date: string): string | null {
  const today = formatDate(new Date());

  if (date !== today) {
    return null;
  }

  const now = new Date();
  const minutes = now.getUTCMinutes();
  const roundedMinutes = Math.ceil(minutes / 15) * 15;

  const nextSlot = new Date(now);
  nextSlot.setUTCMinutes(roundedMinutes);
  nextSlot.setUTCSeconds(0);
  nextSlot.setUTCMilliseconds(0);

  if (roundedMinutes >= 60) {
    nextSlot.setUTCHours(nextSlot.getUTCHours() + 1);
    nextSlot.setUTCMinutes(0);
  }

  const hours = nextSlot.getUTCHours();
  const mins = nextSlot.getUTCMinutes();
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Sanitizes a date/time pair to ensure it's not in the past.
 * Returns corrected date/time or the original if valid.
 *
 * @param date - The date string in YYYY-MM-DD format
 * @param time - The time string in HH:MM format
 * @returns Object with sanitized date and time
 */
export function sanitizeDateTime(date: string, time: string): { date: string; time: string; wasCorrected: boolean } {
  const minDate = getMinDate();
  let correctedDate = date;
  let correctedTime = time;
  let wasCorrected = false;

  if (date < minDate) {
    correctedDate = minDate;
    wasCorrected = true;
  }

  if (correctedDate === minDate) {
    const minTime = getMinTime(minDate);
    if (minTime && time < minTime) {
      correctedTime = minTime;
      wasCorrected = true;
    }
  }

  return { date: correctedDate, time: correctedTime, wasCorrected };
}

/**
 * Enhanced types for table status determination
 */
export type TableStatusType =
  | 'available'
  | 'held_by_me'
  | 'held_by_other'
  | 'booked'
  | 'capacity_mismatch'
  | 'past_time'
  | 'outside_hours';

export interface TableStatusResult {
  status: TableStatusType;
  reason: string;
  canSelect: boolean;
}

/**
 * SINGLE SOURCE OF TRUTH: Determines table status
 *
 * @param capacity - Table capacity
 * @param partySize - Party size
 * @param dateTime - Requested date/time
 * @param isBooked - Whether table has a reservation conflict
 * @param isHeld - Whether table has a hold conflict
 * @param isHeldByMe - Whether the current user/session holds it
 * @param isWithinHours - Whether time is within restaurant hours
 * @returns Detailed status with reason
 */
export function getTableStatus(
  capacity: number,
  partySize: number,
  dateTime: Date,
  isBooked: boolean,
  isHeld: boolean,
  isHeldByMe: boolean,
  isWithinHours: boolean
): TableStatusResult {
  // Check past time first
  if (isInPast(formatDate(dateTime), formatTime(dateTime), 15)) {
    return {
      status: 'past_time',
      reason: 'This time is in the past',
      canSelect: false,
    };
  }

  // Check capacity match
  if (!matchesPartySize(capacity, partySize)) {
    return {
      status: 'capacity_mismatch',
      reason: `Doesn't fit your party size`,
      canSelect: false,
    };
  }

  // Check if within operating hours
  if (!isWithinHours) {
    return {
      status: 'outside_hours',
      reason: 'Outside restaurant hours',
      canSelect: false,
    };
  }

  // Check if held by current user/session
  if (isHeldByMe) {
    return {
      status: 'held_by_me',
      reason: 'Held by you',
      canSelect: true,
    };
  }

  // Check if held by someone else
  if (isHeld) {
    return {
      status: 'held_by_other',
      reason: 'Temporarily held by another guest',
      canSelect: false,
    };
  }

  // Check if booked
  if (isBooked) {
    return {
      status: 'booked',
      reason: 'Already booked',
      canSelect: false,
    };
  }

  // Available!
  return {
    status: 'available',
    reason: 'Available',
    canSelect: true,
  };
}

export interface BookingLimitViolation {
  type: 'notice' | 'party_size';
  message: string;
}

/**
 * Returns a violation if the requested time is inside the restaurant's minimum
 * booking notice window, or null if the time is acceptable.
 *
 * @param date        - Booking date in YYYY-MM-DD format
 * @param time        - Booking time in HH:MM format
 * @param noticeMinutes - Restaurant's minimum_booking_notice_minutes (0 = no restriction)
 */
export function checkMinimumNotice(
  date: string,
  time: string,
  noticeMinutes: number
): BookingLimitViolation | null {
  if (!noticeMinutes || noticeMinutes <= 0) return null;

  const bookingTime = parseDateTime(date, time);
  const earliest = addMinutes(new Date(), noticeMinutes);

  if (bookingTime < earliest) {
    const hours = Math.floor(noticeMinutes / 60);
    const mins = noticeMinutes % 60;
    const label =
      hours > 0 && mins === 0
        ? `${hours} hour${hours > 1 ? 's' : ''}`
        : hours > 0
        ? `${hours} hour${hours > 1 ? 's' : ''} ${mins} minutes`
        : `${mins} minutes`;
    return {
      type: 'notice',
      message: `This restaurant requires at least ${label} notice for online bookings. Please choose a later time or contact the restaurant directly.`,
    };
  }

  return null;
}

/**
 * Returns a violation if the party size exceeds the restaurant's max online
 * party size, or null if the size is acceptable.
 *
 * @param partySize       - Requested party size
 * @param maxOnlineParty  - Restaurant's max_online_party_size (null = no restriction)
 */
export function checkMaxPartySize(
  partySize: number,
  maxOnlineParty: number | null | undefined
): BookingLimitViolation | null {
  if (maxOnlineParty == null) return null;
  if (partySize <= maxOnlineParty) return null;

  return {
    type: 'party_size',
    message: `For parties larger than ${maxOnlineParty}, please contact the restaurant directly.`,
  };
}

/**
 * Runs both booking-limit checks and returns the first violation found, or null.
 */
export function checkBookingLimits(
  date: string,
  time: string,
  partySize: number,
  noticeMinutes: number,
  maxOnlineParty: number | null | undefined
): BookingLimitViolation | null {
  return (
    checkMinimumNotice(date, time, noticeMinutes) ??
    checkMaxPartySize(partySize, maxOnlineParty) ??
    null
  );
}

/** Human-readable label for a minimum_booking_notice_minutes value. */
export function formatNoticeLabel(minutes: number): string {
  if (minutes === 0) return 'No minimum';
  if (minutes < 60) return `${minutes} minutes`;
  const h = minutes / 60;
  return `${h} hour${h !== 1 ? 's' : ''}`;
}
