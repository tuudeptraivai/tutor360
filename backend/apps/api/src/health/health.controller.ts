import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiOkEnvelope } from '../common/openapi';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('health')
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Liveness/readiness check (app + database)' })
  @ApiOkEnvelope(
    {
      type: 'object',
      required: ['status', 'db', 'ts'],
      properties: {
        status: { type: 'string', example: 'ok' },
        db: { type: 'string', example: 'up' },
        ts: { type: 'string', format: 'date-time' },
      },
    },
    200,
  )
  async check(): Promise<{ status: string; db: string; ts: string }> {
    let db = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = 'up';
    } catch {
      db = 'down';
    }

    return {
      status: db === 'up' ? 'ok' : 'degraded',
      db,
      ts: new Date().toISOString(),
    };
  }
}
