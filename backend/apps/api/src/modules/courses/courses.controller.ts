import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { ZodBody } from '../../common/decorators';
import { ApiErrorEnvelope, ApiOkEnvelope } from '../../common/openapi';

import { CoursesService } from './courses.service';
import { toPublicCourse, type PublicCourseDto } from './courses.mapper';
import { PublicCourseSchema } from './courses.openapi';
import {
  CreateCourseDto,
  type CreateCourseDtoType,
} from './dto/create-course.dto';

@ApiTags('courses')
@Controller('courses')
export class CoursesController {
  constructor(private readonly service: CoursesService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Lấy thông tin một course theo id' })
  @ApiParam({ name: 'id', required: true, schema: { type: 'string' } })
  @ApiOkEnvelope(PublicCourseSchema, 200)
  @ApiErrorEnvelope(404)
  async findById(@Param('id') id: string): Promise<PublicCourseDto> {
    const course = await this.service.findById(id);
    return toPublicCourse(course);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo một course mới' })
  @ApiOkEnvelope(PublicCourseSchema, 201)
  @ApiErrorEnvelope(400, 'VALIDATION_ERROR')
  async create(
    @ZodBody(CreateCourseDto) body: CreateCourseDtoType,
  ): Promise<PublicCourseDto> {
    const course = await this.service.create(body);
    return toPublicCourse(course);
  }
}
