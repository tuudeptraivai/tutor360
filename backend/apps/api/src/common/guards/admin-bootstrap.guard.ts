import { timingSafeEqual } from 'node:crypto';

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.validation';

/**
 * BOOTSTRAP only — replace with JwtAuthGuard + RolesGuard at V09.
 *
 * Temporary auth for `/v1/admin/*` while V07 (JwtAuthGuard) and V09 (RolesGuard)
 * are not yet built. Reads the `x-admin-token` header and constant-time compares
 * it against `ADMIN_BOOTSTRAP_TOKEN`.
 *
 * Fail-closed: if `ADMIN_BOOTSTRAP_TOKEN` is unset, EVERY request is rejected
 * (in all environments, not just production — avoids accidentally leaving the
 * admin routes open in dev).
 */
@Injectable()
export class AdminBootstrapGuard implements CanActivate {
  private readonly logger = new Logger(AdminBootstrapGuard.name);
  private warnedMissingToken = false;

  constructor(private readonly config: ConfigService<Env, true>) {}

  canActivate(ctx: ExecutionContext): boolean {
    const expected = this.config.get('ADMIN_BOOTSTRAP_TOKEN', { infer: true });
    if (!expected) {
      if (!this.warnedMissingToken) {
        this.logger.warn(
          'ADMIN_BOOTSTRAP_TOKEN is not set — all admin routes are rejected (fail-closed).',
        );
        this.warnedMissingToken = true;
      }
      throw new UnauthorizedException('Admin token chưa được cấu hình');
    }

    const req = ctx.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const header = req.headers['x-admin-token'];
    const provided = Array.isArray(header) ? header[0] : header;

    if (!provided || !this.safeEqual(provided, expected)) {
      throw new UnauthorizedException('Admin token không hợp lệ');
    }
    return true;
  }

  private safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) {
      // Compare against itself to keep timing constant, then fail.
      timingSafeEqual(bufA, bufA);
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  }
}
