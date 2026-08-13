/**
 * SuspendUserDto
 *
 * Validates the suspend-user payload before it reaches the service layer.
 */

import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class SuspendUserDto {
  @IsString()
  @IsNotEmpty({ message: 'Reason is required' })
  @MinLength(10, { message: 'Reason must be at least 10 characters' })
  @MaxLength(500, { message: 'Reason must be at most 500 characters' })
  reason!: string;
}
