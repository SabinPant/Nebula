/**
 * ResolveFlagDto
 *
 * Validates the flag-resolution payload before it reaches the service layer.
 * status is restricted to RESOLVED | DISMISSED — OPEN is the initial state a
 * flag is created with (BrokerService.createFlag) and is never a valid
 * target for this endpoint.
 */

import { IsIn, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { FlagStatus } from '@prisma/client';

export class ResolveFlagDto {
  @IsIn([FlagStatus.RESOLVED, FlagStatus.DISMISSED], {
    message: 'Status must be either RESOLVED or DISMISSED',
  })
  status!: typeof FlagStatus.RESOLVED | typeof FlagStatus.DISMISSED;

  @IsString()
  @IsNotEmpty({ message: 'Resolution is required' })
  @MinLength(10, { message: 'Resolution must be at least 10 characters' })
  @MaxLength(500, { message: 'Resolution must be at most 500 characters' })
  resolution!: string;
}
