/**
 * Reset Password DTO
 *
 * Validates the new password and the single-use reset token.
 * Same password strength rules as registration.
 * Token is validated against Redis hash — single-use, deleted after consumption.
 */

import { IsString, MinLength, Matches, IsUUID } from 'class-validator';

export class ResetPasswordDto {
  @IsUUID('4', { message: 'Invalid reset token' })
  token!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@#$%!&*?])[A-Za-z\d@#$%!&*?]{8,}$/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@#$%!&*?)',
  })
  password!: string;
}