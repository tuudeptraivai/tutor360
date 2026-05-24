import 'reflect-metadata';

import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import type { Env } from '../src/config/env.validation';
import { AdminBootstrapGuard } from '../src/common/guards/admin-bootstrap.guard';

const TOKEN = 'x'.repeat(40);

function makeConfig(token: string | undefined): ConfigService<Env, true> {
  return {
    get: (key: string) => ({ ADMIN_BOOTSTRAP_TOKEN: token })[key],
  } as unknown as ConfigService<Env, true>;
}

function makeCtx(headerValue: string | undefined): ExecutionContext {
  const headers: Record<string, string | undefined> = {};
  if (headerValue !== undefined) {
    headers['x-admin-token'] = headerValue;
  }
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('AdminBootstrapGuard', () => {
  it('rejects when the header is missing', () => {
    const guard = new AdminBootstrapGuard(makeConfig(TOKEN));
    expect(() => guard.canActivate(makeCtx(undefined))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a wrong token', () => {
    const guard = new AdminBootstrapGuard(makeConfig(TOKEN));
    expect(() => guard.canActivate(makeCtx('y'.repeat(40)))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token of a different length', () => {
    const guard = new AdminBootstrapGuard(makeConfig(TOKEN));
    expect(() => guard.canActivate(makeCtx('short'))).toThrow(
      UnauthorizedException,
    );
  });

  it('passes with the correct token', () => {
    const guard = new AdminBootstrapGuard(makeConfig(TOKEN));
    expect(guard.canActivate(makeCtx(TOKEN))).toBe(true);
  });

  it('fail-closed: rejects every request when the env token is unset', () => {
    const guard = new AdminBootstrapGuard(makeConfig(undefined));
    expect(() => guard.canActivate(makeCtx(TOKEN))).toThrow(
      UnauthorizedException,
    );
  });
});
