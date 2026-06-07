/**
 * Register DTO
 *
 * Validates trader registration payload before it reaches the service layer.
 * Enforces password strength rules (min 8 chars, upper, lower, number, special)
 * and email format. Unknown fields are stripped by the global ValidationPipe.
 *
 * Password regex is intentionally not exposed in error messages —
 * users receive a plain English description of the requirements.
 *
 * Google OAuth users bypass this DTO entirely — they have password = null.
 */

import { IsEmail, IsString, MinLength, Matches } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@#$%!&*?])[A-Za-z\d@#$%!&*?]{8,}$/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@#$%!&*?)',
  })
  password!: string;

  @IsString()
  @MinLength(1, { message: 'Display name is required' })
  displayName!: string;
}