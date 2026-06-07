/**
 * Verify Email DTO
 *
 * Accepts the verification token sent to the user's email.
 * Token is a UUID v4 stored in Redis with 24h TTL — single-use,
 * deleted immediately after successful verification.
 */

import { IsUUID } from 'class-validator';

export class VerifyEmailDto {
  @IsUUID('4', { message: 'Invalid verification token' })
  token!: string;
}