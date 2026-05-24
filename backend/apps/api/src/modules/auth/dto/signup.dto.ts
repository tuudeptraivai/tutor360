import { z } from 'zod';

export const SignupDto = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z
    .string()
    .min(8, 'Tối thiểu 8 ký tự')
    .regex(/[a-zA-Z]/, 'Phải có ít nhất 1 chữ cái')
    .regex(/[0-9]/, 'Phải có ít nhất 1 số'),
  fullName: z.string().trim().min(2).max(80),
  role: z.enum(['tutor', 'student']), // admin tạo bằng seed (V14+)
  phone: z
    .string()
    .regex(/^\+?[0-9]{9,14}$/)
    .optional(),
  country: z.string().length(2).default('VN'),
});

export type SignupDtoType = z.infer<typeof SignupDto>;
