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
}

export interface UpdateUserInput {
  status?: UserStatus;
  emailVerifiedAt?: Date | null;
}

export interface UsersRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  insert(input: CreateUserInput): Promise<User>;
  update(id: string, patch: UpdateUserInput): Promise<User>;
}
