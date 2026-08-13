/**
 * End-to-end test for Sprint 13 Step 4 — Admin user management.
 *
 * Not a Jest suite — drives the REAL running server's HTTP API with real
 * signed JWTs (admin via actual login, trader via a signed test token —
 * same pattern as test-learning.ts), exactly like a genuine client would.
 *
 * Covers:
 *   - Seeds a test trader with a BUY LIMIT order (reserves balance) and a
 *     SELL LIMIT order (reserves shares, requires a starting holding)
 *   - GET /admin/users returns the trader with correct wallet/order shape
 *   - PATCH /admin/users/:id/suspend (as admin) cancels both orders,
 *     releases reserved balance AND reserved shares, publishes
 *     orders:cancel for each LIMIT order, invalidates sessions, and
 *     writes an AuditLog row keyed by the ADMIN's id (not the trader's)
 *   - Suspended trader cannot log in (ACCOUNT_SUSPENDED)
 *   - Non-admin (trader) token gets 403 on both suspend/unsuspend routes
 *   - PATCH /admin/users/:id/unsuspend restores login, does NOT resurrect
 *     the cancelled orders
 *   - Double-suspend and double-unsuspend are rejected (VALIDATION_ERROR)
 *   - Suspending the admin account itself is rejected
 *
 * Run with: npx tsx scripts/test-admin-users.ts (from server/)
 * Requires the server already running on TEST_SERVER_URL (default
 * http://localhost:3001/api/v1), Postgres + Redis reachable per
 * .env.development, and the seed already applied (admin@nebula.com /
 * ChangeMe123!, NABIL stock).
 */

import { PrismaClient, UserType, OrderStatus, OrderStyle, OrderType } from '@prisma/client';
import Redis from 'ioredis';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: path.resolve(__dirname, '..', '.env.development') });

const prisma = new PrismaClient();

const SERVER_URL = process.env.TEST_SERVER_URL || 'http://localhost:3001/api/v1';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const SYMBOL = 'NABIL';
const TEST_EMAIL_DOMAIN = 'admin-users-test.nebula';
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

async function apiPost<T>(urlPath: string, body: unknown): Promise<ApiResult<T>> {
  const res = await fetch(`${SERVER_URL}${urlPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json as T };
}

// ─── Test JWT signing (trader) ───────────────────────────────────────────
// Signs a real access token with the same secret/shape the server's own
// generateAccessToken() produces — drives the actual JwtStrategy/
// JwtAuthGuard/AdminGuard path, not a mock. Admin's own token comes from
// a real login (see loginAsAdmin) since we need to prove the real admin
// credential flow works end-to-end here, not just the guard's role check.

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
  const { status, body } = await apiPost<{ accessToken?: string }>('/auth/login', {
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

async function login(email: string, password: string): Promise<ApiResult<{ accessToken?: string; code?: string }>> {
  const deviceId = randomUUID();
  return apiPost('/auth/login', { email, password, deviceId });
}

// ─── Test user + order setup ─────────────────────────────────────────────

interface TestUser {
  id: string;
  email: string;
  password: string;
  walletId: string;
}

const TEST_PASSWORD = 'TestPass123!';

async function createTestTrader(startingBalancePaise: number): Promise<TestUser> {
  // Reuse the server's own hashPassword so login() can authenticate for real.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { hashPassword } = require('../src/shared/utils/crypto');
  const email = `trader-${randomUUID().slice(0, 8)}@${TEST_EMAIL_DOMAIN}`;
  const hashed = await hashPassword(TEST_PASSWORD);
  const user = await prisma.user.create({
    data: {
      email,
      password: hashed,
      userType: UserType.TRADER,
      displayName: 'Admin Users Test Trader',
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
  return { id: user.id, email, password: TEST_PASSWORD, walletId: wallet.id };
}

async function grantHolding(userId: string, stockId: string, quantity: number, avgPricePaise: number): Promise<void> {
  const portfolio = await prisma.portfolio.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
  await prisma.holding.create({
    data: {
      userId,
      stockId,
      portfolioId: portfolio.id,
      quantity,
      reservedQuantity: 0,
      averageBuyPrice: avgPricePaise,
    },
  });
}

/** Creates a PENDING BUY LIMIT order and reserves balance for it, bypassing the HTTP layer (direct DB write — this test targets suspend's cancellation logic, not order placement, which is already covered by other test scripts). */
async function createPendingBuyOrder(
  user: TestUser,
  stockId: string,
  quantity: number,
  pricePaise: number,
): Promise<string> {
  const totalCost = quantity * pricePaise;
  const order = await prisma.order.create({
    data: {
      userId: user.id,
      stockId,
      type: OrderType.BUY,
      orderStyle: OrderStyle.LIMIT,
      price: pricePaise,
      quantity,
      status: OrderStatus.PENDING,
    },
  });
  await prisma.wallet.update({
    where: { id: user.walletId },
    data: { reservedBalance: { increment: totalCost } },
  });
  return order.id;
}

/** Creates a PENDING SELL LIMIT order and reserves shares for it. Requires a prior grantHolding() call for the same stock. */
async function createPendingSellOrder(
  user: TestUser,
  stockId: string,
  quantity: number,
  pricePaise: number,
): Promise<string> {
  const order = await prisma.order.create({
    data: {
      userId: user.id,
      stockId,
      type: OrderType.SELL,
      orderStyle: OrderStyle.LIMIT,
      price: pricePaise,
      quantity,
      status: OrderStatus.PENDING,
    },
  });
  await prisma.holding.update({
    where: { userId_stockId: { userId: user.id, stockId } },
    data: { reservedQuantity: { increment: quantity } },
  });
  return order.id;
}

// ─── Cleanup ─────────────────────────────────────────────────────────────

async function purgeTestData(): Promise<void> {
  const testUsers = await prisma.user.findMany({
    where: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } },
    select: { id: true },
  });
  const userIds = testUsers.map((u) => u.id);
  if (userIds.length === 0) return;

  await prisma.trade.deleteMany({
    where: { OR: [{ buyOrder: { userId: { in: userIds } } }, { sellOrder: { userId: { in: userIds } } }] },
  });
  // AuditLog rows from suspend/unsuspend are keyed by the ADMIN's userId
  // (the actor), not the trader's — so they can't be swept via the
  // trader userIds filter used below. metadata.targetUserId holds the
  // trader's id instead; a raw JSON-path match cleans those up.
  await prisma.$executeRawUnsafe(
    `DELETE FROM "AuditLog" WHERE metadata->>'targetUserId' IN (${userIds.map((id) => `'${id}'`).join(',') || "''"})`,
  ).catch(() => {});
  await prisma.transaction.deleteMany({ where: { wallet: { userId: { in: userIds } } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.order.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.holding.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.portfolio.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.wallet.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });

  console.log(`  Purged ${userIds.length} leftover test user(s) and their data`);
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Admin User Management — end-to-end test\n');

  console.log('Cleaning up any leftovers from a previous run...');
  await purgeTestData();

  const stock = await prisma.stock.findUnique({ where: { symbol: SYMBOL } });
  if (!stock) {
    throw new Error(`Stock ${SYMBOL} not found — run "npx prisma db seed" in server/ before this test`);
  }

  console.log('\nLogging in as admin...');
  const adminToken = await loginAsAdmin();
  const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
  console.log(`  Logged in as ${ADMIN_EMAIL}`);

  console.log('\nCreating test trader with pending orders...');
  const trader = await createTestTrader(5_000_000); // Rs. 50,000
  await grantHolding(trader.id, stock.id, 100, stock.currentPrice); // 100 shares, no reservation
  const buyOrderId = await createPendingBuyOrder(trader, stock.id, 10, 50000); // reserves 500,000 paise
  const sellOrderId = await createPendingSellOrder(trader, stock.id, 20, 50000); // reserves 20 shares
  console.log(`  Created trader ${trader.email} with 1 BUY LIMIT + 1 SELL LIMIT pending order`);

  const walletBefore = await prisma.wallet.findUniqueOrThrow({ where: { id: trader.walletId } });
  const holdingBefore = await prisma.holding.findUniqueOrThrow({
    where: { userId_stockId: { userId: trader.id, stockId: stock.id } },
  });
  assert(walletBefore.reservedBalance === 500_000, 'Wallet reservedBalance is 500,000 before suspension');
  assert(holdingBefore.reservedQuantity === 20, 'Holding reservedQuantity is 20 before suspension');

  // Subscribe to orders:cancel BEFORE suspending, so we can prove the
  // publish actually happens (no real engine process needed for this —
  // we're testing that AdminService publishes, not that an engine
  // consumes it; engine consumption is already covered by
  // engine/scripts/test-integration.ts).
  const subscriber = new Redis(REDIS_URL);
  const publishedCancelIds: string[] = [];
  await subscriber.subscribe('orders:cancel');
  subscriber.on('message', (_channel, message) => {
    try {
      const parsed = JSON.parse(message);
      if (parsed.orderId) publishedCancelIds.push(parsed.orderId);
    } catch {
      // ignore malformed
    }
  });

  try {
    console.log('\n--- GET /admin/users (list + filter) ---');
    {
      const { status, body } = await apiGet<{
        data: Array<{ id: string; email: string; wallet: { availableBalancePaise: number; totalDepositedPaise: number } | null; orderCount: number }>;
        pagination: { page: number; totalPages: number; totalCount: number; limit: number };
      }>(`/admin/users?userType=TRADER&search=${trader.email}`, adminToken);

      assert(status === 200, 'GET /admin/users returns 200');
      const found = body.data.find((u) => u.id === trader.id);
      assert(!!found, 'Trader appears in the filtered list');
      assert(found?.wallet?.availableBalancePaise === walletBefore.availableBalance, 'wallet.availableBalancePaise matches DB');
      assert(found?.wallet?.totalDepositedPaise === walletBefore.totalDeposited, 'wallet.totalDepositedPaise matches DB');
      assert(found?.orderCount === 2, 'orderCount reflects both pending orders');
      assert(typeof body.pagination.totalCount === 'number', 'pagination shape present');
    }

    console.log('\n--- Non-admin token rejected (403) ---');
    {
      const traderToken = signTestAccessToken(trader.id, trader.email, UserType.TRADER);
      const { status } = await apiPatch(`/admin/users/${trader.id}/suspend`, traderToken, {
        reason: 'Should be rejected before reaching the service',
      });
      assert(status === 403, 'PATCH .../suspend with a trader token returns 403');
    }

    console.log('\n--- Validation: reason too short ---');
    {
      const { status, body } = await apiPatch<{ code?: string }>(`/admin/users/${trader.id}/suspend`, adminToken, {
        reason: 'short',
      });
      assert(status === 400, 'Suspend with a <10-char reason returns 400');
      // NOT VALIDATION_ERROR here — this is a pre-existing, codebase-wide
      // gap, not specific to this route: GlobalExceptionFilter only maps
      // exception.getResponse().code onto the response, and NestJS's
      // built-in ValidationPipe throws a BadRequestException whose body is
      // `{ statusCode, message: string[], error }` with no `code` field at
      // all, so it always falls through to the filter's 'UNKNOWN_ERROR'
      // default — regardless of which DTO or which route. CLAUDE.md's
      // error table documents VALIDATION_ERROR as the intended code for
      // "DTO validation failed," but the filter has never implemented that
      // mapping. Out of scope to fix here (it's a cross-cutting change to
      // the global filter, not a user-management change) — flagged in the
      // Sprint 13 Step 4 report instead. This assertion documents the
      // ACTUAL current behavior so the test doesn't lie about it.
      assert(body.code === 'UNKNOWN_ERROR', 'Error code is UNKNOWN_ERROR (pre-existing global filter gap — see comment)');
    }

    console.log('\n--- Suspend the trader ---');
    {
      const { status, body } = await apiPatch<{ message: string; cancelledOrderCount: number }>(
        `/admin/users/${trader.id}/suspend`,
        adminToken,
        { reason: 'Suspicious trading pattern flagged during Sprint 13 test run.' },
      );
      assert(status === 200, 'PATCH .../suspend returns 200');
      assert(body.cancelledOrderCount === 2, 'Response reports 2 cancelled orders');
    }

    // Give the Redis pub/sub subscriber a moment to receive both publishes.
    await sleep(500);

    console.log('\n--- Orders actually cancelled + balances released ---');
    {
      const buyOrder = await prisma.order.findUniqueOrThrow({ where: { id: buyOrderId } });
      const sellOrder = await prisma.order.findUniqueOrThrow({ where: { id: sellOrderId } });
      assert(buyOrder.status === OrderStatus.CANCELLED, 'BUY LIMIT order is CANCELLED');
      assert(sellOrder.status === OrderStatus.CANCELLED, 'SELL LIMIT order is CANCELLED');

      const walletAfter = await prisma.wallet.findUniqueOrThrow({ where: { id: trader.walletId } });
      const holdingAfter = await prisma.holding.findUniqueOrThrow({
        where: { userId_stockId: { userId: trader.id, stockId: stock.id } },
      });
      assert(walletAfter.reservedBalance === 0, 'Wallet reservedBalance released to 0');
      assert(walletAfter.availableBalance === walletBefore.availableBalance, 'availableBalance unchanged (release, not a debit)');
      assert(holdingAfter.reservedQuantity === 0, 'Holding reservedQuantity released to 0');
      assert(holdingAfter.quantity === 100, 'Holding quantity unchanged (release, not a sale)');
    }

    console.log('\n--- orders:cancel published for both LIMIT orders ---');
    {
      assert(publishedCancelIds.includes(buyOrderId), 'orders:cancel published for the BUY order');
      assert(publishedCancelIds.includes(sellOrderId), 'orders:cancel published for the SELL order');
    }

    console.log('\n--- ORDER_CANCEL transactions recorded ---');
    {
      const cancelTxns = await prisma.transaction.findMany({
        where: { walletId: trader.walletId, type: 'ORDER_CANCEL' },
      });
      assert(cancelTxns.length === 2, 'Two ORDER_CANCEL transaction rows created');
    }

    console.log('\n--- User row + AuditLog ---');
    {
      const suspended = await prisma.user.findUniqueOrThrow({ where: { id: trader.id } });
      assert(suspended.isSuspended === true, 'User.isSuspended is true');
      assert(
        suspended.suspendedReason === 'Suspicious trading pattern flagged during Sprint 13 test run.',
        'User.suspendedReason matches the request body',
      );

      const auditRows = await prisma.auditLog.findMany({
        where: { userId: adminUser.id, action: 'USER_SUSPENDED' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });
      assert(auditRows.length === 1, 'AuditLog row created for USER_SUSPENDED');
      const metadata = auditRows[0]?.metadata as { targetUserId?: string } | null;
      assert(metadata?.targetUserId === trader.id, 'AuditLog.userId is the ADMIN; metadata.targetUserId is the trader');
    }

    console.log('\n--- Session invalidated: suspended user cannot log in ---');
    {
      const { status, body } = await login(trader.email, trader.password);
      assert(status === 401, 'Suspended trader login returns 401');
      assert(body.code === 'ACCOUNT_SUSPENDED', 'Error code is ACCOUNT_SUSPENDED');
    }

    console.log('\n--- Double-suspend rejected ---');
    {
      const { status, body } = await apiPatch<{ code?: string }>(`/admin/users/${trader.id}/suspend`, adminToken, {
        reason: 'Trying to suspend an already-suspended user.',
      });
      assert(status === 400, 'Suspending an already-suspended user returns 400');
      assert(body.code === 'VALIDATION_ERROR', 'Error code is VALIDATION_ERROR');
    }

    console.log('\n--- Admin cannot suspend the admin account ---');
    {
      const { status, body } = await apiPatch<{ code?: string }>(`/admin/users/${adminUser.id}/suspend`, adminToken, {
        reason: 'Attempting to suspend the admin account itself.',
      });
      assert(status === 400, 'Suspending the ADMIN account returns 400');
      assert(body.code === 'VALIDATION_ERROR', 'Error code is VALIDATION_ERROR');
    }

    console.log('\n--- Non-admin token rejected on unsuspend too (403) ---');
    {
      // Deliberately NOT using `trader`'s own token here — trader is still
      // suspended at this point in the flow, and a suspended user's token
      // is rejected by JwtStrategy itself (401 ACCOUNT_SUSPENDED) before
      // AdminGuard's role check ever runs (see jwt.strategy.ts — suspension
      // is checked before the request reaches any route guard). That's
      // correct, more secure behavior, but it would prove the wrong thing
      // here — this check needs a non-admin, NON-suspended user to actually
      // exercise AdminGuard's 403 path.
      const bystander = await createTestTrader(5_000_000);
      const bystanderToken = signTestAccessToken(bystander.id, bystander.email, UserType.TRADER);
      const { status } = await apiPatch(`/admin/users/${trader.id}/unsuspend`, bystanderToken);
      assert(status === 403, 'PATCH .../unsuspend with a non-suspended trader token returns 403');
    }

    console.log('\n--- Unsuspend the trader ---');
    {
      const { status } = await apiPatch(`/admin/users/${trader.id}/unsuspend`, adminToken);
      assert(status === 200, 'PATCH .../unsuspend returns 200');

      const restored = await prisma.user.findUniqueOrThrow({ where: { id: trader.id } });
      assert(restored.isSuspended === false, 'User.isSuspended is false after unsuspend');
      assert(restored.suspendedReason === null, 'User.suspendedReason cleared after unsuspend');

      const auditRows = await prisma.auditLog.findMany({
        where: { userId: adminUser.id, action: 'USER_UNSUSPENDED' },
      });
      assert(auditRows.length === 1, 'AuditLog row created for USER_UNSUSPENDED');
    }

    console.log('\n--- Orders NOT resurrected by unsuspend ---');
    {
      const buyOrder = await prisma.order.findUniqueOrThrow({ where: { id: buyOrderId } });
      const sellOrder = await prisma.order.findUniqueOrThrow({ where: { id: sellOrderId } });
      assert(buyOrder.status === OrderStatus.CANCELLED, 'BUY order stays CANCELLED after unsuspend');
      assert(sellOrder.status === OrderStatus.CANCELLED, 'SELL order stays CANCELLED after unsuspend');

      const walletAfterUnsuspend = await prisma.wallet.findUniqueOrThrow({ where: { id: trader.walletId } });
      assert(walletAfterUnsuspend.reservedBalance === 0, 'reservedBalance still 0 — nothing re-reserved');
    }

    console.log('\n--- User can log in again after unsuspend ---');
    {
      const { status, body } = await login(trader.email, trader.password);
      assert(status === 200, 'Trader login succeeds after unsuspend');
      assert(!!body.accessToken, 'Login returns an access token');
    }

    console.log('\n--- Double-unsuspend rejected ---');
    {
      const { status, body } = await apiPatch<{ code?: string }>(`/admin/users/${trader.id}/unsuspend`, adminToken);
      assert(status === 400, 'Unsuspending an already-active user returns 400');
      assert(body.code === 'VALIDATION_ERROR', 'Error code is VALIDATION_ERROR');
    }
  } finally {
    await subscriber.unsubscribe('orders:cancel');
    await subscriber.quit();
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
