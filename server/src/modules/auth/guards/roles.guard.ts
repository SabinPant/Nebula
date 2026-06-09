/**
 * Roles Guard
 *
 * Restricts route access based on the authenticated user's userType.
 * Reads allowed roles from the @Roles() decorator metadata via Reflector.
 *
 * Fail-closed: if no @Roles() decorator is present, access is denied.
 * Every protected route must explicitly declare its role requirements.
 *
 * Requires JwtAuthGuard to run first — the user must be authenticated
 * before roles can be checked. Always use both guards together:
 * @UseGuards(JwtAuthGuard, RolesGuard)
 */

import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserType } from '@prisma/client';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserType[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Fail-closed: no roles specified → deny
    if (!requiredRoles || requiredRoles.length === 0) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to access this resource',
      });
    }

    const { user } = context.switchToHttp().getRequest();

    // Defensive: no user on request (JwtAuthGuard should have run first)
    if (!user) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Authentication is required',
      });
    }

    // Check if user's type is in the allowed roles
    if (!requiredRoles.includes(user.userType)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to access this resource',
      });
    }

    return true;
  }
}