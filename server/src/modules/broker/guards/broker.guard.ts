/**
 * Broker Guard
 *
 * Restricts broker dashboard routes to authenticated, active brokers only.
 *
 * Intended usage with JwtAuthGuard:
 * @UseGuards(JwtAuthGuard, BrokerGuard)
 *
 * JwtAuthGuard should run first and attach request.user.
 * This guard then enforces:
 * 1) userType === BROKER
 * 2) isSuspended === false
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
export class BrokerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();

    // Defensive: JwtAuthGuard should have populated request.user
    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCodes.UNAUTHORIZED,
        message: 'Authentication is required',
      });
    }

    if (user.userType !== UserType.BROKER) {
      throw new ForbiddenException({
        code: ErrorCodes.FORBIDDEN,
        message: 'You do not have permission to access this resource',
      });
    }

    if (user.isSuspended) {
      throw new ForbiddenException({
        code: ErrorCodes.BROKER_SUSPENDED,
        message: 'Your broker account is suspended',
      });
    }

    return true;
  }
}
