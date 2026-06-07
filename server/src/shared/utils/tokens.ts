/**
 * Token Utility Functions
 *
 * Centralized JWT access and refresh token generation and verification.
 * All JWT operations in the entire server go through these functions.
 *
 * Access tokens: 15 min expiry, stored in memory only (never localStorage).
 * Refresh tokens: 7 day expiry, HTTP-only Secure SameSite=Strict cookie, per-device.
 *
 * Config values (secrets, expiry) come from ConfigService — never hardcoded.
 */

import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

/**
 * Payload embedded in access tokens.
 * Kept minimal — only what's needed for authorization on every request.
 */
export interface AccessTokenPayload {
  sub: string; // user ID
  email: string;
  userType: string;
}

/**
 * Payload embedded in refresh tokens.
 * Includes deviceId for multi-device session management.
 */
export interface RefreshTokenPayload {
  sub: string; // user ID
  deviceId: string;
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
 */
export function generateAccessToken(
  jwtService: JwtService,
  configService: ConfigService,
  payload: AccessTokenPayload,
): string {
  return jwtService.sign(payload, {
    secret: configService.get<string>('JWT_ACCESS_SECRET'),
    expiresIn: configService.get<string>('JWT_ACCESS_EXPIRY'),
  });
}

/**
 * Generates a refresh token for the given user and device.
 */
export function generateRefreshToken(
  jwtService: JwtService,
  configService: ConfigService,
  payload: RefreshTokenPayload,
): string {
  return jwtService.sign(payload, {
    secret: configService.get<string>('JWT_REFRESH_SECRET'),
    expiresIn: configService.get<string>('JWT_REFRESH_EXPIRY'),
  });
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