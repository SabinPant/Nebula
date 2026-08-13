/**
 * Learning Controller
 *
 * REST endpoints for learning resources — published article list,
 * category list, and single-article detail. All routes require a
 * valid JWT (any authenticated user type), matching CLAUDE.md's
 * endpoint reference table.
 *
 * Route order matters: /learning/categories is registered before the
 * catch-all /learning/:slug, otherwise the :slug param route would
 * swallow "categories" as a slug value.
 */

import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LearningService } from './learning.service';

@Controller('learning')
@UseGuards(JwtAuthGuard)
export class LearningController {
  constructor(private readonly learningService: LearningService) {}

  @Get('categories')
  getCategories() {
    return this.learningService.getCategories();
  }

  @Get(':slug')
  getResource(@Param('slug') slug: string) {
    return this.learningService.getResourceBySlug(slug);
  }

  @Get()
  getResources(@Query('category') category?: string) {
    return this.learningService.getPublishedResources(category);
  }
}
