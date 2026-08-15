/**
 * Refresh Cookie Configuration
 *
 * Single source of truth for the refresh token cookie's options. Every
 * place that sets or clears the refreshToken cookie (auth.controller.ts's
 * login/refresh/Google callback, broker.controller.ts's setupBroker, and
 * http-exception.filter.ts's poisoned-cookie cleanup) must use this so the
 * cookie's attributes can never drift out of sync between call sites —
 * previously broker.controller.ts hand-rolled its own copy with a
 * different sameSite value in development and a different path, and
 * auth.controller.ts's own logout() cleared the cookie with a path that
 * didn't match the path it was set with (clearCookie only works when the
 * path matches exactly what the browser stored the cookie under).
 *
 * sameSite: 'none' in production is REQUIRED, not a relaxed default — the
 * client (Vercel) and server (Render) are deployed on different
 * registrable domains, so the refresh cookie is inherently cross-site from
 * the browser's perspective. 'lax' or 'strict' would simply never be sent
 * on the fetch/XHR calls the SPA makes to the API, breaking token refresh
 * entirely. 'none' requires `secure: true`, which production already sets.
 * See DECISIONS.md for the full CSRF risk analysis this implies and how
 * it's mitigated (a required custom header on POST /auth/refresh, enforced
 * in auth.controller.ts, forces a CORS preflight that only the whitelisted
 * CORS_ORIGIN can pass).
 *
 * path: '/' (not narrowed to '/api/v1/auth') is also a deliberate choice,
 * not an oversight — an earlier attempt narrowed it and had to be reverted
 * (see STATUS.md, Sprint 4: "Refresh cookie path: Changed from
 * /api/v1/auth to / for broader cookie accessibility"). Re-narrowing it
 * without knowing exactly what that broke risks reintroducing the same
 * bug, so this audit fixes the *inconsistency* (every call site now uses
 * this single definition) rather than re-litigating the path value itself.
 */

export function getRefreshCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: (process.env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  };
}

/**
 * Options for clearing the refresh cookie. Must specify the same `path`
 * the cookie was originally set with, or the browser won't recognize it
 * as the same cookie and won't actually clear it — `secure`/`sameSite`
 * are not required to match for a clear to succeed, but path is.
 */
export function getClearRefreshCookieOptions() {
  return { path: getRefreshCookieOptions().path };
}
