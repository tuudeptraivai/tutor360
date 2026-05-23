import { describe, expect, it } from 'vitest';

import { HealthController } from '../src/health/health.controller';

describe('HealthController', () => {
  it('returns ok status', () => {
    const controller = new HealthController();
    expect(controller.check()).toEqual({ status: 'ok' });
  });
});
