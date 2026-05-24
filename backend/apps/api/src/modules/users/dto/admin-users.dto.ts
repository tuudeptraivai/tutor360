import { z } from 'zod';

import { USER_ROLES, USER_STATUSES } from '../users.constants';

export const ListAdminUsersQuery = z
  .object({
    role: z.enum(USER_ROLES).optional(),
    status: z.enum(USER_STATUSES).optional(),
    q: z.string().trim().min(1).max(120).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export type ListAdminUsersQueryType = z.infer<typeof ListAdminUsersQuery>;

export const CreateAdminUserDto = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    password: z
      .string()
      .min(8)
      .regex(/[a-zA-Z]/)
      .regex(/[0-9]/),
    fullName: z.string().trim().min(2).max(80),
    role: z.enum(USER_ROLES), // admin được tạo MỌI role (user, tutor, admin, hanah)
    phone: z
      .string()
      .regex(/^\+?[0-9]{9,14}$/)
      .optional(),
    country: z.string().length(2).default('VN'),
    status: z.enum(USER_STATUSES).default('active'), // admin tạo → active luôn, không cần verify
  })
  .strict();

export type CreateAdminUserDtoType = z.infer<typeof CreateAdminUserDto>;

export const UpdateAdminUserDto = z
  .object({
    fullName: z.string().trim().min(2).max(80).optional(),
    role: z.enum(USER_ROLES).optional(),
    status: z.enum(USER_STATUSES).optional(),
    phone: z
      .string()
      .regex(/^\+?[0-9]{9,14}$/)
      .nullable()
      .optional(),
    country: z.string().length(2).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Patch phải có ít nhất 1 field',
  });

export type UpdateAdminUserDtoType = z.infer<typeof UpdateAdminUserDto>;
