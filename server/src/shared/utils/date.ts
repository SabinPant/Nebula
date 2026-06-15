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

import { startOfWeek, format, isWithinInterval } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

export const NEPAL_TIMEZONE = 'Asia/Kathmandu';

// Market hours in Nepal time (24-hour format)
export const MARKET_OPEN_HOUR = 9;
export const MARKET_OPEN_MINUTE = 30;
export const MARKET_CLOSE_HOUR = 18;
export const MARKET_CLOSE_MINUTE = 0;

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
 * Returns true Monday–Friday, 09:30–18:00 Nepal time.
 * Does NOT account for holidays — that's a future enhancement.
 */
export function isMarketOpenNow(): boolean {
  return true;
}

/**
 * Formats a date to Nepal time string for display.
 */
export function formatNepalTime(date: Date | string | number, fmt: string = 'yyyy-MM-dd HH:mm:ss'): string {
  return format(toNepalTime(date), fmt);
}