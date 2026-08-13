/**
 * Learning Repository
 *
 * Database access layer for the LearningResource model.
 * Contains Prisma queries ONLY — zero business logic, zero validation.
 */

import { Injectable } from '@nestjs/common';
import { LearningResource, Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';

export interface CategoryCount {
  category: string;
  count: number;
}

@Injectable()
export class LearningRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns published articles, optionally filtered by category.
   * Ordered by `order` ascending, then `createdAt` descending.
   */
  async findPublishedResources(category?: string): Promise<LearningResource[]> {
    return this.prisma.learningResource.findMany({
      where: {
        isPublished: true,
        ...(category ? { category } : {}),
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Returns a single published article by slug. Returns null if the
   * slug does not exist or the article is unpublished.
   */
  async findBySlug(slug: string): Promise<LearningResource | null> {
    return this.prisma.learningResource.findFirst({
      where: { slug, isPublished: true },
    });
  }

  /**
   * Returns distinct categories among published articles, with the
   * number of published articles in each.
   */
  async findCategories(): Promise<CategoryCount[]> {
    const grouped = await this.prisma.learningResource.groupBy({
      by: ['category'],
      where: { isPublished: true },
      _count: { _all: true },
      orderBy: { category: 'asc' },
    });

    return grouped.map((g) => ({ category: g.category, count: g._count._all }));
  }

  /**
   * Returns all articles including unpublished ones. For Admin panel use.
   */
  async findAll(): Promise<LearningResource[]> {
    return this.prisma.learningResource.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Returns a single article by ID regardless of publish status.
   * For Admin panel use.
   */
  async findById(id: string): Promise<LearningResource | null> {
    return this.prisma.learningResource.findUnique({ where: { id } });
  }

  /**
   * Creates a new learning resource.
   */
  async create(data: Prisma.LearningResourceCreateInput): Promise<LearningResource> {
    return this.prisma.learningResource.create({ data });
  }

  /**
   * Updates an existing learning resource by ID.
   */
  async update(
    id: string,
    data: Prisma.LearningResourceUpdateInput,
  ): Promise<LearningResource> {
    return this.prisma.learningResource.update({ where: { id }, data });
  }

  /**
   * Deletes a learning resource by ID.
   */
  async delete(id: string): Promise<LearningResource> {
    return this.prisma.learningResource.delete({ where: { id } });
  }
}
