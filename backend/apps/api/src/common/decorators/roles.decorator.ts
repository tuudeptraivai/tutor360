import { CustomDecorator, SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

export type AppRole = 'admin' | 'tutor' | 'student';

/**
 * Attaches required roles to a route for the (future) RolesGuard.
 *
 * Scaffold only — RolesGuard reads this metadata in V09.
 */
export const Roles = (...roles: AppRole[]): CustomDecorator<string> =>
  SetMetadata(ROLES_KEY, roles);
