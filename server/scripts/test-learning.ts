/**
 * End-to-end test for the Learning Resources module (Sprint 12).
 *
 * Not a Jest suite — drives the REAL running server's HTTP API with a real
 * signed JWT, exactly like a genuine client would. Covers:
 *
 *   - GET /learning            (published list, optional ?category=)
 *   - GET /learning/categories (category counts)
 *   - GET /learning/:slug      (single article detail)
 *   - 404 on an unpublished article's slug
 *   - category filter narrows results correctly
 *
 * Test articles are created directly via Prisma (mirroring
 * LearningRepository.create) rather than through an HTTP POST — Sprint 12
 * only wires the public read routes; POST /admin/learning is Sprint 13.
 * Creating through Prisma here exercises the exact same repository method
 * the eventual admin route will call.
 *
 * Run with: npx tsx scripts/test-learning.ts (from server/)
 * Requires the server already running on TEST_SERVER_URL (default
 * http://localhost:3001/api/v1), and Postgres reachable per .env.development.
 */

import { PrismaClient, ResourceTier } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: path.resolve(__dirname, '..', '.env.development') });

const prisma = new PrismaClient();

const SERVER_URL = process.env.TEST_SERVER_URL || 'http://localhost:3001/api/v1';
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const TEST_EMAIL_DOMAIN = 'learning-test.nebula';
const TEST_SLUG_PREFIX = 'test-learning-';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${message}`);
  } else {
    failed++;
    console.error(`  \x1b[31m✗\x1b[0m ${message}`);
  }
}

// ─── Test JWT signing ────────────────────────────────────────────────────
// Signs a real access token with the same secret/shape the server's own
// generateAccessToken() produces — drives the actual JwtStrategy/
// JwtAuthGuard path, not a mock.

function signTestAccessToken(userId: string, email: string): string {
  if (!JWT_ACCESS_SECRET) {
    throw new Error('JWT_ACCESS_SECRET not found in .env.development — cannot sign test tokens');
  }
  return jwt.sign(
    { sub: userId, email, userType: 'TRADER', jti: randomUUID() },
    JWT_ACCESS_SECRET,
    { expiresIn: '15m' },
  );
}

// ─── HTTP helper ─────────────────────────────────────────────────────────

interface ApiResult<T> {
  status: number;
  body: T;
}

async function apiGet<T>(urlPath: string, token: string): Promise<ApiResult<T>> {
  const res = await fetch(`${SERVER_URL}${urlPath}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json as T };
}

// ─── Test user setup ─────────────────────────────────────────────────────

interface TestUser {
  id: string;
  email: string;
  token: string;
}

async function createTestTrader(): Promise<TestUser> {
  const email = `reader-${randomUUID().slice(0, 8)}@${TEST_EMAIL_DOMAIN}`;
  const user = await prisma.user.create({
    data: {
      email,
      password: null,
      userType: 'TRADER',
      displayName: 'Learning Test Reader',
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
      isOnboardingComplete: true,
      isFirstLogin: false,
    },
  });
  return { id: user.id, email, token: signTestAccessToken(user.id, email) };
}

// ─── Test article fixtures ───────────────────────────────────────────────

async function createTestArticles() {
  const published1 = await prisma.learningResource.create({
    data: {
      title: 'Test Article: Basics One',
      slug: `${TEST_SLUG_PREFIX}basics-one`,
      category: `${TEST_SLUG_PREFIX}category-a`,
      tier: ResourceTier.FREE,
      content: 'Test content for basics one. '.repeat(20),
      summary: 'A test article in category A.',
      isPublished: true,
      order: 1,
    },
  });

  const published2 = await prisma.learningResource.create({
    data: {
      title: 'Test Article: Strategy One',
      slug: `${TEST_SLUG_PREFIX}strategy-one`,
      category: `${TEST_SLUG_PREFIX}category-b`,
      tier: ResourceTier.FREE,
      content: 'Test content for strategy one. '.repeat(20),
      summary: 'A test article in category B.',
      isPublished: true,
      order: 2,
    },
  });

  const unpublished = await prisma.learningResource.create({
    data: {
      title: 'Test Article: Unpublished Draft',
      slug: `${TEST_SLUG_PREFIX}unpublished-draft`,
      category: `${TEST_SLUG_PREFIX}category-a`,
      tier: ResourceTier.FREE,
      content: 'Draft content, should never be publicly visible.',
      summary: 'An unpublished draft.',
      isPublished: false,
      order: 3,
    },
  });

  return { published1, published2, unpublished };
}

// ─── Cleanup ─────────────────────────────────────────────────────────────

async function purgeTestData(): Promise<void> {
  const deletedArticles = await prisma.learningResource.deleteMany({
    where: { slug: { startsWith: TEST_SLUG_PREFIX } },
  });
  const testUsers = await prisma.user.findMany({
    where: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } },
    select: { id: true },
  });
  const userIds = testUsers.map((u) => u.id);
  if (userIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  console.log(
    `  Purged ${deletedArticles.count} test article(s) and ${userIds.length} test user(s)`,
  );
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Learning Resources — end-to-end test\n');

  console.log('Cleaning up any leftovers from a previous run...');
  await purgeTestData();

  console.log('\nCreating test fixtures...');
  const reader = await createTestTrader();
  const { published1, published2, unpublished } = await createTestArticles();
  console.log(`  Created reader user: ${reader.email}`);
  console.log(`  Created 2 published + 1 unpublished test article`);

  try {
    console.log('\n--- GET /learning (published list) ---');
    {
      const { status, body } = await apiGet<Array<{ slug: string }>>('/learning', reader.token);
      assert(status === 200, 'GET /learning returns 200');
      const slugs = body.map((a) => a.slug);
      assert(slugs.includes(published1.slug), 'List includes published article 1');
      assert(slugs.includes(published2.slug), 'List includes published article 2');
      assert(!slugs.includes(unpublished.slug), 'List excludes the unpublished draft');
    }

    console.log('\n--- GET /learning/categories ---');
    {
      const { status, body } = await apiGet<Array<{ category: string; count: number }>>(
        '/learning/categories',
        reader.token,
      );
      assert(status === 200, 'GET /learning/categories returns 200');
      const catA = body.find((c) => c.category === `${TEST_SLUG_PREFIX}category-a`);
      const catB = body.find((c) => c.category === `${TEST_SLUG_PREFIX}category-b`);
      assert(!!catA, 'Category A present in category list');
      assert(catA?.count === 1, 'Category A count reflects only the published article (unpublished excluded)');
      assert(!!catB, 'Category B present in category list');
      assert(catB?.count === 1, 'Category B count is 1');
    }

    console.log('\n--- GET /learning?category=... (filter) ---');
    {
      const { status, body } = await apiGet<Array<{ slug: string }>>(
        `/learning?category=${TEST_SLUG_PREFIX}category-a`,
        reader.token,
      );
      assert(status === 200, 'GET /learning?category=... returns 200');
      const slugs = body.map((a) => a.slug);
      assert(slugs.includes(published1.slug), 'Filtered list includes the category A article');
      assert(!slugs.includes(published2.slug), 'Filtered list excludes the category B article');
    }

    console.log('\n--- GET /learning/:slug (published detail) ---');
    {
      const { status, body } = await apiGet<{ slug: string; title: string; content: string }>(
        `/learning/${published1.slug}`,
        reader.token,
      );
      assert(status === 200, 'GET /learning/:slug returns 200 for a published article');
      assert(body.slug === published1.slug, 'Returned article has the correct slug');
      assert(body.title === published1.title, 'Returned article has the correct title');
    }

    console.log('\n--- GET /learning/:slug (unpublished → 404) ---');
    {
      const { status, body } = await apiGet<{ code?: string }>(
        `/learning/${unpublished.slug}`,
        reader.token,
      );
      assert(status === 404, 'GET /learning/:slug returns 404 for an unpublished article');
      assert(body.code === 'NOT_FOUND', 'Error body has code NOT_FOUND');
    }

    console.log('\n--- GET /learning/:slug (nonexistent → 404) ---');
    {
      const { status } = await apiGet(`/learning/${TEST_SLUG_PREFIX}does-not-exist`, reader.token);
      assert(status === 404, 'GET /learning/:slug returns 404 for a nonexistent slug');
    }

    console.log('\n--- Auth required ---');
    {
      const res = await fetch(`${SERVER_URL}/learning`);
      assert(res.status === 401, 'GET /learning without a token returns 401');
    }
  } finally {
    console.log('\nCleaning up test fixtures...');
    await purgeTestData();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (error) => {
  console.error('Test script crashed:', error);
  await purgeTestData().catch(() => {});
  await prisma.$disconnect();
  process.exit(1);
});
