import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { COURSE_REPOSITORY } from './courses.constants';
import type {
  Course,
  CourseRepository,
  CreateCourseInput,
} from './courses.repository';

@Injectable()
export class CoursesService {
  constructor(
    @Inject(COURSE_REPOSITORY)
    private readonly repo: CourseRepository,
  ) {}

  async findById(id: string): Promise<Course> {
    const c = await this.repo.findById(id);
    if (!c) {
      throw new NotFoundException('Course không tồn tại');
    }
    return c;
  }

  async create(input: CreateCourseInput): Promise<Course> {
    return this.repo.insert(input);
  }
}
