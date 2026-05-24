import type { CourseStatus } from './courses.constants';
import type { Course } from './courses.repository';

export interface PublicCourseDto {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  price: number;
  status: CourseStatus;
  tutorId: string;
  createdAt: Date;
  publishedAt: Date | null;
}

export function toPublicCourse(c: Course): PublicCourseDto {
  return {
    id: c.id,
    slug: c.slug,
    title: c.title,
    description: c.description ?? null,
    price: c.price,
    status: c.status,
    tutorId: c.tutorId,
    createdAt: c.createdAt,
    publishedAt: c.publishedAt,
  };
}
