/**
 * Token Storage Utilities
 *
 * Centralized Redis-based token management for the entire server.
 * Every token (email verify, password reset, refresh, blacklist) follows
 * the same pattern: generated UUID, stored as hashed value in Redis,
 * single-use, with TTL.
 *
 * Tokens are never logged, never returned in error messages, and never
 * stored in the database — Redis is the sole source of truth for ephemeral tokens.
 */

import { Injectable } from '@nestjs/common';
import { RedisClient } from '../../core/database/redis.client';
import { randomBytes, createHash } from 'node:crypto';

@Injectable()
export class TokenStorage {
  private readonly redis;

  constructor(private readonly redisClient: RedisClient) {
    this.redis = this.redisClient.getClient();
  }

  /**
   * Generates a cryptographically random token (UUID v4 format).
   * Not exposed to logs or error messages.
   */
  private generateToken(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * Hashes a token using SHA-256 for storage.
   * Redis stores the hash, never the plain token.
   */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  // ─── Email Verification Tokens ──────────────────────────────────────────

  /**
   * Creates an email verification token for a user.
   * Returns the plain token (sent in email). Redis stores the hash.
   * TTL: 24 hours.
   */
  async createEmailVerificationToken(userId: string): Promise<string> {
    const token = this.generateToken();
    const hashed = this.hashToken(token);
    const key = `email:verify:${hashed}`;
    await this.redis.set(key, userId, 'EX', 86400); // 24h
    return token;
  }

  /**
   * Validates an email verification token and returns the userId.
   * Token is single-use — deleted immediately after validation.
   * Returns null if invalid or expired.
   */
  async validateEmailVerificationToken(token: string): Promise<string | null> {
    const hashed = this.hashToken(token);
    const key = `email:verify:${hashed}`;
    const userId = await this.redis.get(key);
    if (userId) {
      await this.redis.del(key); // Single-use: delete after reading
      return userId;
    }
    return null;
  }

  // ─── Password Reset Tokens ──────────────────────────────────────────────

  /**
   * Creates a password reset token for a user.
   * Returns the plain token (sent in email). Redis stores the hash.
   * TTL: 1 hour.
   */
  async createPasswordResetToken(userId: string): Promise<string> {
    const token = this.generateToken();
    const hashed = this.hashToken(token);
    const key = `password:reset:${hashed}`;
    await this.redis.set(key, userId, 'EX', 3600); // 1h
    return token;
  }

  /**
   * Validates a password reset token and returns the userId.
   * Single-use — deleted immediately after validation.
   * Returns null if invalid or expired.
   */
  async validatePasswordResetToken(token: string): Promise<string | null> {
    const hashed = this.hashToken(token);
    const key = `password:reset:${hashed}`;
    const userId = await this.redis.get(key);
    if (userId) {
      await this.redis.del(key); // Single-use: delete after reading
      return userId;
    }
    return null;
  }

  // ─── Refresh Tokens ─────────────────────────────────────────────────────

  /**
   * Stores a refresh token hash for a user's device.
   * TTL: 7 days — matches JWT_REFRESH_EXPIRY.
   */
  async storeRefreshToken(userId: string, deviceId: string, refreshToken: string): Promise<void> {
    const hashed = this.hashToken(refreshToken);
    const key = `refreshtoken:${userId}:${deviceId}`;
    await this.redis.set(key, hashed, 'EX', 604800); // 7 days
  }

  /**
   * Validates that a refresh token matches the stored hash for a user's device.
   * Returns true if valid, false if missing or mismatched.
   */
  async validateRefreshToken(userId: string, deviceId: string, refreshToken: string): Promise<boolean> {
    const key = `refreshtoken:${userId}:${deviceId}`;
    const stored = await this.redis.get(key);
    if (!stored) return false;
    const hashed = this.hashToken(refreshToken);
    return stored === hashed;
  }

  /**
   * Invalidates a device's refresh token (on logout or refresh rotation).
   */
  async invalidateRefreshToken(userId: string, deviceId: string): Promise<void> {
    const key = `refreshtoken:${userId}:${deviceId}`;
    await this.redis.del(key);
  }

  // ─── JWT Blacklist ──────────────────────────────────────────────────────

  /**
   * Blacklists a JWT access token by its jti (JWT ID).
   * TTL: 15 minutes — matches JWT_ACCESS_EXPIRY. After that, the token
   * would expire naturally, so the blacklist entry is cleaned up.
   */
  async blacklistAccessToken(jti: string): Promise<void> {
    const key = `token:blacklist:${jti}`;
    await this.redis.set(key, '1', 'EX', 900); // 15 min
  }

  /**
   * Checks if a JWT access token is blacklisted.
   */
  async isBlacklisted(jti: string): Promise<boolean> {
    const key = `token:blacklist:${jti}`;
    const result = await this.redis.exists(key);
    return result === 1;
  }

  // ─── Rate Limit Helper ──────────────────────────────────────────────────

  /**
   * Checks if an email has exceeded the rate limit for a given action.
   * Used for forgot-password and resend-verification (3 per hour).
   * Returns the current count. Caller decides if it exceeds the limit.
   */
  async incrementEmailRateLimit(email: string): Promise<number> {
    const key = `ratelimit:email:${email}`;
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, 3600); // 1 hour window on first attempt
    }
    return count;
  }
}