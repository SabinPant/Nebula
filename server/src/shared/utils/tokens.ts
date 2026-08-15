/**
 * Token Utility Functions
 *
 * Centralized JWT access and refresh token generation and verification.
 * All JWT operations in the entire server go through these functions.
 *
 * Access tokens: 15 min expiry, stored in memory only (never localStorage).
 *   Includes a jti (JWT ID) for blacklist support on logout.
 * Refresh tokens: 7 day expiry, HTTP-only Secure SameSite=Strict cookie,
 *   per-device, tracked by hash in Redis (not by jti).
 *
 * The jti is generated inside generateAccessToken() using the spread pattern
 * ({ ...payload, jti: randomUUID() }) — no mutation, transparent to callers.
 * This guarantees every access token always has a jti without requiring
 * every service to import crypto utilities.
 *
 * Config values (secrets, expiry) come from ConfigService — never hardcoded.
 */

import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';

/**
 * Payload embedded in access tokens.
 * jti is optional in the input — the generate function injects it automatically.
 * After generation, jti is always present for blacklist checks.
 */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  userType: string;
  jti?: string;
}

/**
 * Payload embedded in refresh tokens.
 * jti is optional in the input — generateRefreshToken() injects it
 * automatically, same as AccessTokenPayload. Refresh tokens are tracked
 * by Redis hash key (not by jti — there's no blacklist lookup by jti for
 * refresh tokens), but the jti is still needed for token UNIQUENESS: JWT
 * `iat` has one-second granularity, and {sub, deviceId} alone is constant
 * across an entire rotation chain for the same device, so two rotations
 * within the same wall-clock second would otherwise produce byte-identical
 * tokens (same header, payload, iat, exp -> same HMAC signature). That
 * collision defeats the reuse-detection check in
 * AuthService.refreshToken() during that window — the "old" and "new"
 * tokens being textually identical means presenting the old one again
 * isn't distinguishable from presenting the current one. Caught by
 * scripts/test-auth-security.ts's refresh-rotation scenario.
 */
export interface RefreshTokenPayload {
  sub: string;
  deviceId: string;
  jti?: string;
}

/**
 * Result of generating an auth token pair.
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Generates an access token for the given user.
 * Injects a jti (JWT ID) automatically via spread — every access token
 * is uniquely identifiable for blacklist support on logout.
 */
export function generateAccessToken(
  jwtService: JwtService,
  configService: ConfigService,
  payload: AccessTokenPayload,
): string {
  return jwtService.sign(
    { ...payload, jti: randomUUID() },
    {
      secret: configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: configService.get<string>('JWT_ACCESS_EXPIRY'),
    },
  );
}

/**
 * Generates a refresh token for the given user and device.
 * Injects a jti automatically via spread, same pattern as
 * generateAccessToken() — see RefreshTokenPayload's docstring for why
 * this is needed despite refresh tokens not using a jti-keyed blacklist.
 */
export function generateRefreshToken(
  jwtService: JwtService,
  configService: ConfigService,
  payload: RefreshTokenPayload,
): string {
  return jwtService.sign(
    { ...payload, jti: randomUUID() },
    {
      secret: configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: configService.get<string>('JWT_REFRESH_EXPIRY'),
    },
  );
}

/**
 * Verifies an access token and returns its payload.
 * Throws if token is invalid or expired — caught by Passport strategy.
 */
export function verifyAccessToken(
  jwtService: JwtService,
  configService: ConfigService,
  token: string,
): AccessTokenPayload {
  return jwtService.verify<AccessTokenPayload>(token, {
    secret: configService.get<string>('JWT_ACCESS_SECRET'),
  });
}

/**
 * Verifies a refresh token and returns its payload.
 * Throws if token is invalid or expired.
 */
export function verifyRefreshToken(
  jwtService: JwtService,
  configService: ConfigService,
  token: string,
): RefreshTokenPayload {
  return jwtService.verify<RefreshTokenPayload>(token, {
    secret: configService.get<string>('JWT_REFRESH_SECRET'),
  });
}