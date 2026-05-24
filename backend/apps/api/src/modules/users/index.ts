export { UsersModule } from './users.module';
export { UsersService } from './users.service';
export { USER_REPOSITORY, USER_ROLES, USER_STATUSES } from './users.constants';
export type {
  User,
  UsersRepository,
  CreateUserInput,
  UpdateUserInput,
} from './users.repository';
export type { UserRole, UserStatus } from './users.constants';
// Internal repo impl is intentionally NOT re-exported (slide 10 — no impl leak).
