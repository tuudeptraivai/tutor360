import { Module } from '@nestjs/common';

import { InMemoryUsersRepository } from './repositories/in-memory-users.repository';
import { USER_REPOSITORY } from './users.constants';
import { UsersService } from './users.service';

@Module({
  providers: [
    UsersService,
    { provide: USER_REPOSITORY, useClass: InMemoryUsersRepository },
  ],
  exports: [UsersService, USER_REPOSITORY],
})
export class UsersModule {}
