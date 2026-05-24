import { z } from 'zod';

import { COURSE_STATUSES } from './courses.constants';

/**
 * Zod schema phản chiếu `PublicCourseDto` — chỉ phục vụ Swagger documentation,
 * không dùng cho validation runtime.
 */
export const PublicCourseSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  price: z.number().int().nonnegative(),
  status: z.enum(COURSE_STATUSES),
  tutorId: z.string().uuid(),
  createdAt: z.string().datetime(),
  publishedAt: z.string().datetime().nullable(),
});
