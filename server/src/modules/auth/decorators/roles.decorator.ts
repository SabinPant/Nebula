/**
 * Roles Decorator
 *
 * Marks routes with required user types for access control.
 * Used in conjunction with RolesGuard — the guard reads this metadata
 * and compares it against the authenticated user's userType.
 *
 * Usage: @Roles(UserType.TRADER, UserType.BROKER)
 *
 * If no @Roles() decorator is present on a route, RolesGuard denies access
 * (fail-closed). Every protected route must explicitly declare its role requirements.
 */

import { SetMetadata } from '@nestjs/common';
import { UserType } from '@prisma/client';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: UserType[]) => SetMetadata(ROLES_KEY, roles);