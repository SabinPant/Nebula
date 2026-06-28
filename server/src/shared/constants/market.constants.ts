/**
 * Market Constants
 *
 * Centralized business constants for the trading platform.
 * Values that are fixed business rules — not environment configuration.
 * Changing these requires a code change, which is intentional:
 * business rules should be version-controlled, not tweaked via env vars.
 */

export const MARKET_CONSTANTS = {
  /** Initial virtual balance for new traders in paise (Rs. 50,000) */
  INITIAL_VIRTUAL_BALANCE_PAISE: 5_000_000,

  /** Maximum weekly top-up per trader in paise (Rs. 5,00,000) */
  WEEKLY_TOPUP_CAP_PAISE: 50_000_000,

  /** Maximum shares per order */
  ORDER_MAX_QUANTITY: 100_000,

  /** Maximum price for LIMIT orders in paise (Rs. 100,000) */
  ORDER_MAX_PRICE_PAISE: 10_000_000,

  /** Minimum price for LIMIT orders in paise (Rs. 0.01) */
  ORDER_MIN_PRICE_PAISE: 1,

  /** Maximum orders per user per day */
  DAILY_ORDER_CAP: 50,

  /** Simulation tick interval in milliseconds */
  SIMULATION_TICK_INTERVAL_MS: 5_000,

  /** Circuit breaker percentage (±10% from previousClose) */
  CIRCUIT_BREAKER_PERCENT: 0.1,
} as const;