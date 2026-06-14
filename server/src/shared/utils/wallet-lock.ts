/**
 * Wallet Distributed Lock Utility
 *
 * Redis-based distributed lock for wallet mutations.
 * Ensures only one operation can modify a user's wallet at a time,
 * preventing race conditions where two simultaneous orders both pass
 * the balance check and overdraw the account.
 *
 * Pattern: Callback wrapper — makes it impossible to forget releasing the lock.
 * Safe release: Only deletes the lock if the stored value matches the
 * value set by this process — prevents cross-process lock theft if the
 * TTL expires during a slow operation.
 *
 * Rate limiting (10 orders/min per user) makes this sufficient without
 * database-level locking.
 */

import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';

const LOCK_TTL_SECONDS = 10;

/**
 * Acquires a Redis lock for a wallet, executes the callback, and releases the lock.
 *
 * @param redis - ioredis client from RedisClient
 * @param userId - The user ID whose wallet is being mutated
 * @param fn - The mutation logic to execute under the lock
 * @returns The result of the callback
 * @throws ConflictException with code WALLET_LOCK_FAILED if lock cannot be acquired
 */
export async function withWalletLock<T>(
  redis: Redis,
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const key = `wallet:lock:${userId}`;
  const lockValue = randomUUID();

  // Acquire lock — SET NX EX is atomic, never SETNX + EXPIRE separately
  const acquired = await redis.set(key, lockValue, 'EX', LOCK_TTL_SECONDS, 'NX');

  if (!acquired) {
    throw new ConflictException({
      code: 'WALLET_LOCK_FAILED',
      message: 'Another operation is in progress. Please try again.',
    });
  }

  try {
    return await fn();
  } finally {
    // Safe release: only delete if we still own the lock
    const current = await redis.get(key);
    if (current === lockValue) {
      await redis.del(key);
    }
  }
}