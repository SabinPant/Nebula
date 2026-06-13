/**
 * Broker Setup DTO
 *
 * Validates the broker account setup payload.
 * Token is a UUID v4 from the invitation link.
 * Password follows the same strength rules as trader registration.
 */

import { IsString, IsUUID, Matches, MinLength } from 'class-validator';

export class BrokerSetupDto {
  @IsUUID('4', { message: 'Invalid setup token' })
  token!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@#$%!&*?])[A-Za-z\d@#$%!&*?]{8,}$/,
    {
      message:
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@#$%!&*?)',
    },
  )
  password!: string;

  @IsUUID('4', { message: 'A valid device ID is required' })
  deviceId!: string;
}