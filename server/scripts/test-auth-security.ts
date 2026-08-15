/**
 * End-to-end Auth Security test — Sprint 14 (Security Hardening) Part 6.
 *
 * Not a Jest suite — drives the REAL running server's HTTP API with real
 * signed JWTs, same pattern as test-admin-flags.ts / test-admin-reassign-broker.ts.
 * Test fixtures are created directly via Prisma (same established convention
 * as every other test script in this repo — no HTTP registration ceremony
 * needed except for the one scenario that specifically requires it).
 *
 * Covers all 13 scenarios from the task, in an order chosen so no scenario's
 * side effects corrupt a later one (see the inline notes — the brute-force
 * section in particular MUST run last, since /auth/login's rate limit is
 * tracked per-IP, not per-account, so every earlier login in this script
 * shares the same budget):
 *
 *   1.  Login with wrong password -> 401 INVALID_CREDENTIALS
 *   2.  Login with correct password -> 200 with tokens
 *   3.  Access protected route with valid token -> 200
 *   4.  Access protected route with expired token -> 401
 *   5.  Access protected route with revoked (blacklisted) token -> 401
 *   6.  Access protected route with no token -> 401
 *   7.  Refresh with valid cookie -> new tokens
 *   8.  Refresh with invalid cookie -> 401
 *   9.  Logout -> token blacklisted
 *   10. Attempt to use blacklisted token -> 401 (same flow as #9)
 *   11. XSS attempt via displayName -> stored/returned safely, never
 *       executed (see inline reasoning — there is no server-side HTML
 *       render path for this field to begin with)
 *   12. SQL injection attempt via email -> rejected
 *   13. Login brute force -> rate limited after N attempts
 *
 * Plus two bonus sections covering this same sprint's other fixes, since
 * they're new, testable regressions the sprint introduced:
 *   14. CSRF header requirement on POST /auth/refresh
 *   15. ValidationPipe errors map to VALIDATION_ERROR with a string message
 *
 * Run with: npx tsx scripts/test-auth-security.ts (from server/)
 * Requires the server already running on TEST_SERVER_URL (default
 * http://localhost:3001/api/v1), Postgres + Redis reachable per
 * .env.development.
 */

import { PrismaClient, UserType } from '@prisma/client';
import jwt from 'jsonwebtoken';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { hashPassword } from '../src/shared/utils/crypto';
import { RATE_LIMITS } from '../src/core/config/rate-limit.config';

loadEnv({ path: path.resolve(__dirname, '..', '.env.development') });

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL!);

const SERVER_URL = process.env.TEST_SERVER_URL || 'http://localhost:3001/api/v1';
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const TEST_EMAIL_DOMAIN = 'auth-security-test.nebula';
const KNOWN_PASSWORD = 'ValidPass123!';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${message}`);
  } else {
    failed++;
    console.error(`  \x1b[31m✗\x1b[0m ${message}`);
  }
}

// ─── HTTP helpers ────────────────────────────────────────────────────────
// Raw fetch throughout, not axios — this script needs full control over
// individual response headers (Set-Cookie) and the ability to send a
// deliberately-missing X-Requested-With header, which a shared client
// wrapper would fight against.

interface ApiResult<T> {
  status: number;
  body: T;
  setCookies: string[];
}

async function apiCall<T>(
  method: string,
  urlPath: string,
  opts: { token?: string; body?: unknown; cookie?: string; skipCsrfHeader?: boolean } = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
  if (opts.cookie) headers['Cookie'] = opts.cookie;
  // Every real call this script makes to /auth/refresh should carry the
  // CSRF header, exactly like the real frontend does post-Sprint-14 — the
  // one deliberate exception is the "no header" scenario itself.
  if (urlPath === '/auth/refresh' && !opts.skipCsrfHeader) {
    headers['X-Requested-With'] = 'XMLHttpRequest';
  }

  const res = await fetch(`${SERVER_URL}${urlPath}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  return { status: res.status, body: json as T, setCookies };
}

/** Extracts just the "refreshToken=..." pair (up to the first ;) from a Set-Cookie line, for reuse as a Cookie header. */
function extractCookiePair(setCookies: string[], name: string): string | undefined {
  const line = setCookies.find((c) => c.startsWith(`${name}=`));
  return line?.split(';')[0];
}

// ─── Test fixture setup ────────────────────────────────────────────────────

interface TestUser {
  id: string;
  email: string;
}

async function createVerifiedTrader(label: string): Promise<TestUser> {
  const email = `${label}-${randomUUID().slice(0, 8)}@${TEST_EMAIL_DOMAIN}`;
  const hashed = await hashPassword(KNOWN_PASSWORD);
  const user = await prisma.user.create({
    data: {
      email,
      password: hashed,
      userType: UserType.TRADER,
      displayName: `Auth Security Test ${label}`,
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
      isOnboardingComplete: true,
      isFirstLogin: false,
    },
  });
  return { id: user.id, email };
}

async function login(email: string, password: string) {
  const deviceId = randomUUID();
  const result = await apiCall<{ accessToken?: string; user?: unknown; code?: string }>(
    'POST',
    '/auth/login',
    { body: { email, password, deviceId } },
  );
  return { ...result, deviceId };
}

// ─── Cleanup ─────────────────────────────────────────────────────────────

async function purgeTestData(): Promise<void> {
  const testUsers = await prisma.user.findMany({
    where: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } },
    select: { id: true },
  });
  const userIds = testUsers.map((u) => u.id);
  if (userIds.length === 0) return;

  // The XSS-test fixture goes through the REAL POST /auth/register, which
  // creates User + Wallet + an initial-deposit Transaction atomically
  // (CLAUDE.md's wallet-creation rule) — unlike this script's other
  // Prisma-direct fixtures. Transaction -> Wallet -> User is the required
  // FK-safe delete order (same class of fix as test-engine-health-gate.ts's
  // Sprint 10 cleanup bug, documented in STATUS.md).
  const wallets = await prisma.wallet.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  const walletIds = wallets.map((w) => w.id);
  if (walletIds.length > 0) {
    await prisma.transaction.deleteMany({ where: { walletId: { in: walletIds } } });
    await prisma.wallet.deleteMany({ where: { id: { in: walletIds } } });
  }
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  console.log(`  Purged ${userIds.length} leftover test user(s)`);
}

/**
 * Resets the shared per-IP /auth/login throttle bucket so this script can
 * be run twice in a row within the same 15-minute window (this codebase's
 * own established "run twice, N/N both times" convention — see every
 * other test-admin-*.ts script). Without this, scenario #13's own
 * brute-force section deliberately drives the bucket past its limit and
 * leaves it there for the rest of the TTL, since there's no "un-rate-limit"
 * action — a second run within that window would find EVERY earlier
 * login-dependent scenario 429ing instead of exercising the behavior
 * under test, since the limit is tracked by IP (127.0.0.1, here), not
 * by account, and every login call in this entire script shares one bucket.
 *
 * ThrottlerRedisStorage (core/config/throttler-redis.storage.ts) stores
 * each bucket as a plain string key — no readable prefix, since the key
 * itself is a hash @nestjs/throttler generates internally — whose value is
 * `JSON.stringify(hits)`, a JSON array of hit timestamps. That value shape
 * is unique in this app's Redis usage (compare CLAUDE.md's Redis Key
 * Structure table: tokens are hash strings, session sets are Redis SETs,
 * stock/order-book data is JSON objects or sorted sets — nothing else is a
 * bare JSON array of numbers), so it's used as the identifying signature
 * instead of a key-name pattern. SCAN is used rather than KEYS — the same
 * non-blocking-Redis principle DECISIONS.md already establishes for
 * production code, applied here too even though this is dev-only tooling.
 */
async function resetLoginThrottleBucket(): Promise<void> {
  let cursor = '0';
  let cleared = 0;
  do {
    const [next, keys] = await redis.scan(cursor, 'COUNT', '200');
    cursor = next;
    for (const key of keys) {
      const type = await redis.type(key);
      if (type !== 'string') continue;
      const value = await redis.get(key);
      if (!value) continue;
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed) && parsed.every((n) => typeof n === 'number')) {
          await redis.del(key);
          cleared++;
        }
      } catch {
        // Not JSON — not a throttle bucket, leave it alone.
      }
    }
  } while (cursor !== '0');
  if (cleared > 0) console.log(`  Reset ${cleared} rate-limit bucket(s)`);
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!JWT_ACCESS_SECRET) {
    throw new Error('JWT_ACCESS_SECRET not found in .env.development — cannot sign test tokens');
  }

  console.log('Auth Security — end-to-end test\n');

  console.log('Cleaning up any leftovers from a previous run...');
  await purgeTestData();
  await resetLoginThrottleBucket();

  try {
    // ── 1 & 2: Login wrong/correct password ──────────────────────────────
    console.log('\n--- 1. Login with wrong password (401) ---');
    const user1 = await createVerifiedTrader('wrongpass');
    {
      const { status, body } = await login(user1.email, 'ThisIsWrong123!');
      assert(status === 401, 'Wrong password returns 401');
      assert((body as any).code === 'INVALID_CREDENTIALS', 'Error code is INVALID_CREDENTIALS');
    }

    console.log('\n--- 2. Login with correct password (200 with tokens) ---');
    let user2AccessToken = '';
    let user2RefreshCookie = '';
    {
      const { status, body, setCookies } = await login(user1.email, KNOWN_PASSWORD);
      assert(status === 200, 'Correct password returns 200');
      assert(!!(body as any).accessToken, 'Response includes accessToken');
      assert((body as any).refreshToken === undefined, 'refreshToken is NOT in the response body');
      const cookiePair = extractCookiePair(setCookies, 'refreshToken');
      assert(!!cookiePair, 'Set-Cookie header sets refreshToken');
      assert(
        setCookies.some((c) => c.includes('HttpOnly')),
        'refreshToken cookie is HttpOnly',
      );
      user2AccessToken = (body as any).accessToken;
      user2RefreshCookie = cookiePair || '';
    }

    // ── 3: Valid token ────────────────────────────────────────────────────
    console.log('\n--- 3. Access protected route with valid token (200) ---');
    {
      const { status, body } = await apiCall('GET', '/auth/me', { token: user2AccessToken });
      assert(status === 200, 'GET /auth/me with a valid token returns 200');
      assert((body as any).email === user1.email, 'Returned profile matches the logged-in user');
    }

    // ── 4: Expired token ──────────────────────────────────────────────────
    console.log('\n--- 4. Access protected route with expired token (401) ---');
    {
      const expiredToken = jwt.sign(
        {
          sub: user1.id,
          email: user1.email,
          userType: 'TRADER',
          jti: randomUUID(),
          exp: Math.floor(Date.now() / 1000) - 60, // expired 60s ago
        },
        JWT_ACCESS_SECRET,
      );
      const { status, body } = await apiCall('GET', '/auth/me', { token: expiredToken });
      assert(status === 401, 'Expired token returns 401');
      assert((body as any).code === 'UNAUTHORIZED', 'Error code is UNAUTHORIZED');
    }

    // ── 5, 9, 10: Revoked/blacklisted token (logout flow) ────────────────
    console.log('\n--- 5/9/10. Logout blacklists the token; reuse is rejected ---');
    {
      const user5 = await createVerifiedTrader('revoke');
      const { body: loginBody } = await login(user5.email, KNOWN_PASSWORD);
      const accessToken = (loginBody as any).accessToken as string;

      const preLogout = await apiCall('GET', '/auth/me', { token: accessToken });
      assert(preLogout.status === 200, 'Token works before logout');

      const logoutRes = await apiCall('POST', '/auth/logout', { token: accessToken });
      assert(logoutRes.status === 200, 'POST /auth/logout returns 200');
      assert(
        logoutRes.setCookies.some((c) => c.startsWith('refreshToken=;') || c.includes('refreshToken=;')),
        'Logout clears the refreshToken cookie (Set-Cookie with empty value)',
      );

      const postLogout = await apiCall('GET', '/auth/me', { token: accessToken });
      assert(postLogout.status === 401, 'The SAME token is rejected after logout (401)');
      assert((postLogout.body as any).code === 'TOKEN_REVOKED', 'Error code is TOKEN_REVOKED — token is blacklisted, not just generically invalid');
    }

    // ── 6: No token ────────────────────────────────────────────────────────
    console.log('\n--- 6. Access protected route with no token (401) ---');
    {
      const { status, body } = await apiCall('GET', '/auth/me', {});
      assert(status === 401, 'No token returns 401');
      assert((body as any).code === 'UNAUTHORIZED', 'Error code is UNAUTHORIZED');
    }

    // ── 7: Refresh with valid cookie ──────────────────────────────────────
    console.log('\n--- 7. Refresh with valid cookie (new tokens) ---');
    {
      const { status, body, setCookies } = await apiCall<{ accessToken?: string }>(
        'POST',
        '/auth/refresh',
        { cookie: user2RefreshCookie },
      );
      assert(status === 200, 'Refresh with a valid cookie returns 200');
      assert(!!(body as any).accessToken, 'Response includes a new accessToken');
      assert((body as any).accessToken !== user2AccessToken, 'The new accessToken differs from the original');
      const newCookiePair = extractCookiePair(setCookies, 'refreshToken');
      assert(!!newCookiePair, 'A new refreshToken cookie is set (rotation)');
      assert(newCookiePair !== user2RefreshCookie, 'The rotated refresh cookie value differs from the original');

      // The OLD refresh token must now be dead — reusing it should be
      // treated as possible theft (see auth.service.ts's refreshToken()).
      const reuseOld = await apiCall('POST', '/auth/refresh', { cookie: user2RefreshCookie });
      assert(reuseOld.status === 401, 'Reusing the OLD (already-rotated) refresh cookie is rejected');
      assert((reuseOld.body as any).code === 'TOKEN_REVOKED', 'Error code is TOKEN_REVOKED (reuse-detection path)');
    }

    // ── 8: Refresh with invalid cookie ────────────────────────────────────
    console.log('\n--- 8. Refresh with invalid cookie (401) ---');
    {
      const { status, body } = await apiCall('POST', '/auth/refresh', {
        cookie: 'refreshToken=this-is-not-a-real-jwt',
      });
      assert(status === 401, 'A malformed refresh cookie returns 401');
      assert((body as any).code === 'UNAUTHORIZED', 'Error code is UNAUTHORIZED (raw JWT parse failure, caught by the global filter)');

      const noCookie = await apiCall('POST', '/auth/refresh', {});
      assert(noCookie.status === 401, 'A missing refresh cookie returns 401');
      assert((noCookie.body as any).code === 'TOKEN_REVOKED', 'Error code is TOKEN_REVOKED for a missing cookie');
    }

    // ── 11: XSS via displayName ────────────────────────────────────────────
    console.log('\n--- 11. XSS attempt via displayName ---');
    {
      // Registration (not direct-Prisma creation) is used deliberately
      // here — this is the one scenario that specifically needs to prove
      // the HTTP-facing DTO layer doesn't choke on or mutate the payload,
      // since that's the boundary an attacker actually controls.
      const xssEmail = `xss-${randomUUID().slice(0, 8)}@${TEST_EMAIL_DOMAIN}`;
      const maliciousName = '<script>alert(document.cookie)</script>';
      const registerRes = await apiCall<{ id?: string }>('POST', '/auth/register', {
        body: { email: xssEmail, password: KNOWN_PASSWORD, displayName: maliciousName },
      });
      assert(registerRes.status === 201, 'Registration with a <script> displayName is accepted (input isn\'t the vulnerability — unsafe rendering is)');

      // Directly verify+login via Prisma/HTTP to read the value back
      // through the real API, exactly as a client would.
      await prisma.user.update({
        where: { id: (registerRes.body as any).id },
        data: { isEmailVerified: true, emailVerifiedAt: new Date(), isOnboardingComplete: true },
      });
      const { body: loginBody } = await login(xssEmail, KNOWN_PASSWORD);
      const token = (loginBody as any).accessToken as string;
      const meRes = await apiCall<{ displayName?: string }>('GET', '/auth/me', { token });

      assert(meRes.status === 200, 'Can log in and fetch the profile normally');
      assert(
        meRes.body.displayName === maliciousName,
        'The API returns the displayName UNMODIFIED as a JSON string value — storing/returning raw text is correct; JSON is data, not markup, so it cannot execute',
      );
      // The real defenses: (a) the client renders every displayName as a
      // JSX text node, which React escapes automatically — confirmed by
      // source inspection: zero uses of dangerouslySetInnerHTML anywhere
      // in client/src; (b) no server-side email template or any other
      // HTML-generating code path interpolates displayName — confirmed by
      // source inspection of shared/services/email.service.ts and every
      // caller. There is no HTML rendering surface for this field to
      // reach, so there is nothing an HTTP-level test can execute against
      // — noting that explicitly rather than asserting something that
      // can't actually be exercised over HTTP.
      console.log('    (No dangerouslySetInnerHTML in client/src; no email template interpolates displayName — verified by source inspection, not exercisable over HTTP)');
    }

    // ── 12: SQL injection via email ───────────────────────────────────────
    console.log('\n--- 12. SQL injection attempt via email ---');
    {
      // Case A: a blatantly malformed "email" — rejected by @IsEmail()
      // before it ever reaches Prisma.
      const blatant = await apiCall('POST', '/auth/login', {
        body: { email: "' OR '1'='1", password: 'whatever', deviceId: randomUUID() },
      });
      assert(blatant.status === 400, 'A non-email-shaped injection payload is rejected by DTO validation (400)');
      assert((blatant.body as any).code === 'VALIDATION_ERROR', 'Error code is VALIDATION_ERROR');

      // Case B: an email-SHAPED string that still carries SQL
      // metacharacters in the local part — @IsEmail lets this through
      // syntactically, so this is the case that actually reaches Prisma.
      // Prisma's query builder always parameterizes — there is no
      // $queryRawUnsafe/$executeRawUnsafe anywhere in the auth module
      // (confirmed by source inspection) — so this must come back as a
      // normal "no such user" 401, never a 500, and never actually log
      // anyone in.
      const shaped = await apiCall('POST', '/auth/login', {
        body: { email: `x'or'1'='1@${TEST_EMAIL_DOMAIN}`, password: 'whatever', deviceId: randomUUID() },
      });
      assert(shaped.status === 401, 'An email-shaped SQL-metacharacter payload reaches the DB layer safely and returns a normal 401 (not a 500 — proves it was never interpreted as SQL)');
      assert((shaped.body as any).code === 'INVALID_CREDENTIALS', 'Error code is INVALID_CREDENTIALS, same as any other nonexistent user — no distinguishable behavior an attacker could use to detect injection');
    }

    // ── 14 (bonus): CSRF header requirement on refresh ────────────────────
    console.log('\n--- 14 (bonus, this sprint\'s CSRF fix). X-Requested-With required on /auth/refresh ---');
    {
      const user14 = await createVerifiedTrader('csrf');
      const { setCookies } = await login(user14.email, KNOWN_PASSWORD);
      const cookie = extractCookiePair(setCookies, 'refreshToken');

      const withoutHeader = await apiCall('POST', '/auth/refresh', { cookie, skipCsrfHeader: true });
      assert(withoutHeader.status === 403, 'Refresh WITHOUT X-Requested-With is rejected (403) even with a fully valid cookie');
      assert((withoutHeader.body as any).code === 'FORBIDDEN', 'Error code is FORBIDDEN');

      const withHeader = await apiCall('POST', '/auth/refresh', { cookie });
      assert(withHeader.status === 200, 'The SAME cookie succeeds once X-Requested-With is present');
    }

    // ── 15 (bonus, this sprint's ValidationPipe fix) ──────────────────────
    console.log('\n--- 15 (bonus, this sprint\'s filter fix). ValidationPipe errors map to VALIDATION_ERROR ---');
    {
      const { status, body } = await apiCall('POST', '/auth/login', {
        body: { email: 'not-an-email', password: '' },
      });
      assert(status === 400, 'Multi-field validation failure returns 400');
      assert((body as any).code === 'VALIDATION_ERROR', 'Error code is VALIDATION_ERROR (was UNKNOWN_ERROR before this sprint\'s fix)');
      assert(typeof (body as any).message === 'string', 'message is a STRING, not an array (was a raw string[] before this sprint\'s fix, breaking the "message is always human-readable text" contract)');
      assert(
        ((body as any).message as string).includes('email') && ((body as any).message as string).includes('device ID'),
        'message concatenates every field error, not just the first',
      );
    }

    // ── 13: Login brute force (MUST run last — see module docstring) ─────
    console.log('\n--- 13. Login brute force -> rate limited after N attempts ---');
    {
      const bruteEmail = `brute-${randomUUID().slice(0, 8)}@${TEST_EMAIL_DOMAIN}`;
      const limit = RATE_LIMITS.LOGIN.limit;
      let statuses: number[] = [];
      let rateLimitedAt = -1;

      for (let i = 1; i <= limit + 8; i++) {
        const { status } = await login(bruteEmail, 'WrongPassword123!');
        statuses.push(status);
        if (status === 429) {
          rateLimitedAt = i;
          break;
        }
      }

      assert(rateLimitedAt !== -1, `A 429 was observed within ${limit + 8} attempts (never triggered otherwise)`);
      assert(
        statuses.slice(0, -1).every((s) => s === 401),
        'Every attempt before the 429 was a normal 401 (not itself rate-limited early)',
      );
      assert(
        rateLimitedAt <= limit + 5,
        `Rate limiting kicked in close to the configured limit (${limit}) — observed at attempt ${rateLimitedAt}, not dramatically later`,
      );

      const { status: finalStatus, body: finalBody } = await login(bruteEmail, 'WrongPassword123!');
      assert(finalStatus === 429, 'Further attempts continue to be rate limited');
      assert((finalBody as any).code === 'RATE_LIMIT_EXCEEDED', 'Error code is RATE_LIMIT_EXCEEDED');
    }
  } finally {
    console.log('\nCleaning up test fixtures...');
    await purgeTestData();
    // Leaves the shared IP bucket clean for both the next run of this
    // script AND any other manual testing against this dev server.
    await resetLoginThrottleBucket();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (error) => {
  console.error('Test script crashed:', error);
  await purgeTestData().catch(() => {});
  await resetLoginThrottleBucket().catch(() => {});
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(1);
});
