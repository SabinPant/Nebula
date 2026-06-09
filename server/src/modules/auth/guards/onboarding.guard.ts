/**
 * Onboarding Guard
 *
 * Enforces that TRADER users have completed both email verification
 * and broker selection before accessing protected routes.
 *
 * Per CLAUDE.md route guard rule: every protected route checks BOTH
 * isEmailVerified AND isOnboardingComplete. If either is false,
 * the request is rejected with a distinct error code so the frontend
 * can redirect to the correct page.
 *
 * Brokers and Admins bypass this guard — onboarding only applies to traders.
 * Requires JwtAuthGuard to run first for the user to be on the request.
 */

import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { UserType } from '@prisma/client';

@Injectable()
export class OnboardingGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();

    // Defensive: no user on request (JwtAuthGuard should have run first)
    if (!user) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Authentication is required',
      });
    }

    // Only enforce onboarding checks for TRADER users
    if (user.userType !== UserType.TRADER) {
      return true;
    }

    // Check email verification first — distinct error code for frontend redirect
    if (!user.isEmailVerified) {
      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Please verify your email before accessing this resource',
      });
    }

    // Check onboarding completion — distinct error code for frontend redirect
    if (!user.isOnboardingComplete) {
      throw new ForbiddenException({
        code: 'ONBOARDING_INCOMPLETE',
        message: 'Please complete your account setup before accessing this resource',
      });
    }

    return true;
  }
}