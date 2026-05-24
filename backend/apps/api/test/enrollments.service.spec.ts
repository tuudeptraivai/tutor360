import 'reflect-metadata';

import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CoursesService } from '../src/modules/courses/courses.service';
import { EnrollmentsModule } from '../src/modules/enrollments/enrollments.module';
import { EnrollmentsService } from '../src/modules/enrollments/enrollments.service';

describe('EnrollmentsService (DI hierarchy)', () => {
  let moduleRef: TestingModule;
  let enrollments: EnrollmentsService;
  let courses: CoursesService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [EnrollmentsModule],
    }).compile();

    enrollments = moduleRef.get(EnrollmentsService);
    courses = moduleRef.get(CoursesService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('injects the real CoursesService via DI', () => {
    expect(courses).toBeInstanceOf(CoursesService);
  });

  it('assertCourseExists() resolves for an existing course', async () => {
    const created = await courses.create({
      slug: 'ly-11',
      title: 'Vật lý 11',
      price: 600_000,
      tutorId: '22222222-2222-2222-2222-222222222222',
    });

    await expect(
      enrollments.assertCourseExists(created.id),
    ).resolves.toBeUndefined();
  });

  it('assertCourseExists() throws NotFoundException for a missing course', async () => {
    await expect(
      enrollments.assertCourseExists('missing-course-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
