/**
 * End-to-end test for Sprint 13 Step 5 — Admin top-up oversight + override.
 *
 * Not a Jest suite — drives the REAL running server's HTTP API with real
 * signed JWTs (admin via actual login, non-admin via a signed test token —
 * same pattern as test-admin-users.ts).
 *
 * Covers:
 *   - Admin override top-up of Rs. 20,000 for a fresh trader — well above
 *     the Rs. 5,00,000 weekly cap doesn't matter here, but a value already
 *     inside typical broker top-up range proves the endpoint isn't
 *     accidentally gated by anything cap-related
 *   - Wallet availableBalance AND totalDeposited both increase correctly
 *   - Transaction row created with type MANUAL_ADJUST (not
 *     COLLATERAL_TOP_UP), correct amount, referencing the TopUpRequest
 *   - AuditLog row created with action MANUAL_ADJUST, userId = admin (the
 *     actor — same convention as USER_SUSPENDED/USER_UNSUSPENDED),
 *     metadata.reason and metadata.reference present
 *   - TopUpRequest row created: status COMPLETED, brokerId = admin's own
 *     id (see admin.repository.ts's createOverrideTopUpRequest for why),
 *     weeklyTotalBefore recorded even though never enforced
 *   - GET /admin/topups includes the override in the paginated list, with
 *     the correct trader/broker(=admin) names joined in
 *   - DTO validation: missing/too-short reason -> 400
 *   - Non-admin token -> 403 on both GET and POST /admin/topups
 *
 * Run with: npx tsx scripts/test-admin-topups.ts (from server/)
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
const TEST_EMAIL_DOMAIN = 'admin-topups-test.nebula';
const ADMIN_EMAIL = 'admin@nebula.com';
const ADMIN_PASSWORD = 'ChangeMe123!';
const OVERRIDE_AMOUNT_PAISE = 2_000_000; // Rs. 20,000

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

// ─── Test trader setup ────────────────────────────────────────────────────

interface TestTrader {
  id: string;
  email: string;
  walletId: string;
}

async function createTestTrader(startingBalancePaise: number): Promise<TestTrader> {
  const email = `trader-${randomUUID().slice(0, 8)}@${TEST_EMAIL_DOMAIN}`;
  const user = await prisma.user.create({
    data: {
      email,
      password: null,
      userType: UserType.TRADER,
      displayName: 'Admin Topups Test Trader',
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
      isOnboardingComplete: true,
      isFirstLogin: false,
    },
  });
  const wallet = await prisma.wallet.create({
    data: {
      userId: user.id,
      availableBalance: startingBalancePaise,
      reservedBalance: 0,
      totalDeposited: startingBalancePaise,
    },
  });
  return { id: user.id, email, walletId: wallet.id };
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
  // trader's — see admin.service.ts's overrideTopUp. metadata.targetUserId
  // holds the trader's id instead, so a raw JSON-path match is needed to
  // find and remove test-generated rows (same approach as
  // test-admin-users.ts's purgeTestData).
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
  console.log('Admin Top-Up Oversight + Override — end-to-end test\n');

  console.log('Cleaning up any leftovers from a previous run...');
  await purgeTestData();

  console.log('\nLogging in as admin...');
  const adminToken = await loginAsAdmin();
  const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
  console.log(`  Logged in as ${ADMIN_EMAIL}`);

  console.log('\nCreating test trader...');
  const trader = await createTestTrader(5_000_000); // Rs. 50,000
  const bystander = await createTestTrader(5_000_000); // for the non-admin 403 checks
  console.log(`  Created trader ${trader.email}`);

  const walletBefore = await prisma.wallet.findUniqueOrThrow({ where: { id: trader.walletId } });

  try {
    console.log('\n--- Validation: missing/short reason (400) ---');
    {
      const { status, body } = await apiPost<{ statusCode: number }>('/admin/topups', adminToken, {
        traderId: trader.id,
        amountPaise: OVERRIDE_AMOUNT_PAISE,
        reason: 'short',
        reference: 'REF-1',
      });
      assert(status === 400, 'Override with a <10-char reason returns 400');
    }

    console.log('\n--- Non-admin token rejected on POST /admin/topups (403) ---');
    {
      const bystanderToken = signTestAccessToken(bystander.id, bystander.email, UserType.TRADER);
      const { status } = await apiPost('/admin/topups', bystanderToken, {
        traderId: trader.id,
        amountPaise: OVERRIDE_AMOUNT_PAISE,
        reason: 'Should be rejected before reaching the service.',
        reference: 'REF-2',
      });
      assert(status === 403, 'POST /admin/topups with a trader token returns 403');
    }

    console.log('\n--- Non-admin token rejected on GET /admin/topups (403) ---');
    {
      const bystanderToken = signTestAccessToken(bystander.id, bystander.email, UserType.TRADER);
      const { status } = await apiGet('/admin/topups', bystanderToken);
      assert(status === 403, 'GET /admin/topups with a trader token returns 403');
    }

    console.log('\n--- Non-TRADER target rejected ---');
    {
      const { status, body } = await apiPost<{ code?: string }>('/admin/topups', adminToken, {
        traderId: adminUser.id, // admin is not a TRADER
        amountPaise: OVERRIDE_AMOUNT_PAISE,
        reason: 'Attempting to override-topup the admin account itself.',
        reference: 'REF-ADMIN',
      });
      assert(status === 404, 'Overriding a non-trader userId returns 404');
      assert(body.code === 'NOT_FOUND', 'Error code is NOT_FOUND');
    }

    console.log('\n--- Admin override top-up (Rs. 20,000) ---');
    let topUpRequestId = '';
    {
      const { status, body } = await apiPost<{
        message: string;
        topUpRequest: { id: string; traderId: string; amountPaise: number; weeklyTotalBefore: number };
        wallet: { availableBalancePaise: number; totalDepositedPaise: number };
      }>('/admin/topups', adminToken, {
        traderId: trader.id,
        amountPaise: OVERRIDE_AMOUNT_PAISE,
        reason: 'Manual adjustment for Sprint 13 Step 5 test run.',
        reference: 'ADMIN-OVERRIDE-TEST-001',
      });

      assert(status === 200, 'POST /admin/topups returns 200');
      assert(body.topUpRequest?.traderId === trader.id, 'Response topUpRequest.traderId matches');
      assert(body.topUpRequest?.amountPaise === OVERRIDE_AMOUNT_PAISE, 'Response topUpRequest.amountPaise matches');
      assert(body.topUpRequest?.weeklyTotalBefore === 0, 'weeklyTotalBefore recorded as 0 (fresh trader, no prior top-ups)');
      assert(
        body.wallet?.availableBalancePaise === walletBefore.availableBalance + OVERRIDE_AMOUNT_PAISE,
        'Response wallet.availableBalancePaise reflects the credit',
      );
      topUpRequestId = body.topUpRequest?.id ?? '';
      assert(!!topUpRequestId, 'Response includes a topUpRequest id');
    }

    console.log('\n--- Wallet actually credited in DB ---');
    {
      const walletAfter = await prisma.wallet.findUniqueOrThrow({ where: { id: trader.walletId } });
      assert(
        walletAfter.availableBalance === walletBefore.availableBalance + OVERRIDE_AMOUNT_PAISE,
        'availableBalance increased by exactly the override amount',
      );
      assert(
        walletAfter.totalDeposited === walletBefore.totalDeposited + OVERRIDE_AMOUNT_PAISE,
        'totalDeposited increased by exactly the override amount',
      );
    }

    console.log('\n--- TopUpRequest row ---');
    {
      const topUpRequest = await prisma.topUpRequest.findUniqueOrThrow({ where: { id: topUpRequestId } });
      assert(topUpRequest.status === 'COMPLETED', 'TopUpRequest.status is COMPLETED');
      assert(topUpRequest.traderId === trader.id, 'TopUpRequest.traderId is the trader');
      assert(topUpRequest.brokerId === adminUser.id, 'TopUpRequest.brokerId is the admin (no real broker involved)');
      assert(topUpRequest.transactionRef === 'ADMIN-OVERRIDE-TEST-001', 'TopUpRequest.transactionRef matches the DTO reference');
      assert(topUpRequest.amountPaise === OVERRIDE_AMOUNT_PAISE, 'TopUpRequest.amountPaise matches');
    }

    console.log('\n--- Transaction row ---');
    {
      const txns = await prisma.transaction.findMany({
        where: { walletId: trader.walletId, referenceId: topUpRequestId },
      });
      assert(txns.length === 1, 'Exactly one Transaction row references the override TopUpRequest');
      assert(txns[0]?.type === 'MANUAL_ADJUST', 'Transaction.type is MANUAL_ADJUST (not COLLATERAL_TOP_UP)');
      assert(txns[0]?.amount === OVERRIDE_AMOUNT_PAISE, 'Transaction.amount matches the override amount');
    }

    console.log('\n--- AuditLog row ---');
    {
      const auditRows = await prisma.auditLog.findMany({
        where: { userId: adminUser.id, action: 'MANUAL_ADJUST' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });
      assert(auditRows.length === 1, 'AuditLog row created for MANUAL_ADJUST');
      const metadata = auditRows[0]?.metadata as {
        targetUserId?: string;
        reason?: string;
        reference?: string;
        amountPaise?: number;
      } | null;
      assert(metadata?.targetUserId === trader.id, 'AuditLog.userId is the ADMIN; metadata.targetUserId is the trader');
      assert(metadata?.reason === 'Manual adjustment for Sprint 13 Step 5 test run.', 'metadata.reason matches');
      assert(metadata?.reference === 'ADMIN-OVERRIDE-TEST-001', 'metadata.reference matches');
      assert(metadata?.amountPaise === OVERRIDE_AMOUNT_PAISE, 'metadata.amountPaise matches');
    }

    console.log('\n--- GET /admin/topups includes the override ---');
    {
      const { status, body } = await apiGet<{
        data: Array<{
          topUpRequestId: string;
          traderId: string;
          traderName: string | null;
          traderEmail: string;
          brokerId: string;
          brokerName: string | null;
          amountPaise: number;
          amountFormatted: string;
          status: string;
        }>;
        pagination: { totalCount: number };
      }>('/admin/topups?limit=50', adminToken);

      assert(status === 200, 'GET /admin/topups returns 200');
      const found = body.data.find((t) => t.topUpRequestId === topUpRequestId);
      assert(!!found, 'The override top-up appears in the list');
      assert(found?.traderId === trader.id, 'Listed traderId matches');
      assert(found?.traderEmail === trader.email, 'Listed traderEmail matches (joined from User)');
      assert(found?.brokerId === adminUser.id, 'Listed brokerId is the admin');
      assert(found?.brokerName === adminUser.displayName, 'Listed brokerName is the admin\'s displayName (joined from User)');
      assert(found?.amountPaise === OVERRIDE_AMOUNT_PAISE, 'Listed amountPaise matches');
      assert(found?.amountFormatted === 'Rs. 20,000.00', 'Listed amountFormatted is correctly formatted');
      assert(found?.status === 'COMPLETED', 'Listed status is COMPLETED');
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
