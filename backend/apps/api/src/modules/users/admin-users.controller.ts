import {
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { ZodBody, ZodParam, ZodQuery } from '../../common/decorators';
import { AdminBootstrapGuard } from '../../common/guards';
import { ApiErrorEnvelope, ApiOkEnvelope } from '../../common/openapi';

import {
  CreateAdminUserDto,
  type CreateAdminUserDtoType,
  ListAdminUsersQuery,
  type ListAdminUsersQueryType,
  UpdateAdminUserDto,
  type UpdateAdminUserDtoType,
} from './dto/admin-users.dto';
import { toAdminUserView, type AdminUserView } from './users.mapper';
import { AdminUserViewSchema, AdminUsersListSchema } from './users.openapi';
import { UsersService } from './users.service';

const UuidSchema = z.string().uuid();

interface AdminUsersListResponse {
  items: AdminUserView[];
  total: number;
  limit: number;
  offset: number;
}

@ApiTags('admin-users')
@ApiSecurity('admin-token')
@Controller({ path: 'admin/users', version: '1' })
// TODO V09: replace AdminBootstrapGuard with JwtAuthGuard + RolesGuard + @Roles('admin')
@UseGuards(AdminBootstrapGuard)
export class AdminUsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users (filter + pagination)' })
  @ApiOkEnvelope(AdminUsersListSchema, 200)
  @ApiErrorEnvelope(401)
  async list(
    @ZodQuery(ListAdminUsersQuery) q: ListAdminUsersQueryType,
  ): Promise<AdminUsersListResponse> {
    const { items, total } = await this.users.list({
      role: q.role,
      status: q.status,
      q: q.q,
      limit: q.limit,
      offset: q.offset,
    });
    return {
      items: items.map(toAdminUserView),
      total,
      limit: q.limit,
      offset: q.offset,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user by id' })
  @ApiOkEnvelope(AdminUserViewSchema, 200)
  @ApiErrorEnvelope(404)
  async getOne(
    @ZodParam('id', UuidSchema) id: string,
  ): Promise<AdminUserView> {
    const user = await this.users.findById(id);
    if (!user) {
      throw new NotFoundException('User không tồn tại');
    }
    return toAdminUserView(user);
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a user with any role (admin only)' })
  @ApiOkEnvelope(AdminUserViewSchema, 201)
  @ApiErrorEnvelope(409, 'EMAIL_TAKEN')
  async create(
    @ZodBody(CreateAdminUserDto) body: CreateAdminUserDtoType,
  ): Promise<AdminUserView> {
    const user = await this.users.adminCreate(body);
    return toAdminUserView(user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a user (role/status/profile)' })
  @ApiOkEnvelope(AdminUserViewSchema, 200)
  @ApiErrorEnvelope(404)
  async update(
    @ZodParam('id', UuidSchema) id: string,
    @ZodBody(UpdateAdminUserDto) body: UpdateAdminUserDtoType,
  ): Promise<AdminUserView> {
    const user = await this.users.adminUpdate(id, body);
    return toAdminUserView(user);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a user (hard delete)' })
  @ApiErrorEnvelope(404)
  // TODO V09: forbid delete when target.id === ctx.user.id (CANNOT_DELETE_SELF)
  async remove(@ZodParam('id', UuidSchema) id: string): Promise<void> {
    await this.users.delete(id);
  }
}
