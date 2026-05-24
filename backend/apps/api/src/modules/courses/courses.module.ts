import { Module } from '@nestjs/common';

import { COURSE_REPOSITORY } from './courses.constants';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';
import { InMemoryCourseRepository } from './repositories/in-memory.repository';

@Module({
  providers: [
    CoursesService,
    { provide: COURSE_REPOSITORY, useClass: InMemoryCourseRepository },
  ],
  controllers: [CoursesController],
  exports: [CoursesService, COURSE_REPOSITORY],
})
export class CoursesModule {}
