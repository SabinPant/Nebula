/**
 * Learning Service
 *
 * Business logic for learning resources — public article listing/detail,
 * category listing, and Admin CRUD (wired to admin routes in Sprint 13).
 *
 * No try/catch — throws typed HttpExceptions, caught by the global filter.
 */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { LearningResource, Prisma } from '@prisma/client';
import { LearningRepository } from './learning.repository';
import { buildPageResponse, type PagePaginatedResponse } from '../../shared/utils/paginate';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

@Injectable()
export class LearningService {
  constructor(private readonly learningRepository: LearningRepository) {}

  /**
   * Returns published resources, optionally filtered by category.
   */
  async getPublishedResources(category?: string): Promise<LearningResource[]> {
    return this.learningRepository.findPublishedResources(category);
  }

  /**
   * Returns a single published resource by slug.
   * Throws NotFoundException if missing or unpublished.
   */
  async getResourceBySlug(slug: string): Promise<LearningResource> {
    const resource = await this.learningRepository.findBySlug(slug);

    if (!resource) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: `Learning resource "${slug}" not found`,
      });
    }

    return resource;
  }

  /**
   * Returns the category list with published-article counts.
   */
  async getCategories() {
    return this.learningRepository.findCategories();
  }

  /**
   * Returns a page-based paginated list of every article, including
   * unpublished. Admin panel only — matches CLAUDE.md's page-based
   * pagination rule for admin management lists (same shape as
   * AdminService.getUsers/getTopUps/getAuditLogs).
   */
  async getAllResources(
    page: number = 1,
    limit: number = 20,
  ): Promise<PagePaginatedResponse<LearningResource>> {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const skip = (safePage - 1) * safeLimit;

    const [resources, totalCount] = await Promise.all([
      this.learningRepository.findAll(skip, safeLimit),
      this.learningRepository.countAll(),
    ]);

    return buildPageResponse(resources, totalCount, safePage, safeLimit);
  }

  /**
   * Returns a single article by ID regardless of publish status.
   * Throws NotFoundException if missing. Admin panel only.
   */
  async getResourceById(id: string): Promise<LearningResource> {
    const resource = await this.learningRepository.findById(id);

    if (!resource) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: `Learning resource with ID "${id}" not found`,
      });
    }

    return resource;
  }

  /**
   * Creates a new learning resource. Validates slug format.
   * Admin panel only.
   */
  async createResource(
    data: Prisma.LearningResourceCreateInput,
  ): Promise<LearningResource> {
    this.assertValidSlug(data.slug);
    return this.learningRepository.create(data);
  }

  /**
   * Updates an existing learning resource. Validates slug format
   * when a new slug is provided. Admin panel only.
   */
  async updateResource(
    id: string,
    data: Prisma.LearningResourceUpdateInput,
  ): Promise<LearningResource> {
    await this.getResourceById(id);

    if (typeof data.slug === 'string') {
      this.assertValidSlug(data.slug);
    }

    return this.learningRepository.update(id, data);
  }

  /**
   * Deletes a learning resource by ID. Admin panel only.
   */
  async deleteResource(id: string): Promise<void> {
    await this.getResourceById(id);
    await this.learningRepository.delete(id);
  }

  /**
   * Validates that a slug is lowercase, hyphenated, alphanumeric —
   * matching the format used across the seeded content (e.g. "what-is-nepse").
   */
  private assertValidSlug(slug: string): void {
    if (!SLUG_PATTERN.test(slug)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message:
          'Slug must be lowercase, alphanumeric, and hyphen-separated (e.g. "what-is-nepse")',
      });
    }
  }
}
