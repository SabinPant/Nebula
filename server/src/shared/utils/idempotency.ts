/**
 * Idempotency Utility
 *
 * Payload-hash idempotency for order placement and other mutation endpoints.
 * Clients send a unique X-Idempotency-Key header (UUID v4) with every POST /orders.
 * Server stores idempotency:{key} → { payloadHash, order } in Redis (TTL 24h).
 *
 * On repeated key:
 *   - Same payload hash → safe replay, returns the cached full order (zero DB hits)
 *   - Different payload hash → 409 IDEMPOTENCY_CONFLICT
 *
 * This prevents duplicate orders from network retries while detecting
 * accidental key reuse with different request bodies.
 *
 * IMPORTANT: hashPayload uses plain JSON.stringify without recursive key sorting.
 * This is safe for flat DTOs (e.g. CreateOrderDto — no nested objects or arrays)
 * because V8 serializes properties in insertion order, which is deterministic
 * for objects created the same way. Do NOT use this on nested payloads without
 * adding recursive key sorting.
 */

import { ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type Redis from 'ioredis';

const IDEMPOTENCY_TTL_SECONDS = 86400; // 24 hours

interface IdempotencyRecord {
  order: unknown;
  payloadHash: string;
}

/**
 * Checks whether an idempotency key has been used before.
 *
 * @returns The cached full order if this is a safe replay, or null if the key is new.
 * @throws ConflictException (IDEMPOTENCY_CONFLICT) if the key was reused with a different payload.
 */
export async function checkIdempotency(
  redis: Redis,
  key: string,
  payload: unknown,
): Promise<unknown | null> {
  const redisKey = `idempotency:${key}`;
  const existing = await redis.get(redisKey);

  if (!existing) {
    return null; // Key is new — caller proceeds with operation
  }

  const record: IdempotencyRecord = JSON.parse(existing);
  const currentHash = hashPayload(payload);

  if (record.payloadHash === currentHash) {
    return record.order; // Safe replay — same payload, return full cached order
  }

  throw new ConflictException({
    code: 'IDEMPOTENCY_CONFLICT',
    message: 'This idempotency key was already used with a different request.',
  });
}

/**
 * Stores an idempotency key with the full order after a successful operation.
 * Called AFTER the operation completes so partial failures don't consume the key.
 */
export async function storeIdempotencyResult(
  redis: Redis,
  key: string,
  order: unknown,
  payload: unknown,
): Promise<void> {
  const redisKey = `idempotency:${key}`;
  const record: IdempotencyRecord = {
    order,
    payloadHash: hashPayload(payload),
  };
  await redis.set(redisKey, JSON.stringify(record), 'EX', IDEMPOTENCY_TTL_SECONDS);
}

/**
 * Creates a deterministic SHA-256 hash of a flat payload.
 *
 * WARNING: Uses plain JSON.stringify — safe for flat objects only.
 * Do NOT use with nested objects or arrays without recursive key sorting.
 */
function hashPayload(payload: unknown): string {
  const normalized = JSON.stringify(payload);
  return createHash('sha256').update(normalized).digest('hex');
}