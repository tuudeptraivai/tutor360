import { CustomDecorator, SetMetadata } from '@nestjs/common';

import type { UserRole } from '../../modules/users/users.constants';

export const ROLES_KEY = 'roles';

/**
 * Attaches required roles to a route for the (future) RolesGuard.
 *
 * Scaffold only — RolesGuard reads this metadata in V09.
 */
export const Roles = (...roles: UserRole[]): CustomDecorator<string> =>
  SetMetadata(ROLES_KEY, roles);
