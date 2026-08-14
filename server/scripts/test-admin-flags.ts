/**
 * End-to-end test for Admin Flag Resolution (Gap Fill 1).
 *
 * Not a Jest suite — drives the REAL running server's HTTP API with real
 * signed JWTs (admin via actual login, broker/trader via signed test
 * tokens — same pattern as test-admin-topups.ts).
 *
 * Covers:
 *   - A broker flag (created directly via Prisma, mirroring
 *     BrokerService.createFlag's shape — no HTTP creation path is under
 *     test here) starts OPEN and is invisible to nobody: GET /admin/flags
 *     lists it with trader/broker names joined in
 *   - Status filter (?status=OPEN) returns only OPEN flags
 *   - Non-admin token -> 403 on both GET /admin/flags and PATCH .../resolve
 *   - DTO validation: missing/short resolution -> 400; invalid status -> 400
 *   - PATCH /admin/flags/:id/resolve with status=RESOLVED transitions the
 *     flag, records resolvedBy/resolvedAt/resolution, and writes an
 *     AuditLog row with action FLAG_RESOLVED (userId = admin, metadata
 *     references the flag/trader/broker)
 *   - Re-resolving an already-resolved flag returns 400 FLAG_ALREADY_RESOLVED
 *   - A second flag resolved with status=DISMISSED writes action
 *     FLAG_DISMISSED instead
 *   - Resolving a nonexistent flag id returns 404
 *
 * Run with: npx tsx scripts/test-admin-flags.ts (from server/)
 * Requires the server already running on TEST_SERVER_URL (default
 * http://localhost:3001/api/v1), Postgres + Redis reachable per
 * .env.development, and the seed already applied (admin@nebula.com /
 * ChangeMe123!).
 */

import { PrismaClient, UserType, FlagStatus } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: path.resolve(__dirname, '..', '.env.development') });

const prisma = new PrismaClient();

const SERVER_URL = process.env.TEST_SERVER_URL || 'http://localhost:3001/api/v1';
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const TEST_EMAIL_DOMAIN = 'admin-flags-test.nebula';
const ADMIN_EMAIL = 'admin@nebula.com';
const ADMIN_PASSWORD = 'ChangeMe123!';

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

interface ApiResult<T> {
  status: number;
  body: T;
}

async function apiGet<T>(urlPath: string, token: string): Promise<ApiResult<T>> {
  const res = await fetch(`${SERVER_URL}${urlPath}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json as T };
}

async function apiPatch<T>(
  urlPath: string,
  token: string | null,
  body: unknown,
): Promise<ApiResult<T>> {
  const res = await fetch(`${SERVER_URL}${urlPath}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json as T };
}

async function apiPost<T>(
  urlPath: string,
  token: string | null,
  body: unknown,
): Promise<ApiResult<T>> {
  const res = await fetch(`${SERVER_URL}${urlPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json as T };
}

// ─── Test JWT signing ────────────────────────────────────────────────────

function signTestAccessToken(userId: string, email: string, userType: UserType): string {
  if (!JWT_ACCESS_SECRET) {
    throw new Error('JWT_ACCESS_SECRET not found in .env.development — cannot sign test tokens');
  }
  return jwt.sign(
    { sub: userId, email, userType, jti: randomUUID() },
    JWT_ACCESS_SECRET,
    { expiresIn: '15m' },
  );
}

async function loginAsAdmin(): Promise<string> {
  const deviceId = randomUUID();
  const { status, body } = await apiPost<{ accessToken?: string }>('/auth/login', null, {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    deviceId,
  });
  if (status !== 200 || !body.accessToken) {
    throw new Error(
      `Admin login failed (status ${status}) — did you run "npx prisma db seed" with the ChangeMe123! admin password fix?`,
    );
  }
  return body.accessToken;
}

// ─── Test fixture setup ────────────────────────────────────────────────────

interface TestUser {
  id: string;
  email: string;
}

async function createTestUser(userType: UserType, label: string): Promise<TestUser> {
  const email = `${label}-${randomUUID().slice(0, 8)}@${TEST_EMAIL_DOMAIN}`;
  const user = await prisma.user.create({
    data: {
      email,
      password: null,
      userType,
      displayName: `Admin Flags Test ${label}`,
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
      isOnboardingComplete: true,
      isFirstLogin: false,
    },
  });
  return { id: user.id, email };
}

async function createTestFlag(traderId: string, brokerId: string, reason: string) {
  return prisma.suspiciousFlag.create({
    data: { traderId, brokerId, reason, status: FlagStatus.OPEN },
  });
}

// ─── Cleanup ─────────────────────────────────────────────────────────────

async function purgeTestData(): Promise<void> {
  const testUsers = await prisma.user.findMany({
    where: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } },
    select: { id: true },
  });
  const userIds = testUsers.map((u) => u.id);
  if (userIds.length === 0) return;

  // AuditLog rows are keyed by the ADMIN's userId (the actor), not the
  // trader's/broker's — metadata.traderId/brokerId hold those instead, so
  // a raw JSON-path match is needed (same approach as test-admin-topups.ts).
  await prisma.$executeRawUnsafe(
    `DELETE FROM "AuditLog" WHERE metadata->>'traderId' IN (${userIds.map((id) => `'${id}'`).join(',') || "''"})`,
  ).catch(() => {});

  await prisma.suspiciousFlag.deleteMany({
    where: { OR: [{ traderId: { in: userIds } }, { brokerId: { in: userIds } }] },
  });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });

  console.log(`  Purged ${userIds.length} leftover test user(s) and their data`);
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Admin Flag Resolution — end-to-end test\n');

  console.log('Cleaning up any leftovers from a previous run...');
  await purgeTestData();

  console.log('\nLogging in as admin...');
  const adminToken = await loginAsAdmin();
  const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
  console.log(`  Logged in as ${ADMIN_EMAIL}`);

  console.log('\nCreating test fixtures...');
  const trader = await createTestUser(UserType.TRADER, 'trader');
  const broker = await createTestUser(UserType.BROKER, 'broker');
  const bystander = await createTestUser(UserType.TRADER, 'bystander');
  const flag = await createTestFlag(trader.id, broker.id, 'Unusually large trades right after top-up.');
  const secondFlag = await createTestFlag(trader.id, broker.id, 'Repeated cancel-and-reorder pattern.');
  console.log(`  Created flag ${flag.id} (trader=${trader.email}, broker=${broker.email})`);

  try {
    console.log('\n--- Non-admin token rejected on GET /admin/flags (403) ---');
    {
      const bystanderToken = signTestAccessToken(bystander.id, bystander.email, UserType.TRADER);
      const { status } = await apiGet('/admin/flags', bystanderToken);
      assert(status === 403, 'GET /admin/flags with a trader token returns 403');
    }

    console.log('\n--- Non-admin token rejected on PATCH /admin/flags/:id/resolve (403) ---');
    {
      const bystanderToken = signTestAccessToken(bystander.id, bystander.email, UserType.TRADER);
      const { status } = await apiPatch(`/admin/flags/${flag.id}/resolve`, bystanderToken, {
        status: 'RESOLVED',
        resolution: 'Should be rejected before reaching the service.',
      });
      assert(status === 403, 'PATCH /admin/flags/:id/resolve with a trader token returns 403');
    }

    console.log('\n--- GET /admin/flags lists the fixture, joined with names ---');
    {
      const { status, body } = await apiGet<{
        data: Array<{
          flagId: string;
          traderId: string;
          traderName: string | null;
          traderEmail: string;
          brokerId: string;
          brokerName: string | null;
          brokerEmail: string;
          reason: string;
          status: string;
        }>;
        pagination: { totalCount: number };
      }>('/admin/flags?limit=50', adminToken);

      assert(status === 200, 'GET /admin/flags returns 200');
      const found = body.data.find((f) => f.flagId === flag.id);
      assert(!!found, 'The fixture flag appears in the list');
      assert(found?.traderId === trader.id, 'Listed traderId matches');
      assert(found?.traderEmail === trader.email, 'Listed traderEmail matches (joined from User)');
      assert(found?.brokerId === broker.id, 'Listed brokerId matches');
      assert(found?.brokerEmail === broker.email, 'Listed brokerEmail matches (joined from User)');
      assert(found?.status === 'OPEN', 'Listed status is OPEN');
    }

    console.log('\n--- Status filter (?status=OPEN) ---');
    {
      const { status, body } = await apiGet<{
        data: Array<{ flagId: string; status: string }>;
      }>('/admin/flags?limit=50&status=OPEN', adminToken);

      assert(status === 200, 'GET /admin/flags?status=OPEN returns 200');
      assert(
        body.data.every((f) => f.status === 'OPEN'),
        'Every returned flag has status OPEN',
      );
      assert(
        body.data.some((f) => f.flagId === flag.id),
        'Fixture flag appears under the OPEN filter',
      );
    }

    console.log('\n--- Validation: short resolution (400) ---');
    {
      const { status } = await apiPatch(`/admin/flags/${flag.id}/resolve`, adminToken, {
        status: 'RESOLVED',
        resolution: 'short',
      });
      assert(status === 400, 'Resolve with a <10-char resolution returns 400');
    }

    console.log('\n--- Validation: invalid status value (400) ---');
    {
      const { status } = await apiPatch(`/admin/flags/${flag.id}/resolve`, adminToken, {
        status: 'OPEN',
        resolution: 'Attempting to set status back to OPEN, which is invalid.',
      });
      assert(status === 400, 'Resolve with status=OPEN (not RESOLVED/DISMISSED) returns 400');
    }

    console.log('\n--- Resolving a nonexistent flag (404) ---');
    {
      const { status, body } = await apiPatch<{ code?: string }>(
        `/admin/flags/${randomUUID()}/resolve`,
        adminToken,
        { status: 'RESOLVED', resolution: 'This flag id does not exist.' },
      );
      assert(status === 404, 'Resolving a nonexistent flag id returns 404');
      assert(body.code === 'NOT_FOUND', 'Error code is NOT_FOUND');
    }

    console.log('\n--- Resolve flow (status=RESOLVED) ---');
    {
      const { status, body } = await apiPatch<{ message: string }>(
        `/admin/flags/${flag.id}/resolve`,
        adminToken,
        { status: 'RESOLVED', resolution: 'Contacted trader — activity confirmed legitimate.' },
      );
      assert(status === 200, 'PATCH /admin/flags/:id/resolve returns 200');
      assert(body.message === 'Flag resolved successfully', 'Response message is correct');
    }

    console.log('\n--- Flag row updated in DB ---');
    {
      const updated = await prisma.suspiciousFlag.findUniqueOrThrow({ where: { id: flag.id } });
      assert(updated.status === FlagStatus.RESOLVED, 'SuspiciousFlag.status is RESOLVED');
      assert(updated.resolvedBy === adminUser.id, 'SuspiciousFlag.resolvedBy is the admin');
      assert(updated.resolvedAt !== null, 'SuspiciousFlag.resolvedAt is set');
      assert(
        updated.resolution === 'Contacted trader — activity confirmed legitimate.',
        'SuspiciousFlag.resolution matches',
      );
    }

    console.log('\n--- AuditLog row (FLAG_RESOLVED) ---');
    {
      const auditRows = await prisma.auditLog.findMany({
        where: { userId: adminUser.id, action: 'FLAG_RESOLVED' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });
      assert(auditRows.length === 1, 'AuditLog row created for FLAG_RESOLVED');
      const metadata = auditRows[0]?.metadata as {
        flagId?: string;
        traderId?: string;
        brokerId?: string;
        resolution?: string;
      } | null;
      assert(metadata?.flagId === flag.id, 'AuditLog metadata.flagId matches');
      assert(metadata?.traderId === trader.id, 'AuditLog metadata.traderId matches');
      assert(metadata?.brokerId === broker.id, 'AuditLog metadata.brokerId matches');
    }

    console.log('\n--- Re-resolving an already-resolved flag (400) ---');
    {
      const { status, body } = await apiPatch<{ code?: string }>(
        `/admin/flags/${flag.id}/resolve`,
        adminToken,
        { status: 'DISMISSED', resolution: 'Trying to re-decide an already-closed flag.' },
      );
      assert(status === 400, 'Re-resolving an already-RESOLVED flag returns 400');
      assert(body.code === 'FLAG_ALREADY_RESOLVED', 'Error code is FLAG_ALREADY_RESOLVED');
    }

    console.log('\n--- Dismiss flow (status=DISMISSED) on second flag ---');
    {
      const { status } = await apiPatch(`/admin/flags/${secondFlag.id}/resolve`, adminToken, {
        status: 'DISMISSED',
        resolution: 'Pattern matches this trader\'s normal strategy — no issue.',
      });
      assert(status === 200, 'PATCH /admin/flags/:id/resolve (dismiss) returns 200');

      const updated = await prisma.suspiciousFlag.findUniqueOrThrow({ where: { id: secondFlag.id } });
      assert(updated.status === FlagStatus.DISMISSED, 'Second flag status is DISMISSED');

      const auditRows = await prisma.auditLog.findMany({
        where: { userId: adminUser.id, action: 'FLAG_DISMISSED' },
      });
      assert(auditRows.length === 1, 'AuditLog row created for FLAG_DISMISSED (distinct action from FLAG_RESOLVED)');
    }
  } finally {
    console.log('\nCleaning up test fixtures...');
    await purgeTestData();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (error) => {
  console.error('Test script crashed:', error);
  await purgeTestData().catch(() => {});
  await prisma.$disconnect();
  process.exit(1);
});
