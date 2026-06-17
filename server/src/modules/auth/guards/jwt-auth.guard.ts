/**
 * JWT Authentication Guard
 *
 * Protects routes by requiring a valid JWT access token in the
 * Authorization header (Bearer scheme).
 *
 * Extends Passport's built-in AuthGuard('jwt') with custom error handling.
 * The default Passport behavior throws a generic 401 with no code field —
 * this guard overrides handleRequest() to return standardized errors with
 * machine-readable codes (UNAUTHORIZED, ACCOUNT_SUSPENDED) so the frontend
 * can switch on error.response.data.code consistently.
 *
 * Usage: @UseGuards(JwtAuthGuard) on any controller or route.
 */

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  /**
   * Overrides the default Passport error handling.
   *
   * If the strategy already threw a typed exception (e.g. ACCOUNT_SUSPENDED),
   * that exception is re-thrown as-is. Otherwise, a generic UNAUTHORIZED
   * error is thrown with a machine-readable code.
   */
  handleRequest<TUser = any>(
    err: any,
    user: TUser | false,
    
  ): TUser {
    // If the strategy already threw a typed exception, preserve it
    if (err instanceof UnauthorizedException) {
      throw err;
    }

    // Any other error or missing user → generic unauthorized
    if (err || !user) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired token',
      });
    }

    return user;
  }

}