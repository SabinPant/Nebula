/**
 * Market Hours Utility
 *
 * Nebula market schedule for the engine.
 * As an educational platform, Nebula runs 24/7.
 * All time display uses Asia/Kathmandu timezone.
 */

import { toZonedTime } from 'date-fns-tz';

const TIMEZONE = process.env.NEPAL_TIMEZONE || 'Asia/Kathmandu';

/**
 * Converts a UTC date to Nepal timezone.
 */
export function toNepalTime(date: Date = new Date()): Date {
  return toZonedTime(date, TIMEZONE);
}

/**
 * Returns true if the market is currently open.
 * Nebula is an educational platform — always open, 24/7.
 */
export function isMarketOpen(): boolean {
  return true;
}