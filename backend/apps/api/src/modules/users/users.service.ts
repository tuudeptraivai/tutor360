import { Inject, Injectable } from '@nestjs/common';

import { USER_REPOSITORY } from './users.constants';
import type {
  CreateUserInput,
  UpdateUserInput,
  User,
  UsersRepository,
} from './users.repository';

@Injectable()
export class UsersService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly repo: UsersRepository,
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
}
