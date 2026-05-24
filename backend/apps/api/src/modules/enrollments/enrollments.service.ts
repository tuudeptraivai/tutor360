import { Injectable } from '@nestjs/common';

import { CoursesService } from '../courses';

@Injectable()
export class EnrollmentsService {
  constructor(private readonly coursesService: CoursesService) {}

  async assertCourseExists(courseId: string): Promise<void> {
    await this.coursesService.findById(courseId);
  }
}
