import { z } from 'zod';

export const CreateCourseDto = z.object({
  slug: z.string().min(3).max(80),
  title: z.string().min(3).max(200),
  description: z.string().max(2000).nullish(),
  price: z.number().int().nonnegative(),
  tutorId: z.string().uuid(),
});

export type CreateCourseDtoType = z.infer<typeof CreateCourseDto>;
