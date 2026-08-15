/**
 * End-to-end test for Admin Broker Reassignment.
 *
 * Not a Jest suite — drives the REAL running server's HTTP API with real
 * signed JWTs (admin via actual login, trader via a signed test token —
 * same pattern as test-admin-flags.ts).
 *
 * Covers:
 *   - Non-admin token -> 403 on PATCH /admin/users/:userId/reassign-broker
 *   - Missing brokerId -> 400 VALIDATION_ERROR
 *   - Reassigning a nonexistent user -> 404 NOT_FOUND
 *   - Reassigning a BROKER or ADMIN user (not a TRADER) -> 400 VALIDATION_ERROR
 *   - Reassigning to a nonexistent broker id -> 404 NOT_FOUND
 *   - Reassigning to a suspended broker -> 404 NOT_FOUND (findActiveBrokerById excludes suspended)
 *   - Reassigning to a TRADER id (not a broker at all) -> 404 NOT_FOUND
 *   - Happy path: trader.assignedBrokerId updates in DB, response message
 *     correct, AuditLog row written with action BROKER_REASSIGNED and
 *     metadata {traderId, oldBrokerId, newBrokerId}
 *   - GET /admin/users reflects the new assignedBrokerId/assignedBrokerName
 *
 * Run with: npx tsx scripts/test-admin-reassign-broker.ts (from server/)
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
const TEST_EMAIL_DOMAIN = 'admin-reassign-test.nebula';
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

async function createTestUser(
  userType: UserType,
  label: string,
  extra: { isSuspended?: boolean; assignedBrokerId?: string | null; brokerNumber?: string } = {},
): Promise<TestUser> {
  const email = `${label}-${randomUUID().slice(0, 8)}@${TEST_EMAIL_DOMAIN}`;
  const user = await prisma.user.create({
    data: {
      email,
      password: null,
      userType,
      displayName: `Admin Reassign Test ${label}`,
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
      isOnboardingComplete: true,
      isFirstLogin: false,
      isSuspended: extra.isSuspended ?? false,
      assignedBrokerId: extra.assignedBrokerId ?? null,
      brokerNumber: extra.brokerNumber,
    },
  });
  return { id: user.id, email };
}

// ─── Cleanup ─────────────────────────────────────────────────────────────

async function purgeTestData(): Promise<void> {
  const testUsers = await prisma.user.findMany({
    where: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } },
    select: { id: true },
  });
  const userIds = testUsers.map((u) => u.id);
  if (userIds.length === 0) return;

  // AuditLog rows for BROKER_REASSIGNED are keyed by the ADMIN's userId
  // (the actor), not the trader's/broker's — metadata.traderId holds that
  // instead, so a raw JSON-path match is needed (same approach as
  // test-admin-flags.ts / test-admin-topups.ts).
  await prisma.$executeRawUnsafe(
    `DELETE FROM "AuditLog" WHERE metadata->>'traderId' IN (${userIds.map((id) => `'${id}'`).join(',') || "''"})`,
  ).catch(() => {});

  // Clear assignedBrokerId first so no FK from a lingering trader row
  // blocks deleting a broker row in the same batch.
  await prisma.user.updateMany({
    where: { id: { in: userIds } },
    data: { assignedBrokerId: null },
  });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });

  console.log(`  Purged ${userIds.length} leftover test user(s) and their data`);
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Admin Broker Reassignment — end-to-end test\n');

  console.log('Cleaning up any leftovers from a previous run...');
  await purgeTestData();

  console.log('\nLogging in as admin...');
  const adminToken = await loginAsAdmin();
  const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
  console.log(`  Logged in as ${ADMIN_EMAIL}`);

  console.log('\nCreating test fixtures...');
  const brokerA = await createTestUser(UserType.BROKER, 'brokerA', {
    brokerNumber: `TEST-A-${randomUUID().slice(0, 6)}`,
  });
  const brokerB = await createTestUser(UserType.BROKER, 'brokerB', {
    brokerNumber: `TEST-B-${randomUUID().slice(0, 6)}`,
  });
  const suspendedBroker = await createTestUser(UserType.BROKER, 'suspendedBroker', {
    isSuspended: true,
    brokerNumber: `TEST-S-${randomUUID().slice(0, 6)}`,
  });
  const trader = await createTestUser(UserType.TRADER, 'trader', {
    assignedBrokerId: brokerA.id,
  });
  console.log(`  Created trader ${trader.email} assigned to broker ${brokerA.email}`);
  console.log(`  Created target broker ${brokerB.email}, suspended broker ${suspendedBroker.email}`);

  try {
    console.log('\n--- Non-admin token rejected (403) ---');
    {
      const traderToken = signTestAccessToken(trader.id, trader.email, UserType.TRADER);
      const { status } = await apiPatch(
        `/admin/users/${trader.id}/reassign-broker`,
        traderToken,
        { brokerId: brokerB.id },
      );
      assert(status === 403, 'PATCH reassign-broker with a trader token returns 403');
    }

    console.log('\n--- Validation: missing brokerId (400) ---');
    {
      const { status } = await apiPatch(`/admin/users/${trader.id}/reassign-broker`, adminToken, {});
      assert(status === 400, 'Missing brokerId returns 400');
    }

    console.log('\n--- Reassigning a nonexistent user (404) ---');
    {
      const { status, body } = await apiPatch<{ code?: string }>(
        `/admin/users/${randomUUID()}/reassign-broker`,
        adminToken,
        { brokerId: brokerB.id },
      );
      assert(status === 404, 'Reassigning a nonexistent user returns 404');
      assert(body.code === 'NOT_FOUND', 'Error code is NOT_FOUND');
    }

    console.log('\n--- Reassigning a BROKER user (not a TRADER) (400) ---');
    {
      const { status, body } = await apiPatch<{ code?: string }>(
        `/admin/users/${brokerA.id}/reassign-broker`,
        adminToken,
        { brokerId: brokerB.id },
      );
      assert(status === 400, 'Reassigning a BROKER user returns 400');
      assert(body.code === 'VALIDATION_ERROR', 'Error code is VALIDATION_ERROR');
    }

    console.log('\n--- Reassigning to a nonexistent broker id (404) ---');
    {
      const { status, body } = await apiPatch<{ code?: string }>(
        `/admin/users/${trader.id}/reassign-broker`,
        adminToken,
        { brokerId: randomUUID() },
      );
      assert(status === 404, 'Reassigning to a nonexistent broker returns 404');
      assert(body.code === 'NOT_FOUND', 'Error code is NOT_FOUND');
    }

    console.log('\n--- Reassigning to a suspended broker (404) ---');
    {
      const { status, body } = await apiPatch<{ code?: string }>(
        `/admin/users/${trader.id}/reassign-broker`,
        adminToken,
        { brokerId: suspendedBroker.id },
      );
      assert(status === 404, 'Reassigning to a suspended broker returns 404');
      assert(body.code === 'NOT_FOUND', 'Error code is NOT_FOUND (suspended brokers are not "active")');
    }

    console.log('\n--- Reassigning to a TRADER id (not a broker at all) (404) ---');
    {
      const { status } = await apiPatch(`/admin/users/${trader.id}/reassign-broker`, adminToken, {
        brokerId: trader.id,
      });
      assert(status === 404, 'Reassigning to a TRADER id returns 404 (not userType BROKER)');
    }

    console.log('\n--- Happy path: reassign trader from brokerA to brokerB ---');
    {
      const { status, body } = await apiPatch<{ message: string }>(
        `/admin/users/${trader.id}/reassign-broker`,
        adminToken,
        { brokerId: brokerB.id },
      );
      assert(status === 200, 'PATCH reassign-broker returns 200');
      assert(body.message === 'Trader reassigned successfully', 'Response message is correct');
    }

    console.log('\n--- Trader row updated in DB ---');
    {
      const updated = await prisma.user.findUniqueOrThrow({ where: { id: trader.id } });
      assert(updated.assignedBrokerId === brokerB.id, 'User.assignedBrokerId is now brokerB');
    }

    console.log('\n--- AuditLog row (BROKER_REASSIGNED) ---');
    {
      const auditRows = await prisma.auditLog.findMany({
        where: { userId: adminUser.id, action: 'BROKER_REASSIGNED' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });
      assert(auditRows.length === 1, 'AuditLog row created for BROKER_REASSIGNED');
      const metadata = auditRows[0]?.metadata as {
        traderId?: string;
        oldBrokerId?: string;
        newBrokerId?: string;
      } | null;
      assert(metadata?.traderId === trader.id, 'AuditLog metadata.traderId matches');
      assert(metadata?.oldBrokerId === brokerA.id, 'AuditLog metadata.oldBrokerId is the original broker');
      assert(metadata?.newBrokerId === brokerB.id, 'AuditLog metadata.newBrokerId is the new broker');
    }

    console.log('\n--- GET /admin/users reflects the new assignment ---');
    {
      const { status, body } = await apiGet<{
        data: Array<{ id: string; assignedBrokerId: string | null; assignedBrokerName: string | null }>;
      }>(`/admin/users?search=${encodeURIComponent(trader.email)}`, adminToken);

      assert(status === 200, 'GET /admin/users returns 200');
      const found = body.data.find((u) => u.id === trader.id);
      assert(!!found, 'Trader appears in the search results');
      assert(found?.assignedBrokerId === brokerB.id, 'Listed assignedBrokerId is brokerB');
      assert(
        found?.assignedBrokerName === `Admin Reassign Test brokerB`,
        'Listed assignedBrokerName matches brokerB displayName',
      );
    }

    console.log('\n--- Reassigning back to brokerA (round-trip sanity check) ---');
    {
      const { status } = await apiPatch(`/admin/users/${trader.id}/reassign-broker`, adminToken, {
        brokerId: brokerA.id,
      });
      assert(status === 200, 'Reassigning back to the original broker succeeds');

      const updated = await prisma.user.findUniqueOrThrow({ where: { id: trader.id } });
      assert(updated.assignedBrokerId === brokerA.id, 'User.assignedBrokerId is back to brokerA');
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
