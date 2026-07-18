// Legacy slot size kept for isValidTimeSlot last-booking boundary checks only
export const SLOT_MINUTES = 75;

// Fallback duration used when no restaurant booking settings exist and no stored duration is present
// Per spec: if no booking settings exist, fallback is 120 minutes
export const DEFAULT_DURATION_MINUTES = 120;

// Window for yellow availability suggestions (minutes before/after requested time)
export const CLOSE_WINDOW_MINUTES = 45;

// Token expiry duration (30 days)
export const TOKEN_EXPIRY_DAYS = 30;

// Time format for display
export const TIME_FORMAT = 'HH:mm';
export const DATE_FORMAT = 'yyyy-MM-dd';
export const DATETIME_FORMAT = 'yyyy-MM-dd HH:mm';

// Feature Flags
export const USE_PREMIUM_CUSTOMER_MAP = true;
