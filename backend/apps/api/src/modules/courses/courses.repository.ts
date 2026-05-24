import type { CourseStatus } from './courses.constants';

export interface Course {
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

export interface CreateCourseInput {
  slug: string;
  title: string;
  description?: string | null;
  price: number;
  tutorId: string;
}

export interface CourseRepository {
  findById(id: string): Promise<Course | null>;
  insert(input: CreateCourseInput): Promise<Course>;
}
