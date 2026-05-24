import 'reflect-metadata';

import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { CoursesService } from '../src/modules/courses/courses.service';
import { InMemoryCourseRepository } from '../src/modules/courses/repositories/in-memory.repository';

const baseInput = {
  slug: 'toan-10',
  title: 'Toán 10 cơ bản',
  price: 500_000,
  tutorId: '11111111-1111-1111-1111-111111111111',
};

function makeService(): CoursesService {
  return new CoursesService(new InMemoryCourseRepository());
}

describe('CoursesService', () => {
  it('findById() throws NotFoundException for an unknown id', async () => {
    const service = makeService();

    await expect(service.findById('does-not-exist')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.findById('does-not-exist')).rejects.toThrow(
      'Course không tồn tại',
    );
  });

  it('create() returns a draft course with a uuid id and createdAt date', async () => {
    const service = makeService();

    const course = await service.create(baseInput);

    expect(course.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(course.status).toBe('draft');
    expect(course.createdAt).toBeInstanceOf(Date);
    expect(course.publishedAt).toBeNull();
    expect(course.slug).toBe(baseInput.slug);
  });

  it('findById() returns a previously created course', async () => {
    const service = makeService();

    const created = await service.create(baseInput);
    const found = await service.findById(created.id);

    expect(found).toEqual(created);
  });
});
