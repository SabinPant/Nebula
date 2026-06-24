import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from './core/database/prisma.service';
import { RedisClient } from './core/database/redis.client';

@Controller('health')
export class HealthController {
  private readonly engineHttpUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisClient: RedisClient,
    private readonly configService: ConfigService,
  ) {
    this.engineHttpUrl = this.configService.get<string>('ENGINE_HTTP_URL') || 'http://localhost:3003';
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async check() {
    let db = 'disconnected';
    let redis = 'disconnected';
    let engine = 'down';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = 'connected';
    } catch {}

    try {
      await this.redisClient.getClient().ping();
      redis = 'connected';
    } catch {}

    try {
      const res = await fetch(`${this.engineHttpUrl}/health`);
      if (res.ok) {
        const body = await res.json();
        engine = body.status === 'ok' ? 'up' : 'down';
      }
    } catch {}

    return {
      status: db === 'connected' && redis === 'connected' ? 'ok' : 'degraded',
      db,
      redis,
      engine,
      timestamp: new Date().toISOString(),
    };
  }
}