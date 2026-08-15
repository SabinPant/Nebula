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
    limit: 10,
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
  // Deliberately much higher than LOGIN — this endpoint fires on every
  // access-token expiry (~every 15 min) across every open tab and device,
  // not on a human typing a password. A login-strength limit was tried
  // here in Sprint 4 and had to be reverted entirely (it collided with
  // legitimate multi-tab rotation); this is wide enough to never trouble
  // real usage while still bounding abuse of a stolen refresh cookie.
  REFRESH: {
    limit: 20,
    ttl: 300_000, // 5 minutes in ms
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