export { CoursesModule } from './courses.module';
export { CoursesService } from './courses.service';
export { COURSE_REPOSITORY } from './courses.constants';
export type {
  CourseRepository,
  Course,
  CreateCourseInput,
} from './courses.repository';
export { CreateCourseDto } from './dto/create-course.dto';
// Internal repo impl is intentionally NOT re-exported (slide 10 — no impl leak).
