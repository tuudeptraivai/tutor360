import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { ZodBody } from '../../common/decorators';

import { CoursesService } from './courses.service';
import { toPublicCourse, type PublicCourseDto } from './courses.mapper';
import {
  CreateCourseDto,
  type CreateCourseDtoType,
} from './dto/create-course.dto';

@Controller('courses')
export class CoursesController {
  constructor(private readonly service: CoursesService) {}

  @Get(':id')
  async findById(@Param('id') id: string): Promise<PublicCourseDto> {
    const course = await this.service.findById(id);
    return toPublicCourse(course);
  }

  @Post()
  async create(
    @ZodBody(CreateCourseDto) body: CreateCourseDtoType,
  ): Promise<PublicCourseDto> {
    const course = await this.service.create(body);
    return toPublicCourse(course);
  }
}
