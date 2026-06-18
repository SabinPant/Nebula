import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { PrismaService } from './core/database/prisma.service';
import { RedisClient } from './core/database/redis.client';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisClient: RedisClient,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async check() {
    let db = 'disconnected';
    let redis = 'disconnected';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = 'connected';
    } catch {}

    try {
      await this.redisClient.getClient().ping();
      redis = 'connected';
    } catch {}

    return {
      status: db === 'connected' && redis === 'connected' ? 'ok' : 'degraded',
      db,
      redis,
      timestamp: new Date().toISOString(),
    };
  }
}