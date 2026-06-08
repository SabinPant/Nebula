/**
 * Redis Throttler Storage
 *
 * Custom storage adapter for @nestjs/throttler that uses Redis
 * instead of in-memory storage. This ensures rate limits work
 * across multiple server instances in production.
 */

import { Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { RedisClient } from '../database/redis.client';

@Injectable()
export class ThrottlerRedisStorage implements ThrottlerStorage {
  private readonly redis;

  constructor(private readonly redisClient: RedisClient) {
    this.redis = this.redisClient.getClient();
  }

  async get(key: string): Promise<number[]> {
    const value = await this.redis.get(key);
    return value ? JSON.parse(value) : [];
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
  ): Promise<{ totalHits: number; timeToExpire: number; isBlocked: boolean; timeToBlockExpire: number }> {
    const now = Date.now();
    const windowStart = now - ttl;

    let hits: number[] = await this.redis.get(key).then(v => v ? JSON.parse(v) : []);

    // Remove expired timestamps
    hits = hits.filter((timestamp: number) => timestamp > windowStart);
    hits.push(now);

    // Store back to Redis
    await this.redis.set(key, JSON.stringify(hits), 'PX', ttl);

    const totalHits = hits.length;
    const isBlocked = totalHits > limit;

    return {
      totalHits,
      timeToExpire: Math.max(...hits) + ttl - now,
      isBlocked,
      timeToBlockExpire: isBlocked ? blockDuration : 0,
    };
  }
}