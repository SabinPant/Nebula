/**
 * CreateLearningResourceDto
 *
 * Validates a new learning resource payload before it reaches the
 * service layer. `slug` format itself is re-validated in
 * LearningService.createResource (assertValidSlug) — this DTO only
 * checks it's a non-empty string; the service owns the actual pattern
 * rule so both the admin-CRUD path and any future creation path share
 * one source of truth for what a valid slug looks like.
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

export class CreateLearningResourceDto {
  @IsString()
  @MinLength(1, { message: 'Title is required' })
  title!: string;

  @IsString()
  @MinLength(1, { message: 'Slug is required' })
  slug!: string;

  @IsString()
  @MinLength(1, { message: 'Category is required' })
  category!: string;

  @IsOptional()
  @IsIn([ResourceTier.FREE, ResourceTier.PREMIUM], {
    message: 'Tier must be either FREE or PREMIUM',
  })
  tier?: ResourceTier;

  @IsString()
  @MinLength(1, { message: 'Content is required' })
  content!: string;

  @IsString()
  @MinLength(1, { message: 'Summary is required' })
  summary!: string;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsInt({ message: 'Order must be an integer' })
  order?: number;
}
