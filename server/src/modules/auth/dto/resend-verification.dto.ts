/**
 * Resend Verification DTO
 *
 * Accepts an email address to resend the verification email.
 * Rate limited to 3 requests per hour per email address.
 * Enumeration-safe — always returns 200 regardless of whether the email exists.
 */

import { IsEmail } from 'class-validator';

export class ResendVerificationDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;
}