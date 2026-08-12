/**
 * Manual verification for Sprint 10 Step 2: engine health gate on POST /orders.
 *
 * Not a Jest suite — spawns the REAL server and REAL engine processes and
 * drives the real HTTP API with a real signed JWT, exactly like a genuine
 * client would. Exercises exactly the three-phase scenario from the ticket:
 *
 *   1. Server + engine both up   -> POST /orders succeeds
 *   2. Engine killed             -> POST /orders returns 503 ENGINE_UNAVAILABLE
 *   3. Engine restarted          -> POST /orders succeeds again within ~5s
 *      (EngineHealthService's poll interval)
 *
 * Run with: npx tsx scripts/test-engine-health-gate.ts (from server/)
 * Requires Postgres + Redis reachable per .env.development. Spawns the
 * server on port 3001 and the engine on port 3003 — the exact ports
 * ENGINE_HTTP_URL/APP_PORT point at in .env.development, since this test
 * needs the real running server's own health-poll to observe the engine
 * going up/down, not an isolated copy on a different port.
 */

import { PrismaClient, UserType } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: path.resolve(__dirname, '..', '.env.development') });

const prisma = new PrismaClient();

const SERVER_URL = 'http://localhost:3001/api/v1';
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const TEST_EMAIL_DOMAIN = 'health-gate-test.nebula';
const ENGINE_HEALTH_CHECK_INTERVAL_MS = parseInt(
  process.env.ENGINE_HEALTH_CHECK_INTERVAL_MS || '5000',
  10,
);

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

interface ApiResult<T> {
  status: number;
  body: T;
}

async function apiPost<T>(urlPath: string, token: string, body: unknown): Promise<ApiResult<T>> {
  const res = await fetch(`${SERVER_URL}${urlPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Idempotency-Key': randomUUID(),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json as T };
}

// ─── Test user setup ─────────────────────────────────────────────────────

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
      displayName: 'Health Gate Test Trader',
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

async function purgeTestData(): Promise<void> {
  const testUsers = await prisma.user.findMany({
    where: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } },
    select: { id: true },
  });
  const userIds = testUsers.map((u) => u.id);
  if (userIds.length === 0) return;

  // A MARKET order fill creates a Portfolio + Holding for the buyer
  // (TradingService.placeOrder -> ensurePortfolio/createOrUpdateHolding),
  // which Phase 1/3 of this test both trigger — those must be deleted
  // before the User row or Postgres rejects it on the Portfolio FK.
  await prisma.transaction.deleteMany({ where: { wallet: { userId: { in: userIds } } } });
  await prisma.order.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.holding.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.portfolio.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.wallet.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });

  console.log(`  Purged ${userIds.length} leftover test user(s)`);
}

// ─── Process management ─────────────────────────────────────────────────
// Same node.exe + tsx cli.mjs spawn pattern as test-engine-integration.ts —
// avoids the three Windows spawn pitfalls already solved in Sprint 9
// (npx needs a shell / shell:true orphans the real process / tsx.cmd alone
// is EINVAL). See that script's comments for the full explanation.

function resolveTsxCliEntry(): string {
  const tsxPackageJson = require.resolve('tsx/package.json');
  return path.join(path.dirname(tsxPackageJson), 'dist', 'cli.mjs');
}

function killProcessTree(pid: number): void {
  if (process.platform === 'win32') {
    try {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
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
    killProcessTree(child.pid);
  }
}

function waitForLog(child: ChildProcess, match: string, timeoutMs: number, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for "${match}" in ${label} output`));
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

function spawnEngine(): ChildProcess {
  const engineEntry = path.resolve(__dirname, '..', '..', 'engine', 'src', 'index.ts');
  const tsxCliEntry = resolveTsxCliEntry();

  return spawn(process.execPath, [tsxCliEntry, engineEntry], {
    cwd: path.resolve(__dirname, '..', '..', 'engine'),
    env: {
      ...process.env,
      ENGINE_HTTP_PORT: '3003', // the real port ENGINE_HTTP_URL points at
      PRICE_UPDATE_INTERVAL_MS: '1000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function spawnServer(): ChildProcess {
  // Run the already-built dist/main.js directly (avoids re-invoking `npm
  // run start:dev`'s webpack watch wrapper, and gives a clean, killable PID
  // exactly like the engine spawn above).
  const mainEntry = path.resolve(__dirname, '..', 'dist', 'main.js');

  return spawn(process.execPath, [mainEntry], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Purging any leftover test data from a previous run...');
  await purgeTestData();

  const stock = await prisma.stock.findFirst({ where: { symbol: 'NABIL' } });
  if (!stock) {
    throw new Error('Stock NABIL not found — run "npx prisma db seed" in server/ before this test');
  }

  const trader = await createTestTrader(5_000_000);
  const token = signTestAccessToken(trader.id, trader.email);
  console.log(`Test trader: ${trader.email} (${trader.id})`);

  let engine: ChildProcess | undefined;
  let server: ChildProcess | undefined;

  try {
    // ── Phase 0: start engine, then server ──────────────────────────────
    console.log('\nPhase 0: Starting the real engine and server');
    engine = spawnEngine();
    await waitForLog(engine, 'Subscribed to orders:new, orders:cancel', 15_000, 'engine');
    console.log('  Engine is up');

    server = spawnServer();
    await waitForLog(server, 'Nest application successfully started', 20_000, 'server');
    console.log('  Server is up');

    // Give EngineHealthService's first (immediate, onModuleInit) poll a
    // moment to land — it fires right away, not on the interval, so this
    // is generous rather than strictly required.
    await sleep(1000);

    // ── Phase 1: engine + server both up -> orders should work ─────────
    console.log('\nPhase 1: Engine and server both up — placing a MARKET order');
    const res1 = await apiPost<{ id: string; status: string; code?: string }>('/orders', token, {
      stockId: stock.id,
      type: 'BUY',
      orderStyle: 'MARKET',
      quantity: 1,
    });
    assert(res1.status === 201, `Order placed successfully while engine is up (got HTTP ${res1.status}, body: ${JSON.stringify(res1.body)})`);
    assert(res1.body.status === 'COMPLETED', `Order filled (MARKET, mock-style) — status COMPLETED (got ${res1.body.status})`);

    // ── Phase 2: kill the engine -> orders should 503 ───────────────────
    console.log('\nPhase 2: Stopping the engine');
    await stopChild(engine, 'Engine');
    engine = undefined;
    console.log('  Engine stopped');

    console.log(
      `  Waiting for the server's health poll to notice (up to ${ENGINE_HEALTH_CHECK_INTERVAL_MS + 3000}ms — ` +
      `poll interval + 3s fetch timeout)...`,
    );
    // EngineHealthService's poll must first attempt a fetch to the now-dead
    // engine and let it fail (connection refused is immediate, but give
    // the full interval + timeout margin to be safe against scheduling
    // jitter) before the cached state flips to down.
    await sleep(ENGINE_HEALTH_CHECK_INTERVAL_MS + 3000);

    const res2 = await apiPost<{ code?: string; message?: string }>('/orders', token, {
      stockId: stock.id,
      type: 'BUY',
      orderStyle: 'MARKET',
      quantity: 1,
    });
    assert(res2.status === 503, `Order rejected with HTTP 503 while engine is down (got HTTP ${res2.status})`);
    assert(
      res2.body.code === 'ENGINE_UNAVAILABLE',
      `Rejection has code ENGINE_UNAVAILABLE (got ${res2.body.code})`,
    );

    // Confirm no funds were reserved for the rejected order.
    const walletAfterReject = await prisma.wallet.findUnique({ where: { userId: trader.id } });
    assert(
      walletAfterReject?.reservedBalance === 0,
      `No funds reserved for the rejected order — reservedBalance still 0 (got ${walletAfterReject?.reservedBalance})`,
    );
    const orderCountAfterReject = await prisma.order.count({ where: { userId: trader.id } });
    assert(
      orderCountAfterReject === 1,
      `No Order row was created for the rejected attempt — still only the 1 order from Phase 1 (got ${orderCountAfterReject})`,
    );

    // ── Phase 3: restart the engine -> orders should recover ───────────
    console.log('\nPhase 3: Restarting the engine');
    engine = spawnEngine();
    await waitForLog(engine, 'Subscribed to orders:new, orders:cancel', 15_000, 'engine');
    console.log('  Engine is back up');

    console.log(`  Waiting up to ${ENGINE_HEALTH_CHECK_INTERVAL_MS + 3000}ms for the server to notice recovery...`);
    await sleep(ENGINE_HEALTH_CHECK_INTERVAL_MS + 3000);

    const res3 = await apiPost<{ id: string; status: string; code?: string }>('/orders', token, {
      stockId: stock.id,
      type: 'BUY',
      orderStyle: 'MARKET',
      quantity: 1,
    });
    assert(res3.status === 201, `Order placed successfully again after engine recovery (got HTTP ${res3.status}, body: ${JSON.stringify(res3.body)})`);
    assert(res3.body.status === 'COMPLETED', `Recovered order filled — status COMPLETED (got ${res3.body.status})`);

    // ── Results ───────────────────────────────────────────────────────
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log('─'.repeat(50));
  } finally {
    console.log('\nCleaning up...');
    if (server) await stopChild(server, 'Server');
    if (engine) await stopChild(engine, 'Engine');
    await purgeTestData();
    await prisma.$disconnect();
    console.log('  Processes stopped, test data purged, Prisma disconnected');
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
