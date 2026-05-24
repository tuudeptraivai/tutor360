import type { UserRole, UserStatus } from './users.constants';

export interface User {
  id: string;
  email: string; // luôn lưu lowercase
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  fullName: string;
  phone: string | null;
  country: string;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  role: UserRole;
  fullName: string;
  phone?: string | null;
  country: string;
  status?: UserStatus;
  emailVerifiedAt?: Date | null;
}

export interface UpdateUserInput {
  status?: UserStatus;
  emailVerifiedAt?: Date | null;
  role?: UserRole;
  fullName?: string;
  phone?: string | null;
  country?: string;
}

export interface ListUsersQuery {
  role?: UserRole;
  status?: UserStatus;
  q?: string; // search trên email + fullName (case-insensitive, substring)
  limit?: number; // default 20, max 100
  offset?: number; // default 0
}

export interface ListUsersResult {
  items: User[];
  total: number;
}

export interface UsersRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  insert(input: CreateUserInput): Promise<User>;
  update(id: string, patch: UpdateUserInput): Promise<User>;
  list(query: ListUsersQuery): Promise<ListUsersResult>;
  delete(id: string): Promise<void>; // hard delete
}
