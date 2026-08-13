/**
 * End-to-end test for Sprint 13 Step 6 — Admin audit log viewer.
 *
 * Not a Jest suite — drives the REAL running server's HTTP API with real
 * signed JWTs (admin via actual login, non-admin via a signed test token —
 * same pattern as test-admin-users.ts / test-admin-topups.ts).
 *
 * Covers:
 *   - Seeds a test broker and trader
 *   - Generates several REAL AuditLog rows via existing admin endpoints:
 *     suspend user (action USER_SUSPENDED), unsuspend (USER_UNSUSPENDED),
 *     and an admin override top-up (MANUAL_ADJUST) — not manually inserted
 *     rows, the actual code paths that write AuditLog today
 *   - GET /admin/audit returns rows in descending createdAt order
 *   - action filter narrows results correctly
 *   - Pagination: limit=1 across two pages returns different, correctly
 *     ordered rows with no overlap
 *   - actorName/actorEmail are populated for a real (non-deleted) admin
 *     actor
 *   - A manually-inserted row with userId = null (true system/cron event)
 *     surfaces actorUserId/actorName/actorEmail all null — proves the
 *     endpoint doesn't crash on the one case CLAUDE.md's schema actually
 *     allows (AuditLog.userId is nullable)
 *   - Non-admin token -> 403
 *
 * Run with: npx tsx scripts/test-admin-audit.ts (from server/)
 * Requires the server already running on TEST_SERVER_URL (default
 * http://localhost:3001/api/v1), Postgres + Redis reachable per
 * .env.development, and the seed already applied (admin@nebula.com /
 * ChangeMe123!).
 */

import { PrismaClient, UserType } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: path.resolve(__dirname, '..', '.env.development') });

const prisma = new PrismaClient();

const SERVER_URL = process.env.TEST_SERVER_URL || 'http://localhost:3001/api/v1';
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const TEST_EMAIL_DOMAIN = 'admin-audit-test.nebula';
const ADMIN_EMAIL = 'admin@nebula.com';
const ADMIN_PASSWORD = 'ChangeMe123!';
// Distinctive action name so this test's system-event row can be found
// and cleaned up without touching any other action's rows.
const SYSTEM_ACTION = 'TEST_SYSTEM_EVENT_ADMIN_AUDIT';

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  token: string,
  body: unknown = {},
): Promise<ApiResult<T>> {
  const res = await fetch(`${SERVER_URL}${urlPath}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
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

async function createTestTrader(startingBalancePaise: number): Promise<TestUser> {
  const email = `trader-${randomUUID().slice(0, 8)}@${TEST_EMAIL_DOMAIN}`;
  const user = await prisma.user.create({
    data: {
      email,
      password: null,
      userType: UserType.TRADER,
      displayName: 'Admin Audit Test Trader',
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
      isOnboardingComplete: true,
      isFirstLogin: false,
    },
  });
  await prisma.wallet.create({
    data: {
      userId: user.id,
      availableBalance: startingBalancePaise,
      reservedBalance: 0,
      totalDeposited: startingBalancePaise,
    },
  });
  return { id: user.id, email };
}

async function createTestBroker(): Promise<TestUser> {
  const email = `broker-${randomUUID().slice(0, 8)}@${TEST_EMAIL_DOMAIN}`;
  const user = await prisma.user.create({
    data: {
      email,
      password: null,
      userType: UserType.BROKER,
      displayName: 'Admin Audit Test Broker',
      brokerNumber: `TEST-${randomUUID().slice(0, 8)}`,
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
      isOnboardingComplete: true,
      isFirstLogin: false,
    },
  });
  return { id: user.id, email };
}

// ─── Cleanup ─────────────────────────────────────────────────────────────

async function purgeTestData(): Promise<void> {
  // Remove the manually-inserted system-event row (userId already null,
  // so it can't be found via the userId-based sweep below).
  await prisma.auditLog.deleteMany({ where: { action: SYSTEM_ACTION } });

  const testUsers = await prisma.user.findMany({
    where: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } },
    select: { id: true },
  });
  const userIds = testUsers.map((u) => u.id);
  if (userIds.length === 0) return;

  // AuditLog rows from suspend/unsuspend/override are keyed by the
  // ADMIN's userId (the actor), not the trader's/broker's — see
  // admin.service.ts. metadata.targetUserId holds the target instead,
  // so a raw JSON-path match finds and removes test-generated rows (same
  // approach as test-admin-users.ts / test-admin-topups.ts).
  await prisma.$executeRawUnsafe(
    `DELETE FROM "AuditLog" WHERE metadata->>'targetUserId' IN (${userIds.map((id) => `'${id}'`).join(',') || "''"})`,
  ).catch(() => {});

  await prisma.transaction.deleteMany({ where: { wallet: { userId: { in: userIds } } } });
  await prisma.topUpRequest.deleteMany({ where: { traderId: { in: userIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.wallet.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });

  console.log(`  Purged ${userIds.length} leftover test user(s) and their data`);
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Admin Audit Log Viewer — end-to-end test\n');

  console.log('Cleaning up any leftovers from a previous run...');
  await purgeTestData();

  console.log('\nLogging in as admin...');
  const adminToken = await loginAsAdmin();
  const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
  console.log(`  Logged in as ${ADMIN_EMAIL}`);

  console.log('\nSeeding test broker + trader...');
  const broker = await createTestBroker();
  const trader = await createTestTrader(5_000_000);
  console.log(`  Broker: ${broker.email}, Trader: ${trader.email}`);

  try {
    console.log('\nGenerating real AuditLog rows via existing admin endpoints...');

    // 1. USER_SUSPENDED
    {
      const { status } = await apiPatch('/admin/users/' + trader.id + '/suspend', adminToken, {
        reason: 'Generating an audit log row for the Step 6 test.',
      });
      assert(status === 200, 'Setup: suspend succeeded (generates USER_SUSPENDED)');
    }
    await sleep(20); // ensure strictly increasing createdAt ordering between rows

    // 2. USER_UNSUSPENDED
    {
      const { status } = await apiPatch('/admin/users/' + trader.id + '/unsuspend', adminToken);
      assert(status === 200, 'Setup: unsuspend succeeded (generates USER_UNSUSPENDED)');
    }
    await sleep(20);

    // 3. MANUAL_ADJUST (admin override top-up)
    let overrideTopUpRequestId = '';
    {
      const { status, body } = await apiPost<{ topUpRequest?: { id: string } }>('/admin/topups', adminToken, {
        traderId: trader.id,
        amountPaise: 500_000,
        reason: 'Generating an audit log row for the Step 6 test.',
        reference: 'AUDIT-TEST-REF-001',
      });
      assert(status === 200, 'Setup: override top-up succeeded (generates MANUAL_ADJUST)');
      overrideTopUpRequestId = body.topUpRequest?.id ?? '';
    }
    await sleep(20);

    // 4. A manually-inserted true system/cron event — userId literally
    // null, exercising the one null-actor case the schema actually
    // allows (see admin.repository.ts's findAuditLogs docstring).
    const systemLog = await prisma.auditLog.create({
      data: {
        userId: null,
        action: SYSTEM_ACTION,
        metadata: { note: 'Simulated system/cron event for Step 6 test' },
      },
    });

    console.log('\n--- GET /admin/audit returns rows in desc order ---');
    {
      const { status, body } = await apiGet<{
        data: Array<{ auditLogId: string; action: string; createdAt: string }>;
        pagination: { totalCount: number };
      }>('/admin/audit?limit=50', adminToken);

      assert(status === 200, 'GET /admin/audit returns 200');
      assert(body.data.length > 0, 'Response includes at least one row');

      // Confirm descending order across the whole returned page.
      let isDescending = true;
      for (let i = 1; i < body.data.length; i++) {
        if (new Date(body.data[i - 1].createdAt).getTime() < new Date(body.data[i].createdAt).getTime()) {
          isDescending = false;
          break;
        }
      }
      assert(isDescending, 'Rows are ordered by createdAt descending');

      const ourIds = body.data.map((d) => d.auditLogId);
      assert(ourIds.includes(systemLog.id), 'The manually-inserted system-event row appears in the list');
    }

    console.log('\n--- action filter ---');
    {
      const { status, body } = await apiGet<{ data: Array<{ action: string }> }>(
        `/admin/audit?action=${SYSTEM_ACTION}&limit=50`,
        adminToken,
      );
      assert(status === 200, 'GET /admin/audit?action=... returns 200');
      assert(body.data.length >= 1, 'Filtered list has at least our one system-event row');
      assert(
        body.data.every((row) => row.action === SYSTEM_ACTION),
        'Every row in the filtered list has the requested action',
      );
    }

    console.log('\n--- action filter with MANUAL_ADJUST ---');
    {
      const { status, body } = await apiGet<{ data: Array<{ action: string; metadata: unknown }> }>(
        '/admin/audit?action=MANUAL_ADJUST&limit=50',
        adminToken,
      );
      assert(status === 200, 'GET /admin/audit?action=MANUAL_ADJUST returns 200');
      const ourRow = body.data.find(
        (row) => (row.metadata as { topUpRequestId?: string })?.topUpRequestId === overrideTopUpRequestId,
      );
      assert(!!ourRow, 'Our MANUAL_ADJUST row (matched by metadata.topUpRequestId) is present in the filtered list');
    }

    console.log('\n--- Pagination: limit=1 across two pages ---');
    {
      const page1 = await apiGet<{
        data: Array<{ auditLogId: string }>;
        pagination: { page: number; totalPages: number; limit: number };
      }>('/admin/audit?page=1&limit=1', adminToken);
      const page2 = await apiGet<{ data: Array<{ auditLogId: string }> }>('/admin/audit?page=2&limit=1', adminToken);

      assert(page1.status === 200 && page2.status === 200, 'Both page 1 and page 2 return 200');
      assert(page1.body.data.length === 1, 'Page 1 returns exactly 1 row (limit=1)');
      assert(page2.body.data.length === 1, 'Page 2 returns exactly 1 row (limit=1)');
      assert(
        page1.body.data[0]?.auditLogId !== page2.body.data[0]?.auditLogId,
        'Page 1 and page 2 return different rows (no overlap)',
      );
      assert(page1.body.pagination.limit === 1, 'pagination.limit reflects the requested limit');
      assert(page1.body.pagination.totalPages >= 2, 'pagination.totalPages accounts for at least 2 pages');
    }

    console.log('\n--- Actor fields populated for a real actor ---');
    {
      const { body } = await apiGet<{
        data: Array<{ action: string; actorUserId: string | null; actorName: string | null; actorEmail: string | null }>;
      }>('/admin/audit?action=USER_SUSPENDED&limit=50', adminToken);

      const ourRow = body.data.find((row) => row.actorUserId === adminUser.id);
      assert(!!ourRow, 'A USER_SUSPENDED row with our admin as actor is present');
      assert(ourRow?.actorName === adminUser.displayName, 'actorName matches the admin\'s displayName');
      assert(ourRow?.actorEmail === adminUser.email, 'actorEmail matches the admin\'s email');
    }

    console.log('\n--- Null-actor entry (system event) ---');
    {
      const { body } = await apiGet<{
        data: Array<{
          auditLogId: string;
          actorUserId: string | null;
          actorName: string | null;
          actorEmail: string | null;
          metadata: unknown;
        }>;
      }>(`/admin/audit?action=${SYSTEM_ACTION}&limit=50`, adminToken);

      const ourRow = body.data.find((row) => row.auditLogId === systemLog.id);
      assert(!!ourRow, 'The system-event row is retrievable');
      assert(ourRow?.actorUserId === null, 'actorUserId is null for a system event');
      assert(ourRow?.actorName === null, 'actorName is null for a system event (no crash)');
      assert(ourRow?.actorEmail === null, 'actorEmail is null for a system event (no crash)');
      assert(
        (ourRow?.metadata as { note?: string })?.note === 'Simulated system/cron event for Step 6 test',
        'Raw metadata JSON is passed through unchanged',
      );
    }

    console.log('\n--- Non-admin token rejected (403) ---');
    {
      const traderToken = signTestAccessToken(trader.id, trader.email, UserType.TRADER);
      const { status } = await apiGet('/admin/audit', traderToken);
      assert(status === 403, 'GET /admin/audit with a trader token returns 403');
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
