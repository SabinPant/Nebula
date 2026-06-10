/**
 * JWT Authentication Strategy
 *
 * Passport strategy that validates JWT access tokens on every authenticated request.
 * Extracts the token from the Authorization header (Bearer scheme), verifies the
 * signature and expiry using the access token secret from ConfigService, checks the
 * token blacklist (Redis) before any database call, then loads the full user record
 * to check suspension and verification status.
 *
 * Blacklist check order: Redis O(1) lookup before PostgreSQL query.
 * A blacklisted token (from logout) is rejected without touching the database.
 *
 * The validated user is attached to request.user and available to all downstream
 * guards (RolesGuard, OnboardingGuard) and controllers.
 *
 * Secrets come from ConfigService — never hardcoded.
 * Strategy name 'jwt' is referenced by JwtAuthGuard.
 */

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthRepository } from '../auth.repository';
import { TokenStorage } from '../../../shared/utils/token-storage';
import type { AccessTokenPayload } from '../../../shared/utils/tokens';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly authRepository: AuthRepository,
    private readonly tokenStorage: TokenStorage,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_ACCESS_SECRET'),
    });
  }

  /**
   * Validates the JWT payload and returns the user object attached to the request.
   * Called automatically by Passport after token signature and expiry are verified.
   *
   * Check order:
   * 1. Token blacklist (Redis) — O(1), prevents revoked tokens from proceeding
   * 2. User existence + not soft-deleted (PostgreSQL)
   * 3. Account suspension status
   *
   * Email verification and onboarding status are NOT checked here —
   * those are enforced by OnboardingGuard on specific routes.
   */
  async validate(payload: AccessTokenPayload) {
    // Check blacklist FIRST — Redis is faster than PostgreSQL.
    // Guard clause: if the token somehow lacks a jti (legacy token from
    // before Step 4), skip the blacklist check rather than crashing.
    if (payload.jti) {
      const blacklisted = await this.tokenStorage.isBlacklisted(payload.jti);
      if (blacklisted) {
        throw new UnauthorizedException({
          code: 'TOKEN_REVOKED',
          message: 'Invalid or expired token',
        });
      }
    }

    const user = await this.authRepository.findUserById(payload.sub);

    if (!user || user.deletedAt) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired token',
      });
    }

    if (user.isSuspended) {
      throw new UnauthorizedException({
        code: 'ACCOUNT_SUSPENDED',
        message: 'Your account has been suspended. Contact support.',
      });
    }

    // Returned value is attached to request.user
    return {
      id: user.id,
      email: user.email,
      userType: user.userType,
      isEmailVerified: user.isEmailVerified,
      isOnboardingComplete: user.isOnboardingComplete,
      isSuspended: user.isSuspended,
    };
  }
}