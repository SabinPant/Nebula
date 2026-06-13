/**
 * Create Broker Application DTO
 *
 * Validates the broker application form data before it reaches the service.
 * All fields required — validation fails before any database or Cloudinary call.
 *
 * dateOfBirth is received as a string from multipart/form-data and converted
 * to Date via @Type(() => Date) from class-transformer.
 */

import { IsString, IsEmail, MinLength, IsDate } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBrokerApplicationDto {
  @IsString()
  @MinLength(1, { message: 'Full name is required' })
  fullName!: string;

  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  @IsString()
  @MinLength(1, { message: 'Phone number is required' })
  phone!: string;

  @Type(() => Date)
  @IsDate({ message: 'Please provide a valid date of birth' })
  dateOfBirth!: Date;

  @IsString()
  @MinLength(1, { message: 'Document ID number is required' })
  documentIdNumber!: string;

  @IsString()
  @MinLength(20, { message: 'Reason must be at least 20 characters' })
  reason!: string;
}