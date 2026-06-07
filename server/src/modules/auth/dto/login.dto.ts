/**
 * Login DTO
 *
 * Validates login credentials before authentication.
 * deviceId is required for multi-device session management —
 * each device gets its own refresh token, can be revoked independently.
 */

import { IsEmail, IsString, IsUUID, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  @IsString()
  @MinLength(1, { message: 'Password is required' })
  password!: string;

  @IsUUID('4', { message: 'A valid device ID is required' })
  deviceId!: string;
}