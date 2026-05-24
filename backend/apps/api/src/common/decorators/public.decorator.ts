import { CustomDecorator, SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as public so the (future) JwtAuthGuard can bypass it.
 *
 * Scaffold only — JwtAuthGuard reads this metadata in V07.
 */
export const Public = (): CustomDecorator<string> =>
  SetMetadata(IS_PUBLIC_KEY, true);
