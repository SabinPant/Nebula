/**
 * Nebula Mock Engine — Entry Point
 *
 * Standalone Node.js process that simulates stock prices using
 * Geometric Brownian Motion and publishes them to Redis.
 *
 * The engine knows NOTHING about users, wallets, auth, Prisma, or NestJS.
 * It only publishes to Redis channels — the NestJS gateway consumes
 * those messages and handles database updates and WebSocket broadcasting.
 *
 * Market hours: always open (24/7 educational platform).
 * Tick interval: PRICE_UPDATE_INTERVAL_MS from env (default 3000ms).
 */

import Redis from 'ioredis';
import { STOCKS } from './stocks.config';
import { simulateTick } from './price-simulator';
import { isMarketOpen } from './market-hours';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const TICK_INTERVAL = parseInt(
  process.env.PRICE_UPDATE_INTERVAL_MS || '3000',
  10,
);

const redis = new Redis(REDIS_URL);

redis.on('connect', () => {
  console.log('[Engine] Connected to Redis');
});

redis.on('error', (err) => {
  console.error('[Engine] Redis error:', err.message);
});

/**
 * Main simulation loop.
 * Runs at the configured tick interval.
 * Publishes price updates to Redis channel: market:prices
 */
async function tick(): Promise<void> {
  // Only publish during market hours (24/7 for Nebula — always true)
  if (!isMarketOpen()) {
    return;
  }

  for (const stock of STOCKS) {
    // Skip halted stocks — price is frozen
    if (stock.isHalted) {
      continue;
    }

    const result = simulateTick(stock);

    const message = JSON.stringify(result);

    // Publish to Redis channel
    await redis.publish('market:prices', message);

    // Log every 10 ticks per stock to avoid spam
    if (Math.random() < 0.1) {
      console.log(
        `[Engine] ${result.symbol}: Rs. ${(result.price / 100).toFixed(2)} ` +
        `(${result.changePercent >= 0 ? '+' : ''}${result.changePercent}%)` +
        `${result.isHalted ? ' [HALTED]' : ''}`,
      );
    }
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Engine] Shutting down...');
  await redis.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Engine] Shutting down...');
  await redis.quit();
  process.exit(0);
});

// Start the engine
console.log(`[Engine] Starting simulation — tick interval: ${TICK_INTERVAL}ms`);
console.log(`[Engine] Simulating ${STOCKS.length} stocks`);

setInterval(tick, TICK_INTERVAL);

// Run first tick immediately
tick();