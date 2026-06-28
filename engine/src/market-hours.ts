/**
 * Market Hours Utility
 *
 * Nebula market schedule for the engine.
 * Market is CLOSED daily from 12:00 AM to 1:00 AM Nepal time
 * for daily settlement (previousClose reset, unhalt stocks).
 * Market is OPEN at all other times — 24/7 trading outside the settlement window.
 *
 * All time display uses Asia/Kathmandu timezone.
 */

import { toZonedTime } from 'date-fns-tz';
import { getHours, getMinutes } from 'date-fns';

const TIMEZONE = process.env.NEPAL_TIMEZONE || 'Asia/Kathmandu';

const SETTLEMENT_START_HOUR = 0;  // 12:00 AM
const SETTLEMENT_START_MINUTE = 0;
const SETTLEMENT_END_HOUR = 1;    // 1:00 AM
const SETTLEMENT_END_MINUTE = 0;

/**
 * Converts a UTC date to Nepal timezone.
 */
export function toNepalTime(date: Date = new Date()): Date {
  return toZonedTime(date, TIMEZONE);
}

/**
 * Returns true if the market is currently open.
 *
 * Market is CLOSED daily 12:00 AM – 1:00 AM Nepal time for settlement.
 * During this window the engine stops publishing price ticks.
 */
export function isMarketOpen(): boolean {
  const nowNepal = toNepalTime(new Date());
  const hour = getHours(nowNepal);
  const minute = getMinutes(nowNepal);

  const currentMinutes = hour * 60 + minute;
  const settlementStart = SETTLEMENT_START_HOUR * 60 + SETTLEMENT_START_MINUTE;
  const settlementEnd = SETTLEMENT_END_HOUR * 60 + SETTLEMENT_END_MINUTE;

  if (currentMinutes >= settlementStart && currentMinutes < settlementEnd) {
    return false;
  }

  return true;
}