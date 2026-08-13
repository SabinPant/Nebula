/**
 * Admin Guard
 *
 * Restricts admin panel routes to the authenticated admin user only.
 *
 * Intended usage with JwtAuthGuard:
 * @UseGuards(JwtAuthGuard, AdminGuard)
 *
 * JwtAuthGuard should run first and attach request.user.
 * This guard then enforces:
 * 1) userType === ADMIN
 *
 * Does NOT check isSuspended, unlike BrokerGuard — admin is a singular,
 * hardcoded account (see CLAUDE.md) with no suspend/unsuspend flow of its
 * own. Checking isSuspended here would only add a self-lockout risk with
 * no corresponding capability, since nothing in the system ever sets it
 * for an ADMIN user.
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserType } from '@prisma/client';
import { ErrorCodes } from '../../../shared/constants/errors';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();

    // Defensive: JwtAuthGuard should have populated request.user
    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCodes.UNAUTHORIZED,
        message: 'Authentication is required',
      });
    }

    if (user.userType !== UserType.ADMIN) {
      throw new ForbiddenException({
        code: ErrorCodes.FORBIDDEN,
        message: 'You do not have permission to access this resource',
      });
    }

    return true;
  }
}
