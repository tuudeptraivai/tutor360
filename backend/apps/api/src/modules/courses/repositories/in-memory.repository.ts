import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type {
  Course,
  CourseRepository,
  CreateCourseInput,
} from '../courses.repository';

@Injectable()
export class InMemoryCourseRepository implements CourseRepository {
  private readonly store = new Map<string, Course>();

  async findById(id: string): Promise<Course | null> {
    return this.store.get(id) ?? null;
  }

  async insert(input: CreateCourseInput): Promise<Course> {
    const course: Course = {
      id: randomUUID(),
      slug: input.slug,
      title: input.title,
      description: input.description ?? null,
      price: input.price,
      status: 'draft',
      tutorId: input.tutorId,
      createdAt: new Date(),
      publishedAt: null,
    };
    this.store.set(course.id, course);
    return course;
  }
}
