import { z } from 'zod';

import { USER_ROLES, USER_STATUSES } from './users.constants';

/**
 * Zod schema phản chiếu `AdminUserView` — chỉ phục vụ Swagger documentation,
 * không dùng cho validation runtime. KHÔNG có `passwordHash`.
 */
export const AdminUserViewSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(USER_ROLES),
  status: z.enum(USER_STATUSES),
  fullName: z.string(),
  phone: z.string().nullable(),
  country: z.string(),
  emailVerifiedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const AdminUsersListSchema = z.object({
  items: z.array(AdminUserViewSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});
