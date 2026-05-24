export { CoursesModule } from './courses.module';
export { CoursesService } from './courses.service';
export { COURSE_REPOSITORY } from './courses.constants';
export type {
  CourseRepository,
  Course,
  CreateCourseInput,
} from './courses.repository';
export { CreateCourseDto } from './dto/create-course.dto';
// KHÔNG export InMemoryCourseRepository (slide 10 — không leak impl)
