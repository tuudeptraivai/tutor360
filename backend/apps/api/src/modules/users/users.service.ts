import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

import type { Env } from '../../config/env.validation';

import { USER_REPOSITORY } from './users.constants';
import type { UserRole, UserStatus } from './users.constants';
import type {
  CreateUserInput,
  ListUsersQuery,
  ListUsersResult,
  UpdateUserInput,
  User,
  UsersRepository,
} from './users.repository';

export interface AdminCreateInput {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
  phone?: string | null;
  country: string;
  status?: UserStatus;
}

export interface AdminUpdatePatch {
  fullName?: string;
  role?: UserRole;
  status?: UserStatus;
  phone?: string | null;
  country?: string;
}

@Injectable()
export class UsersService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly repo: UsersRepository,
    private readonly config: ConfigService<Env, true>,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.repo.findByEmail(email.toLowerCase());
  }

  findById(id: string): Promise<User | null> {
    return this.repo.findById(id);
  }

  create(input: CreateUserInput): Promise<User> {
    return this.repo.insert({ ...input, email: input.email.toLowerCase() });
  }

  update(id: string, patch: UpdateUserInput): Promise<User> {
    return this.repo.update(id, patch);
  }

  list(query: ListUsersQuery): Promise<ListUsersResult> {
    return this.repo.list(query);
  }

  delete(id: string): Promise<void> {
    return this.repo.delete(id);
  }

  async adminCreate(input: AdminCreateInput): Promise<User> {
    const email = input.email.toLowerCase();
    const existing = await this.repo.findByEmail(email);
    if (existing) {
      throw new ConflictException({ code: 'EMAIL_TAKEN' });
    }
    const cost = this.config.get('BCRYPT_COST', { infer: true });
    const passwordHash = await bcrypt.hash(input.password, cost);
    const status = input.status ?? 'active';
    return this.repo.insert({
      email,
      passwordHash,
      role: input.role,
      fullName: input.fullName,
      phone: input.phone ?? null,
      country: input.country,
      status,
      // admin-created accounts are considered verified when active.
      emailVerifiedAt: status === 'active' ? new Date() : null,
    });
  }

  async adminUpdate(id: string, patch: AdminUpdatePatch): Promise<User> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException('User không tồn tại');
    }
    const update: UpdateUserInput = { ...patch };
    if (patch.status === 'active' && existing.emailVerifiedAt === null) {
      update.emailVerifiedAt = new Date();
    }
    return this.repo.update(id, update);
  }
}
