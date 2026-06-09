/**
 * JWT Authentication Strategy
 *
 * Passport strategy that validates JWT access tokens on every authenticated request.
 * Extracts the token from the Authorization header (Bearer scheme), verifies the
 * signature and expiry using the access token secret from ConfigService, then loads
 * the full user record to check suspension and verification status.
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
import type { AccessTokenPayload } from '../../../shared/utils/tokens';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly authRepository: AuthRepository,
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
   * Checks performed:
   * - User exists in database (not deleted)
   * - User is not suspended
   *
   * Email verification and onboarding status are NOT checked here —
   * those are enforced by OnboardingGuard on specific routes.
   */
  async validate(payload: AccessTokenPayload) {
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