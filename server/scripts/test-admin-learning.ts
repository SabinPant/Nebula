/**
 * End-to-end test for Admin Learning Content Management.
 *
 * Not a Jest suite — drives the REAL running server's HTTP API with real
 * signed JWTs (admin via actual login, trader via a signed test token —
 * same pattern as test-admin-reassign-broker.ts / test-admin-flags.ts).
 *
 * Covers:
 *   - Non-admin token -> 403 on GET/POST/PATCH/DELETE /admin/learning
 *   - GET /admin/learning is page-based (page/totalPages/totalCount/limit
 *     shape) and includes UNPUBLISHED resources (unlike the public
 *     GET /learning, which only returns published ones)
 *   - POST /admin/learning: validation (missing title/slug/etc -> 400),
 *     invalid slug format -> 400, invalid tier -> 400
 *   - POST /admin/learning happy path: 201, resource appears in
 *     GET /admin/learning, defaults (isPublished=false, tier=FREE,
 *     order=0) apply when omitted
 *   - Duplicate slug -> 409 DUPLICATE_SLUG
 *   - PATCH /admin/learning/:id: partial update (only title changes),
 *     invalid slug format on update -> 400, nonexistent id -> 404
 *   - PATCH toggling isPublished true makes it visible on the PUBLIC
 *     GET /learning/:slug (round-trips through the real public read path,
 *     not just the DB)
 *   - DELETE /admin/learning/:id: happy path (200, gone from
 *     GET /admin/learning), nonexistent id -> 404
 *
 * Run with: npx tsx scripts/test-admin-learning.ts (from server/)
 * Requires the server already running on TEST_SERVER_URL (default
 * http://localhost:3001/api/v1), Postgres + Redis reachable per
 * .env.development, and the seed already applied (admin@nebula.com /
 * ChangeMe123!).
 */

import { PrismaClient, UserType } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: path.resolve(__dirname, '..', '.env.development') });

const prisma = new PrismaClient();

const SERVER_URL = process.env.TEST_SERVER_URL || 'http://localhost:3001/api/v1';
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const ADMIN_EMAIL = 'admin@nebula.com';
const ADMIN_PASSWORD = 'ChangeMe123!';
const SLUG_PREFIX = 'admin-learning-test';

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

// ─── HTTP helpers ────────────────────────────────────────────────────────

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

async function apiPatch<T>(
  urlPath: string,
  token: string | null,
  body: unknown,
): Promise<ApiResult<T>> {
  const res = await fetch(`${SERVER_URL}${urlPath}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json as T };
}

async function apiPost<T>(
  urlPath: string,
  token: string | null,
  body: unknown,
): Promise<ApiResult<T>> {
  const res = await fetch(`${SERVER_URL}${urlPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json as T };
}

async function apiDelete<T>(urlPath: string, token: string | null): Promise<ApiResult<T>> {
  const res = await fetch(`${SERVER_URL}${urlPath}`, {
    method: 'DELETE',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json as T };
}

// ─── Test JWT signing ────────────────────────────────────────────────────

function signTestAccessToken(userId: string, email: string, userType: UserType): string {
  if (!JWT_ACCESS_SECRET) {
    throw new Error('JWT_ACCESS_SECRET not found in .env.development — cannot sign test tokens');
  }
  return jwt.sign(
    { sub: userId, email, userType, jti: randomUUID() },
    JWT_ACCESS_SECRET,
    { expiresIn: '15m' },
  );
}

async function loginAsAdmin(): Promise<string> {
  const deviceId = randomUUID();
  const { status, body } = await apiPost<{ accessToken?: string }>('/auth/login', null, {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    deviceId,
  });
  if (status !== 200 || !body.accessToken) {
    throw new Error(
      `Admin login failed (status ${status}) — did you run "npx prisma db seed" with the ChangeMe123! admin password fix?`,
    );
  }
  return body.accessToken;
}

async function createTestTrader(): Promise<{ id: string; email: string }> {
  const email = `bystander-${randomUUID().slice(0, 8)}@${SLUG_PREFIX}.nebula`;
  const user = await prisma.user.create({
    data: {
      email,
      password: null,
      userType: UserType.TRADER,
      displayName: 'Admin Learning Test Bystander',
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
      isOnboardingComplete: true,
      isFirstLogin: false,
    },
  });
  return { id: user.id, email };
}

// ─── Cleanup ─────────────────────────────────────────────────────────────

async function purgeTestData(): Promise<void> {
  const deleted = await prisma.learningResource.deleteMany({
    where: { slug: { startsWith: SLUG_PREFIX } },
  });
  const deletedUsers = await prisma.user.deleteMany({
    where: { email: { endsWith: `@${SLUG_PREFIX}.nebula` } },
  });
  if (deleted.count > 0 || deletedUsers.count > 0) {
    console.log(
      `  Purged ${deleted.count} leftover resource(s) and ${deletedUsers.count} leftover user(s)`,
    );
  }
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Admin Learning Content Management — end-to-end test\n');

  console.log('Cleaning up any leftovers from a previous run...');
  await purgeTestData();

  console.log('\nLogging in as admin...');
  const adminToken = await loginAsAdmin();
  console.log(`  Logged in as ${ADMIN_EMAIL}`);

  console.log('\nCreating test fixtures...');
  const bystander = await createTestTrader();
  console.log(`  Created bystander trader ${bystander.email}`);

  let createdId = '';
  const slug = `${SLUG_PREFIX}-${randomUUID().slice(0, 8)}`;

  try {
    console.log('\n--- Non-admin token rejected on all four routes (403) ---');
    {
      const bystanderToken = signTestAccessToken(bystander.id, bystander.email, UserType.TRADER);

      const getRes = await apiGet('/admin/learning', bystanderToken);
      assert(getRes.status === 403, 'GET /admin/learning with a trader token returns 403');

      const postRes = await apiPost('/admin/learning', bystanderToken, {
        title: 'Should be rejected',
        slug: 'should-be-rejected',
        category: 'basics',
        summary: 'x',
        content: 'x',
      });
      assert(postRes.status === 403, 'POST /admin/learning with a trader token returns 403');

      const patchRes = await apiPatch(`/admin/learning/${randomUUID()}`, bystanderToken, {
        title: 'x',
      });
      assert(patchRes.status === 403, 'PATCH /admin/learning/:id with a trader token returns 403');

      const deleteRes = await apiDelete(`/admin/learning/${randomUUID()}`, bystanderToken);
      assert(deleteRes.status === 403, 'DELETE /admin/learning/:id with a trader token returns 403');
    }

    console.log('\n--- Validation: missing required fields (400) ---');
    {
      const { status } = await apiPost('/admin/learning', adminToken, {
        title: 'Missing everything else',
      });
      assert(status === 400, 'POST with missing slug/category/summary/content returns 400');
    }

    console.log('\n--- Validation: invalid slug format (400) ---');
    {
      const { status, body } = await apiPost<{ code?: string }>('/admin/learning', adminToken, {
        title: 'Bad Slug Test',
        slug: 'Not A Valid Slug!',
        category: 'basics',
        summary: 'A summary.',
        content: 'Some content.',
      });
      assert(status === 400, 'POST with an invalid slug format returns 400');
      assert(body.code === 'VALIDATION_ERROR', 'Error code is VALIDATION_ERROR');
    }

    console.log('\n--- Validation: invalid tier (400) ---');
    {
      const { status } = await apiPost('/admin/learning', adminToken, {
        title: 'Bad Tier Test',
        slug: `${slug}-badtier`,
        category: 'basics',
        summary: 'A summary.',
        content: 'Some content.',
        tier: 'GOLD',
      });
      assert(status === 400, 'POST with an invalid tier value returns 400');
    }

    console.log('\n--- Happy path: create a resource (defaults applied) ---');
    {
      const { status, body } = await apiPost<{
        id: string;
        title: string;
        slug: string;
        isPublished: boolean;
        tier: string;
        order: number;
      }>('/admin/learning', adminToken, {
        title: 'Admin Learning Test Article',
        slug,
        category: 'basics',
        summary: 'A test article summary.',
        content: '# Heading\n\nSome **markdown** content.',
      });
      assert(status === 201, 'POST /admin/learning returns 201');
      assert(body.slug === slug, 'Created resource slug matches');
      assert(body.isPublished === false, 'Default isPublished is false');
      assert(body.tier === 'FREE', 'Default tier is FREE');
      assert(body.order === 0, 'Default order is 0');
      createdId = body.id;
    }

    console.log('\n--- Created resource appears in GET /admin/learning (page-based shape) ---');
    {
      const { status, body } = await apiGet<{
        data: Array<{ id: string; slug: string; isPublished: boolean }>;
        pagination: { page: number; totalPages: number; totalCount: number; limit: number };
      }>('/admin/learning?limit=50', adminToken);

      assert(status === 200, 'GET /admin/learning returns 200');
      assert(typeof body.pagination?.totalCount === 'number', 'Response has page-based pagination shape');
      assert(typeof body.pagination?.totalPages === 'number', 'pagination.totalPages present');
      const found = body.data.find((r) => r.id === createdId);
      assert(!!found, 'Created (unpublished) resource is listed by admin GET, unlike the public endpoint');
    }

    console.log('\n--- Unpublished resource is invisible on the public GET /learning/:slug ---');
    {
      const res = await fetch(`${SERVER_URL}/learning/${slug}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert(res.status === 404, 'Public GET /learning/:slug 404s while unpublished');
    }

    console.log('\n--- Duplicate slug (409 DUPLICATE_SLUG) ---');
    {
      const { status, body } = await apiPost<{ code?: string }>('/admin/learning', adminToken, {
        title: 'Duplicate Slug Attempt',
        slug,
        category: 'basics',
        summary: 'A summary.',
        content: 'Some content.',
      });
      assert(status === 409, 'POST with an already-used slug returns 409');
      assert(body.code === 'DUPLICATE_SLUG', 'Error code is DUPLICATE_SLUG');
    }

    console.log('\n--- PATCH: partial update (only title changes) ---');
    {
      const { status, body } = await apiPatch<{
        title: string;
        slug: string;
        summary: string;
      }>(`/admin/learning/${createdId}`, adminToken, {
        title: 'Admin Learning Test Article (Updated)',
      });
      assert(status === 200, 'PATCH /admin/learning/:id returns 200');
      assert(body.title === 'Admin Learning Test Article (Updated)', 'Title updated');
      assert(body.slug === slug, 'Slug unchanged when not sent in the PATCH body');
      assert(body.summary === 'A test article summary.', 'Summary unchanged when not sent');
    }

    console.log('\n--- PATCH: invalid slug format on update (400) ---');
    {
      const { status } = await apiPatch(`/admin/learning/${createdId}`, adminToken, {
        slug: 'Invalid Slug!!',
      });
      assert(status === 400, 'PATCH with an invalid slug format returns 400');
    }

    console.log('\n--- PATCH: nonexistent id (404) ---');
    {
      const { status, body } = await apiPatch<{ code?: string }>(
        `/admin/learning/${randomUUID()}`,
        adminToken,
        { title: 'Does not matter' },
      );
      assert(status === 404, 'PATCH on a nonexistent id returns 404');
      assert(body.code === 'NOT_FOUND', 'Error code is NOT_FOUND');
    }

    console.log('\n--- PATCH: publishing makes it visible on the public endpoint ---');
    {
      const { status } = await apiPatch(`/admin/learning/${createdId}`, adminToken, {
        isPublished: true,
      });
      assert(status === 200, 'PATCH isPublished:true returns 200');

      const res = await fetch(`${SERVER_URL}/learning/${slug}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const publicBody = await res.json();
      assert(res.status === 200, 'Public GET /learning/:slug now returns 200');
      assert(
        publicBody.title === 'Admin Learning Test Article (Updated)',
        'Public read reflects the updated title',
      );
    }

    console.log('\n--- DELETE: happy path ---');
    {
      const { status, body } = await apiDelete<{ message: string }>(
        `/admin/learning/${createdId}`,
        adminToken,
      );
      assert(status === 200, 'DELETE /admin/learning/:id returns 200');
      assert(body.message === 'Learning resource deleted successfully', 'Response message is correct');

      const { body: listBody } = await apiGet<{ data: Array<{ id: string }> }>(
        '/admin/learning?limit=50',
        adminToken,
      );
      assert(
        !listBody.data.some((r) => r.id === createdId),
        'Deleted resource no longer appears in GET /admin/learning',
      );
    }

    console.log('\n--- DELETE: nonexistent id (404) ---');
    {
      const { status, body } = await apiDelete<{ code?: string }>(
        `/admin/learning/${randomUUID()}`,
        adminToken,
      );
      assert(status === 404, 'DELETE on a nonexistent id returns 404');
      assert(body.code === 'NOT_FOUND', 'Error code is NOT_FOUND');
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
