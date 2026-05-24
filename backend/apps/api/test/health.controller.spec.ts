import { describe, expect, it, vi } from 'vitest';

import { HealthController } from '../src/health/health.controller';
import type { PrismaService } from '../src/prisma/prisma.service';

describe('HealthController', () => {
  it('returns ok status when the database is reachable', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    } as unknown as PrismaService;

    const controller = new HealthController(prisma);
    const result = await controller.check();

    expect(result.status).toBe('ok');
    expect(result.db).toBe('up');
    expect(typeof result.ts).toBe('string');
  });

  it('returns degraded status when the database query fails', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockRejectedValue(new Error('down')),
    } as unknown as PrismaService;

    const controller = new HealthController(prisma);
    const result = await controller.check();

    expect(result.status).toBe('degraded');
    expect(result.db).toBe('down');
  });
});
