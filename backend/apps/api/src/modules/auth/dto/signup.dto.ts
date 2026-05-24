import { z } from 'zod';

// Self-service signup không cho phép chọn role (privilege escalation).
// Server luôn gán role = 'user'. `.strict()` reject mọi extra field (gồm `role`).
export const SignupDto = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    password: z
      .string()
      .min(8, 'Tối thiểu 8 ký tự')
      .regex(/[a-zA-Z]/, 'Phải có ít nhất 1 chữ cái')
      .regex(/[0-9]/, 'Phải có ít nhất 1 số'),
    fullName: z.string().trim().min(2).max(80),
    phone: z
      .string()
      .regex(/^\+?[0-9]{9,14}$/)
      .optional(),
    country: z.string().length(2).default('VN'),
  })
  .strict();

export type SignupDtoType = z.infer<typeof SignupDto>;
