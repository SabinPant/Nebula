/**
 * Rate Limit Configuration
 *
 * Centralized rate limit constants for all endpoints.
 * Every limit uses Redis storage via the ThrottlerModule — never in-memory.
 * Limits are applied at the route level using @Throttle() decorator.
 *
 * Reference: Architecture doc — Full Rate Limit Map (Sprint 1)
 */

export const RATE_LIMITS = {
  // Auth endpoints
  LOGIN: {
    limit: 5,
    ttl: 900_000, // 15 minutes in ms
  },
  REGISTER: {
    limit: 3,
    ttl: 3_600_000, // 1 hour in ms
  },
  FORGOT_PASSWORD: {
    limit: 3,
    ttl: 3_600_000, // 1 hour in ms
  },
  RESEND_VERIFICATION: {
    limit: 3,
    ttl: 3_600_000, // 1 hour in ms
  },

  // Trading
  ORDERS: {
    limit: 10,
    ttl: 60_000, // 1 minute in ms
  },

  // AI
  AI_QUERY: {
    limit: 2,
    ttl: 86_400_000, // 24 hours in ms
  },

  // Global fallback
  GLOBAL: {
    limit: 100,
    ttl: 60_000, // 1 minute in ms
  },
} as const;