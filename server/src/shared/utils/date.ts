/**
 * Date Utility Functions
 *
 * Centralized date/time operations for the entire server.
 * All market-related and business logic uses Asia/Kathmandu timezone —
 * never UTC, never the server's local timezone.
 *
 * Timestamps are stored as UTC in PostgreSQL (Prisma default).
 * These utilities convert to Nepal time only for business rule evaluation
 * (market hours, weekly cap reset, trading day checks) and display formatting.
 */

import { startOfWeek, format, getHours, getMinutes } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

export const NEPAL_TIMEZONE = 'Asia/Kathmandu';

// Daily settlement window: market closes for 1 hour to reset previousClose
// and unhalt all stocks. During this window, no trading is allowed.
export const SETTLEMENT_START_HOUR = 0;  // 12:00 AM Nepal time
export const SETTLEMENT_START_MINUTE = 0;
export const SETTLEMENT_END_HOUR = 1;    // 1:00 AM Nepal time
export const SETTLEMENT_END_MINUTE = 0;

/**
 * Converts a UTC date to Nepal timezone-aware date object.
 * Use for display formatting and business rule evaluation.
 */
export function toNepalTime(date: Date | string | number): Date {
  return toZonedTime(date, NEPAL_TIMEZONE);
}

/**
 * Converts a Nepal time date to UTC.
 * Use when storing user-provided Nepal time values.
 */
export function fromNepalTime(date: Date | string | number): Date {
  return fromZonedTime(date, NEPAL_TIMEZONE);
}

/**
 * Returns the start of the current week in Nepal time (Monday 00:00 Asia/Kathmandu).
 * Used for weekly top-up cap reset calculation.
 * DB is the source of truth — never Redis TTL.
 */
export function getStartOfWeekNepal(date: Date = new Date()): Date {
  return startOfWeek(toNepalTime(date), { weekStartsOn: 1 });
}

/**
 * Checks if the market is currently open based on Nepal time.
 *
 * Market is CLOSED daily from 12:00 AM to 1:00 AM Nepal time
 * for daily settlement (previousClose reset, unhalt stocks).
 * Market is OPEN at all other times — 24/7 trading outside the settlement window.
 *
 * Does NOT account for holidays — that's a future enhancement.
 */
export function isMarketOpenNow(): boolean {
  const nowNepal = toNepalTime(new Date());
  const hour = getHours(nowNepal);
  const minute = getMinutes(nowNepal);

  // Convert to minutes since midnight for easy comparison
  const currentMinutes = hour * 60 + minute;
  const settlementStart = SETTLEMENT_START_HOUR * 60 + SETTLEMENT_START_MINUTE; // 0
  const settlementEnd = SETTLEMENT_END_HOUR * 60 + SETTLEMENT_END_MINUTE;       // 60

  // Closed during settlement window: 12:00 AM – 1:00 AM
  if (currentMinutes >= settlementStart && currentMinutes < settlementEnd) {
    return false;
  }

  return true;
}

/**
 * Formats a date to Nepal time string for display.
 */
export function formatNepalTime(date: Date | string | number, fmt: string = 'yyyy-MM-dd HH:mm:ss'): string {
  return format(toNepalTime(date), fmt);
}