import { Module } from '@nestjs/common';

import { CoursesModule } from '../courses';

import { EnrollmentsService } from './enrollments.service';

@Module({
  imports: [CoursesModule],
  providers: [EnrollmentsService],
  exports: [EnrollmentsService],
})
export class EnrollmentsModule {}
