/**
 * UpdateLearningResourceDto
 *
 * Validates a learning resource edit payload. Every field is optional —
 * a PATCH sends only what changed. Slug format (when provided) is
 * re-validated in LearningService.updateResource (assertValidSlug).
 */

import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ResourceTier } from '@prisma/client';

export class UpdateLearningResourceDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Title cannot be empty' })
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Slug cannot be empty' })
  slug?: string;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Category cannot be empty' })
  category?: string;

  @IsOptional()
  @IsIn([ResourceTier.FREE, ResourceTier.PREMIUM], {
    message: 'Tier must be either FREE or PREMIUM',
  })
  tier?: ResourceTier;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Content cannot be empty' })
  content?: string;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Summary cannot be empty' })
  summary?: string;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsInt({ message: 'Order must be an integer' })
  order?: number;
}
