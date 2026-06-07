/**
 * Forgot Password DTO
 *
 * Accepts an email address to send a password reset link.
 * Rate limited to 3 requests per hour per email address.
 */

import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;
}