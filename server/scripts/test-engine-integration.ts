/**
 * End-to-end integration test: server <-> engine, real order matching.
 *
 * Not a Jest suite — spins up the REAL engine process and drives the REAL
 * HTTP API (this server must already be running, or this script will start
 * one itself — see START_SERVER below) with real signed JWTs, exactly like
 * a genuine client would. This proves the full Sprint 9 wiring:
 *
 *   HTTP POST /orders (LIMIT)
 *     -> TradingService.placeOrder
 *     -> orders:new (Redis pub/sub)
 *     -> engine order book + matching (real engine/src/*)
 *     -> orders:filled (Redis pub/sub)
 *     -> EngineService.settleFill
 *     -> wallet/holding/order/transaction/trade rows updated
 *
 * Run with: npx tsx scripts/test-engine-integration.ts
 * (from server/) — requires Postgres + Redis reachable per .env.development,
 * and node_modules installed at the workspace root.
 *
 * Test data: two throwaway trader users (emails under @engine-test.nebula,
 * easy to spot and safe to re-run — the script deletes them at the end
 * regardless of pass/fail, and also purges any leftovers from a previous
 * crashed run before starting).
 */

import { PrismaClient, UserType, OrderStatus, OrderStyle, OrderType } from '@prisma/client';
import Redis from 'ioredis';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: path.resolve(__dirname, '..', '.env.development') });

const prisma = new PrismaClient();

const SERVER_URL = process.env.TEST_SERVER_URL || 'http://localhost:3001/api/v1';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const SYMBOL = 'NABIL';
const TEST_EMAIL_DOMAIN = 'engine-test.nebula';
const FILL_WAIT_TIMEOUT_MS = 20_000;
const FILL_POLL_INTERVAL_MS = 500;

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

// ─── Test JWT signing ────────────────────────────────────────────────────
//
// Signs a real access token with the same secret/shape the server's own
// generateAccessToken() produces (see shared/utils/tokens.ts). This drives
// the actual JwtStrategy/JwtAuthGuard/OnboardingGuard path — not a mock.

function signTestAccessToken(userId: string, email: string): string {
  if (!JWT_ACCESS_SECRET) {
    throw new Error('JWT_ACCESS_SECRET not found in .env.development — cannot sign test tokens');
  }
  return jwt.sign(
    { sub: userId, email, userType: UserType.TRADER, jti: randomUUID() },
    JWT_ACCESS_SECRET,
    { expiresIn: '15m' },
  );
}

// ─── HTTP helpers ────────────────────────────────────────────────────────

interface ApiResult<T> {
  status: number;
  body: T;
}

async function apiPost<T>(
  urlPath: string,
  token: string,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<ApiResult<T>> {
  const res = await fetch(`${SERVER_URL}${urlPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json as T };
}

async function apiPatch<T>(urlPath: string, token: string): Promise<ApiResult<T>> {
  const res = await fetch(`${SERVER_URL}${urlPath}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json as T };
}

// ─── Test user setup ─────────────────────────────────────────────────────
//
// Users are seeded directly via Prisma rather than the full
// register -> verify-email -> select-broker flow. That flow is already
// covered by its own auth tests; re-deriving it here would test email
// delivery and broker onboarding, not order matching. What this script
// needs is two fully-onboarded traders with wallets — which is exactly
// what CLAUDE.md's registration flow produces as its end state.

interface TestUser {
  id: string;
  email: string;
  walletId: string;
}

async function createTestTrader(label: string, startingBalancePaise: number): Promise<TestUser> {
  const email = `${label}-${randomUUID().slice(0, 8)}@${TEST_EMAIL_DOMAIN}`;
  const user = await prisma.user.create({
    data: {
      email,
      password: null,
      userType: UserType.TRADER,
      displayName: `Engine Test ${label}`,
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

/** Gives a trader a starting holding of `quantity` shares of NABIL, no reservation. */
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

// ─── Cleanup ─────────────────────────────────────────────────────────────

async function purgeTestData(): Promise<void> {
  const testUsers = await prisma.user.findMany({
    where: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } },
    select: { id: true },
  });
  const userIds = testUsers.map((u) => u.id);
  if (userIds.length === 0) return;

  // Delete in FK-dependency order: trades -> transactions -> notifications
  // -> orders -> holdings -> portfolios -> wallets -> users.
  await prisma.trade.deleteMany({
    where: { OR: [{ buyOrder: { userId: { in: userIds } } }, { sellOrder: { userId: { in: userIds } } }] },
  });
  await prisma.transaction.deleteMany({ where: { wallet: { userId: { in: userIds } } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.order.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.holding.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.portfolio.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.wallet.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });

  console.log(`  Purged ${userIds.length} leftover test user(s) and their data`);
}

// ─── Engine process management (same approach as engine/scripts/test-integration.ts) ──

function resolveTsxCliEntry(): string {
  // require.resolve('tsx/dist/cli.mjs') is blocked by tsx's package.json
  // "exports" map; resolving the package root via package.json (which
  // exports maps always allow) and joining the known relative path works
  // regardless of hoisting depth in this monorepo.
  const tsxPackageJson = require.resolve('tsx/package.json');
  return path.join(path.dirname(tsxPackageJson), 'dist', 'cli.mjs');
}

function spawnEngine(): ChildProcess {
  const engineEntry = path.resolve(__dirname, '..', '..', 'engine', 'src', 'index.ts');
  const tsxCliEntry = resolveTsxCliEntry();

  // Spawn node.exe directly against tsx's .mjs CLI — not `npx tsx` or the
  // tsx.cmd/tsx bin shim. On Windows, npx needs a shell (ENOENT without
  // one), shell:true makes the shell process the trackable PID instead of
  // the real engine (so killing it leaves an orphan), and tsx.cmd directly
  // fails with EINVAL (a .cmd isn't directly executable without a shell).
  // node.exe + a plain .mjs argument avoids all three.
  return spawn(process.execPath, [tsxCliEntry, engineEntry], {
    cwd: path.resolve(__dirname, '..', '..', 'engine'),
    env: {
      ...process.env,
      REDIS_URL,
      ENGINE_HTTP_PORT: '3103', // avoid colliding with a real engine on 3003
      PRICE_UPDATE_INTERVAL_MS: '500', // fast ticks so matching runs quickly
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function killProcessTree(pid: number): void {
  if (process.platform === 'win32') {
    try {
      require('node:child_process').execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
    } catch {
      // Already gone — fine.
    }
  } else {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Already gone — fine.
    }
  }
}

async function stopChild(child: ChildProcess, label: string): Promise<void> {
  if (child.killed || child.exitCode !== null || child.pid === undefined) return;

  child.kill('SIGTERM');
  await Promise.race([
    new Promise<void>((resolve) => child.once('exit', () => resolve())),
    sleep(5000),
  ]);

  if (child.exitCode === null && !child.killed) {
    console.log(`  ${label} did not exit gracefully in time — force killing process tree`);
    killProcessTree(child.pid);
  } else {
    console.log(`  ${label} shut down gracefully`);
  }
}

function waitForLog(child: ChildProcess, match: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for "${match}" in ${match.includes('Engine') ? 'engine' : 'process'} output`));
    }, timeoutMs);
    const onData = (chunk: Buffer) => {
      if (chunk.toString().includes(match)) {
        clearTimeout(timer);
        child.stdout?.off('data', onData);
        resolve();
      }
    };
    child.stdout?.on('data', onData);
  });
}

// ─── Polling helpers ─────────────────────────────────────────────────────

async function pollOrderStatus(
  orderId: string,
  wantedStatuses: OrderStatus[],
  timeoutMs: number,
): Promise<Awaited<ReturnType<typeof prisma.order.findUnique>>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (order && wantedStatuses.includes(order.status)) {
      return order;
    }
    if (Date.now() > deadline) {
      return order;
    }
    await sleep(FILL_POLL_INTERVAL_MS);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Purging any leftover test data from a previous run...');
  await purgeTestData();

  const stock = await prisma.stock.findUnique({ where: { symbol: SYMBOL } });
  if (!stock) {
    throw new Error(
      `Stock ${SYMBOL} not found — run "npx prisma db seed" in server/ before this test`,
    );
  }

  console.log('\nCreating test traders...');
  const buyer = await createTestTrader('buyer', 5_000_000); // Rs. 50,000
  const seller = await createTestTrader('seller', 5_000_000);
  await grantHolding(seller.id, stock.id, 100, stock.currentPrice); // seller starts with 100 shares
  console.log(`  Buyer:  ${buyer.email} (${buyer.id})`);
  console.log(`  Seller: ${seller.email} (${seller.id})`);

  const buyerToken = signTestAccessToken(buyer.id, buyer.email);
  const sellerToken = signTestAccessToken(seller.id, seller.email);

  let engine: ChildProcess | undefined;
  let serverStarted = false;

  try {
    // ── Confirm the server is reachable (this script does not start it —
    // it's meant to run against `npm run start:dev` / `start:prod` already
    // running, same as any other API integration test) ────────────────────
    console.log('\nChecking server is reachable...');
    const healthRes = await fetch(`${SERVER_URL}/health`).catch(() => null);
    if (!healthRes || !healthRes.ok) {
      throw new Error(
        `Server not reachable at ${SERVER_URL} — start it first with "npm run start:dev" (or start:prod) in server/`,
      );
    }
    console.log('  Server is up');

    // ── Start the real engine ──────────────────────────────────────────
    console.log('\nStarting the real engine...');
    engine = spawnEngine();
    await waitForLog(engine, 'Subscribed to orders:new, orders:cancel', 15_000);
    console.log('  Engine subscribed and running');

    // Give the server's own engine health check a moment, and give
    // BullMQ/pubsub subscriptions time to settle after both processes boot.
    await sleep(1000);

    // ── Place a crossing pair of LIMIT orders via the real HTTP API ────
    console.log('\nStep: Placing LIMIT BUY (buyer) and LIMIT SELL (seller) via POST /orders');

    const buyPrice = stock.currentPrice + 10_000; // deliberately high — guarantees crossing
    const sellPrice = Math.max(1, stock.currentPrice - 10_000); // deliberately low
    const quantity = 10;

    const buyRes = await apiPost<{ id: string; status: string }>(
      '/orders',
      buyerToken,
      { stockId: stock.id, type: 'BUY', orderStyle: 'LIMIT', quantity, price: buyPrice },
      { 'X-Idempotency-Key': randomUUID() },
    );
    assert(buyRes.status === 201, `BUY LIMIT order placed successfully (got HTTP ${buyRes.status})`);
    assert(buyRes.body.status === 'PENDING', `BUY order is PENDING immediately after placement (got ${buyRes.body.status})`);

    const sellRes = await apiPost<{ id: string; status: string }>(
      '/orders',
      sellerToken,
      { stockId: stock.id, type: 'SELL', orderStyle: 'LIMIT', quantity, price: sellPrice },
      { 'X-Idempotency-Key': randomUUID() },
    );
    assert(sellRes.status === 201, `SELL LIMIT order placed successfully (got HTTP ${sellRes.status})`);
    assert(sellRes.body.status === 'PENDING', `SELL order is PENDING immediately after placement (got ${sellRes.body.status})`);

    const buyOrderId = buyRes.body.id;
    const sellOrderId = sellRes.body.id;

    // ── Wait for the engine to match and the server to settle ──────────
    console.log('\nStep: Waiting for the fill to be matched and settled...');
    const settledBuyOrder = await pollOrderStatus(
      buyOrderId,
      [OrderStatus.COMPLETED, OrderStatus.PARTIALLY_FILLED],
      FILL_WAIT_TIMEOUT_MS,
    );
    assert(
      settledBuyOrder?.status === OrderStatus.COMPLETED,
      `BUY order reached COMPLETED (got ${settledBuyOrder?.status ?? 'not found'})`,
    );
    assert(settledBuyOrder?.filledQuantity === quantity, `BUY order filledQuantity is ${quantity}`);

    const settledSellOrder = await prisma.order.findUnique({ where: { id: sellOrderId } });
    assert(
      settledSellOrder?.status === OrderStatus.COMPLETED,
      `SELL order reached COMPLETED (got ${settledSellOrder?.status ?? 'not found'})`,
    );
    assert(settledSellOrder?.filledQuantity === quantity, `SELL order filledQuantity is ${quantity}`);

    // ── Verify wallet balances ──────────────────────────────────────────
    console.log('\nStep: Verifying wallet balances');
    const buyerWallet = await prisma.wallet.findUnique({ where: { userId: buyer.id } });
    const sellerWallet = await prisma.wallet.findUnique({ where: { userId: seller.id } });

    // Fill price is always the resting SELL order's limit price (sellPrice)
    // per the matching engine's rule — the buyer benefits from price
    // improvement (they were willing to pay buyPrice, but only sellPrice
    // was actually charged).
    const expectedCost = sellPrice * quantity;

    assert(
      buyerWallet?.availableBalance === 5_000_000 - expectedCost,
      `Buyer's availableBalance debited by the ACTUAL fill price × qty (Rs. ${(expectedCost / 100).toFixed(2)}), ` +
      `not the buyer's own limit price — got ${buyerWallet?.availableBalance}, expected ${5_000_000 - expectedCost}`,
    );
    assert(
      buyerWallet?.reservedBalance === 0,
      `Buyer's reservedBalance fully released back to 0 (got ${buyerWallet?.reservedBalance})`,
    );
    assert(
      sellerWallet?.availableBalance === 5_000_000 + expectedCost,
      `Seller's availableBalance credited by Rs. ${(expectedCost / 100).toFixed(2)} (got ${sellerWallet?.availableBalance})`,
    );

    // ── Verify holdings ───────────────────────────────────────────────
    console.log('\nStep: Verifying holdings');
    const buyerHolding = await prisma.holding.findUnique({
      where: { userId_stockId: { userId: buyer.id, stockId: stock.id } },
    });
    const sellerHolding = await prisma.holding.findUnique({
      where: { userId_stockId: { userId: seller.id, stockId: stock.id } },
    });

    assert(buyerHolding?.quantity === quantity, `Buyer's holding quantity is ${quantity} (got ${buyerHolding?.quantity})`);
    assert(
      buyerHolding?.averageBuyPrice === sellPrice,
      `Buyer's cost basis is the ACTUAL execution price (${sellPrice}), not their limit price (got ${buyerHolding?.averageBuyPrice})`,
    );
    assert(
      sellerHolding?.quantity === 100 - quantity,
      `Seller's holding quantity reduced to ${100 - quantity} (got ${sellerHolding?.quantity})`,
    );
    assert(
      sellerHolding?.reservedQuantity === 0,
      `Seller's reservedQuantity released back to 0 (got ${sellerHolding?.reservedQuantity})`,
    );

    // ── Verify transactions ──────────────────────────────────────────
    console.log('\nStep: Verifying transactions created');
    const buyerTxns = await prisma.transaction.findMany({ where: { walletId: buyer.walletId } });
    const sellerTxns = await prisma.transaction.findMany({ where: { walletId: seller.walletId } });

    assert(
      buyerTxns.some((t) => t.type === 'TRADE_SETTLE' && t.amount === -expectedCost),
      `Buyer has a TRADE_SETTLE transaction for -Rs. ${(expectedCost / 100).toFixed(2)}`,
    );
    assert(
      buyerTxns.some((t) => t.type === 'ORDER_PLACE'),
      'Buyer has an ORDER_PLACE transaction from order placement',
    );
    assert(
      sellerTxns.some((t) => t.type === 'TRADE_SETTLE' && t.amount === expectedCost),
      `Seller has a TRADE_SETTLE transaction for +Rs. ${(expectedCost / 100).toFixed(2)}`,
    );

    // ── Verify Trade row ──────────────────────────────────────────────
    console.log('\nStep: Verifying Trade row created');
    const trade = await prisma.trade.findFirst({
      where: { buyOrderId, sellOrderId },
    });
    assert(trade !== null, 'A Trade row links the buy and sell orders');
    assert(trade?.quantity === quantity, `Trade quantity is ${quantity} (got ${trade?.quantity})`);
    assert(trade?.price === sellPrice, `Trade price is the execution price ${sellPrice} (got ${trade?.price})`);

    // ── Verify notifications ────────────────────────────────────────────
    console.log('\nStep: Verifying ORDER_FILLED notifications created');
    const buyerNotif = await prisma.notification.findFirst({
      where: { userId: buyer.id, type: 'ORDER_FILLED' },
    });
    const sellerNotif = await prisma.notification.findFirst({
      where: { userId: seller.id, type: 'ORDER_FILLED' },
    });
    assert(buyerNotif !== null, 'Buyer received an ORDER_FILLED notification');
    assert(sellerNotif !== null, 'Seller received an ORDER_FILLED notification');

    // ── Test cancellation ────────────────────────────────────────────
    console.log('\nStep: Testing LIMIT order cancellation via PATCH /orders/:id/cancel');

    const restingRes = await apiPost<{ id: string; status: string }>(
      '/orders',
      buyerToken,
      { stockId: stock.id, type: 'BUY', orderStyle: 'LIMIT', quantity: 5, price: 1 }, // won't cross anything
      { 'X-Idempotency-Key': randomUUID() },
    );
    assert(restingRes.status === 201, `Resting (non-crossing) LIMIT order placed (got HTTP ${restingRes.status})`);
    const restingOrderId = restingRes.body.id;

    await sleep(1000); // let the engine pick it up into the book via orders:new

    const redisCheck = new Redis(REDIS_URL);
    const inBookBefore = await redisCheck.zscore(`orderbook:buy:${SYMBOL}`, restingOrderId);
    assert(inBookBefore !== null, 'Resting order is present in the engine order book before cancellation');

    const cancelRes = await apiPatch<{ status: string }>(`/orders/${restingOrderId}/cancel`, buyerToken);
    assert(cancelRes.status === 200, `Cancel request succeeded (got HTTP ${cancelRes.status})`);
    assert(cancelRes.body.status === 'CANCELLED', `Order status is CANCELLED in the response (got ${cancelRes.body.status})`);

    await sleep(800); // let the engine process orders:cancel
    const inBookAfter = await redisCheck.zscore(`orderbook:buy:${SYMBOL}`, restingOrderId);
    assert(inBookAfter === null, 'Order removed from the engine order book after cancellation');
    await redisCheck.quit();

    const dbOrderAfterCancel = await prisma.order.findUnique({ where: { id: restingOrderId } });
    assert(dbOrderAfterCancel?.status === OrderStatus.CANCELLED, 'Order status is CANCELLED in the database');

    const buyerWalletAfterCancel = await prisma.wallet.findUnique({ where: { userId: buyer.id } });
    assert(
      buyerWalletAfterCancel?.reservedBalance === 0,
      `Buyer's reservedBalance released back to 0 after cancelling the resting order (got ${buyerWalletAfterCancel?.reservedBalance})`,
    );

    // ── Results ───────────────────────────────────────────────────────
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log('─'.repeat(50));
  } finally {
    console.log('\nCleaning up...');

    if (engine) {
      await stopChild(engine, 'Engine');
    }

    await purgeTestData();
    await prisma.$disconnect();

    console.log('  Test data purged, Prisma disconnected');
  }

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch(async (err) => {
  console.error('\nTest script crashed:', err);
  await purgeTestData().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exitCode = 1;
});
