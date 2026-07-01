/**
 * CreateFlagDto
 *
 * Validates suspicious flag payload before it reaches the service layer.
 */

import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateFlagDto {
  @IsString()
  @IsNotEmpty({ message: 'Trader ID is required' })
  @Matches(/^c[a-z0-9]{24}$/, {
    message: 'Trader ID must be a valid CUID',
  })
  traderId!: string;

  @IsString()
  @IsNotEmpty({ message: 'Reason is required' })
  @MinLength(10, { message: 'Reason must be at least 10 characters' })
  @MaxLength(500, { message: 'Reason must be at most 500 characters' })
  reason!: string;

  @IsOptional()
  @IsString({ message: 'Note must be a string' })
  @MaxLength(200, { message: 'Note must be at most 200 characters' })
  note?: string;
}
