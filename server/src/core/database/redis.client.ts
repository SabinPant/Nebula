/**
 * Redis Client
 *
 * Centralized Redis connection for the entire server.
 * Uses ioredis — the de-facto standard Redis client for Node.js.
 * BullMQ, ThrottlerModule, and custom distributed locks all use this single connection.
 *
 * Configuration comes from ConfigService (REDIS_URL env var).
 * In development: redis://localhost:6379
 * In production: rediss://user:pass@host.upstash.io:6379 (TLS)
 *
 * Graceful shutdown disconnects cleanly on SIGTERM.
 */

import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisClient implements OnModuleDestroy {
  private readonly client: Redis;
  private readonly logger = new Logger(RedisClient.name);

  constructor(private readonly configService: ConfigService) {
    const url = configService.get<string>('REDIS_URL') || 'redis://localhost:6379';

    this.client = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 5) {
          this.logger.error('Redis connection failed after 5 retries');
          return null; // Stop retrying
        }
        return Math.min(times * 200, 2000); // Exponential backoff: 200, 400, 600, 800, 1000ms
      },
      lazyConnect: false, // Connect immediately — fail fast if Redis is unreachable
    });

    this.client.on('connect', () => {
      this.logger.log('Redis connected');
    });

    this.client.on('error', (error) => {
      this.logger.error(`Redis error: ${error.message}`);
    });
  }

  /**
   * Returns the underlying ioredis client for direct use.
   * Use this for custom Redis operations (locks, pub/sub, sorted sets).
   */
  getClient(): Redis {
    return this.client;
  }

  /**
   * Graceful shutdown — disconnect from Redis on SIGTERM.
   */
  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
    this.logger.log('Redis disconnected');
  }
}