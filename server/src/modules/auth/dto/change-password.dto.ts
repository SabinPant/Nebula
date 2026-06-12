/**
 * Change Password DTO
 *
 * Validates the old and new password for the change-password endpoint.
 * The new password follows the same strength rules as registration:
 * min 8 chars, at least one uppercase, one lowercase, one number,
 * and one special character (@#$%!&*?).
 */

import { IsString, MinLength, Matches } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MinLength(1, { message: 'Current password is required' })
  oldPassword!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@#$%!&*?])[A-Za-z\d@#$%!&*?]{8,}$/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@#$%!&*?)',
  })
  newPassword!: string;
}